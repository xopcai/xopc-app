import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TOAST_DURATION_SHORT } from '../../constants/toast';
import { useMessages, t } from '../../i18n/messages';
import { dismissOrHome, openChat, useDismissOnHardwareBack } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
import { noteToIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import { invalidateNoteLists, invalidateSessionLists } from '../../query/workspace-sync';
import {
  createTask,
  deleteNote,
  fetchNote,
  recordNoteOpen,
  requestNoteAiEdit,
  updateNote,
  type Note,
} from '../../query/notes';
import { createSession } from '../../query/sessions';
import { useNoteTagsStore } from '../../stores/note-tags-store';
import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

import { NoteAiPanel } from '../notes/ai/NoteAiPanel';
import { readUriAsBase64 } from '../chat/attachment-file-io';
import { composerAttachmentFromBase64 } from '../chat/attachment-file-io-core';
import { pickAttachmentFromSource } from '../chat/attachment-file-io';
import { ComposerAttachmentStrip } from '../chat/composer-attachment-strip';
import { HybridNoteEditor } from '../notes/editor/HybridNoteEditor';
import type { HybridNoteEditorHandle } from '../notes/editor/types';
import { EditorActionBar } from '../notes/editor/EditorActionBar';
import { EditorInsertMenu } from '../notes/editor/EditorInsertMenu';
import { NoteVoiceInputBar } from '../notes/editor/NoteVoiceInputBar';
import { useNoteAttachments } from '../notes/editor/useNoteAttachments';
import { useNoteVoiceInput } from '../notes/editor/useNoteVoiceInput';
import { inlineImageDataUri } from '../notes/editor/editor-inline-image';
import type { NoteEditorAttachment } from '../notes/editor/note-attachment.types';
import { useDebouncedCallback } from '../notes/editor/useDebouncedCallback';
import type { UnifiedEditor } from '../notes/editor/types';
import { NoteDetailHeader, type NoteScreenMode } from '../notes/NoteDetailHeader';
import { NoteTagPickerSheet } from '../notes/NoteTagPickerSheet';
import { mergeRemoteWithLocal } from '../notes/merge-remote-local';
import { getNoteTags, getTagColors } from '../notes/note-tag-utils';
import { NoteViewActionBar } from '../notes/NoteViewActionBar';
import { writeNoteChatPrefill } from '../chat/note-chat-prefill-storage';
import {
  buildNoteChatContextText,
  collectNoteAttachmentsForChat,
  extractVoiceTranscripts,
} from '../notes/note-to-chat-payload';
import {
  blocksToMarkdown,
  blocksToPlainText,
  blocksToReadableText,
  noteToBlocks,
  type NoteAiPatch,
  type NoteBlock,
} from '../notes/note-blocks';
import { countNoteCharacters, resolveDisplayTitle } from '../notes/note-title';
import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  writeLocalNote,
  type LocalNoteSnapshot,
} from '../notes/notes-local';

const VIEW_BOTTOM_BAR_HEIGHT = 64;

function extractCatalystSuggestion(patch: NoteAiPatch): string {
  for (const operation of patch.operations) {
    if (operation.type === 'replaceBlocks' || operation.type === 'insertBlocksAfter') {
      const text = blocksToPlainText(operation.blocks).trim();
      if (text) return text;
    }
  }
  return patch.summary.trim();
}

function firstSuggestionLine(text: string, fallback: string): string {
  const line = text
    .split('\n')
    .map((part) => part.replace(/^[-*\d.\s[\]x]+/i, '').trim())
    .find(Boolean);
  return line || fallback;
}

export function PageScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = typeof idParam === 'string'
    ? idParam
    : Array.isArray(idParam)
      ? idParam[0]
      : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const pm = m.notesPage;
  const noteTags = useNoteTagsStore((s) => s.tags);
  const addNoteTag = useNoteTagsStore((s) => s.addTag);
  const ensureNoteTags = useNoteTagsStore((s) => s.ensureTags);

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(
    () => (id ? readLocalNote(id) : null),
  );
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [editor, setEditor] = useState<UnifiedEditor | null>(null);
  const [contentRevision, setContentRevision] = useState(0);
  const [snackMsg, setSnackMsg] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [screenMode, setScreenMode] = useState<NoteScreenMode>('view');
  const [viewTitle, setViewTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [focusOnEnable, setFocusOnEnable] = useState(false);
  const [catalystSuggestion, setCatalystSuggestion] = useState('');
  const [catalystLoading, setCatalystLoading] = useState(false);
  const [catalystTaskLoading, setCatalystTaskLoading] = useState(false);
  const [catalystChatLoading, setCatalystChatLoading] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [editorHostReady, setEditorHostReady] = useState(Platform.OS === 'web');
  const lastSeedKeyRef = useRef('');

  const blocksRef = useRef<NoteBlock[]>([]);
  const attachmentsRef = useRef<NoteEditorAttachment[]>([]);
  const noteRef = useRef<Note | undefined>(undefined);
  const editorRef = useRef<UnifiedEditor | null>(null);
  const hybridEditorRef = useRef<HybridNoteEditorHandle>(null);
  const syncInFlightRef = useRef(false);
  blocksRef.current = blocks;

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: async () => {
      const remote = await fetchNote(id!);
      try {
        await recordNoteOpen(id!);
      } catch {
        // Opening is best-effort — still show the note if this fails.
      }
      return remote;
    },
    enabled: Boolean(id),
    retry: 1,
  });

  const note = useMemo(
    () => mergeRemoteWithLocal(noteQuery.data, localNote),
    [localNote, noteQuery.data],
  );
  noteRef.current = note;

  useEffect(() => {
    if (!noteQuery.data) return;
    upsertNoteInListCaches(queryClient, noteToIndexEntry(noteQuery.data));
  }, [noteQuery.data, queryClient]);

  const isEditing = screenMode === 'edit';

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        setEditorHostReady(true);
        return undefined;
      }
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const task = InteractionManager.runAfterInteractions(() => {
        // Defer WebView mount until stack transition finishes — avoids Android release crashes.
        const delayMs = Platform.OS === 'android' ? 400 : 0;
        timer = setTimeout(() => {
          if (!cancelled) setEditorHostReady(true);
        }, delayMs);
      });
      return () => {
        cancelled = true;
        task.cancel();
        if (timer) clearTimeout(timer);
        setEditorHostReady(false);
      };
    }, []),
  );

  const refreshViewTitle = useCallback(() => {
    const nextTitle = resolveDisplayTitle(noteRef.current, blocksRef.current, pm.untitledNote);
    setViewTitle(nextTitle);
    setTitleDraft(nextTitle);
  }, [pm.untitledNote]);

  useEffect(() => {
    if (!id) return;
    setLocalNote(readLocalNote(id));
  }, [id]);

  useEffect(() => {
    lastSeedKeyRef.current = '';
    setContentRevision(0);
    setBlocks([]);
    setEditor(null);
    editorRef.current = null;
    setScreenMode('view');
    setViewTitle('');
    setTitleDraft('');
    setTitleEditing(false);
    setShowMoreMenu(false);
    setFocusOnEnable(false);
    setCatalystSuggestion('');
    setCatalystLoading(false);
    setCatalystTaskLoading(false);
    setCatalystChatLoading(false);
  }, [id]);

  useEffect(() => {
    if (!note || !id) return;
    const seedKey = `${id}:${contentRevision}`;
    if (lastSeedKeyRef.current === seedKey) return;
    lastSeedKeyRef.current = seedKey;

    const nextBlocks = noteToBlocks(note);
    setBlocks(nextBlocks);

    if (contentRevision === 0 && !readLocalNote(id)) {
      writeLocalNote({
        ...note,
        blocks: nextBlocks,
        localVersion: note.localVersion ?? 0,
        syncState: 'synced',
      });
    }
  }, [id, contentRevision, note?.id]);

  useEffect(() => {
    if (!note || screenMode !== 'view') return;
    refreshViewTitle();
  }, [note?.id, contentRevision, screenMode, refreshViewTitle, note]);

  const saveBlocksNow = useCallback((nextBlocks: NoteBlock[]) => {
    const currentNote = noteRef.current;
    if (!currentNote) return;
    const local = readLocalNote(currentNote.id);
    if (
      local?.syncState === 'synced' &&
      blocksToReadableText(nextBlocks) === blocksToReadableText(local.blocks)
    ) {
      setBlocks(nextBlocks);
      return;
    }
    setBlocks(nextBlocks);
    const snapshot = saveLocalNoteEdit(currentNote, nextBlocks, attachmentsRef.current);
    if (!snapshot) return;
    setLocalNote(snapshot);
    noteRef.current = snapshot;
    queryClient.setQueryData(queryKeys.note(currentNote.id), snapshot);
  }, [queryClient]);

  const persistAttachments = useCallback((nextAttachments: NoteEditorAttachment[]) => {
    attachmentsRef.current = nextAttachments;
    const currentNote = noteRef.current;
    if (!currentNote) return;
    const snapshot = saveLocalNoteEdit(currentNote, blocksRef.current, nextAttachments);
    if (!snapshot) return;
    setLocalNote(snapshot);
    noteRef.current = snapshot;
    queryClient.setQueryData(queryKeys.note(currentNote.id), snapshot);
  }, [queryClient]);

  const persistBlocksDebounced = useDebouncedCallback((nextBlocks: NoteBlock[]) => {
    saveBlocksNow(nextBlocks);
  }, 400);

  const handleBlocksChange = useCallback((nextBlocks: NoteBlock[]) => {
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
    persistBlocksDebounced(nextBlocks);
  }, [persistBlocksDebounced]);

  const flushPendingSave = useCallback(async () => {
    persistBlocksDebounced.flush();
  }, [persistBlocksDebounced]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        void flushPendingSave();
      };
    }, [flushPendingSave]),
  );

  const handleEditorReady = useCallback((nextEditor: UnifiedEditor) => {
    editorRef.current = nextEditor;
    setEditor(nextEditor);
  }, []);

  const handleEnterEdit = useCallback(() => {
    if (isEditing) return;
    setFocusOnEnable(true);
    setScreenMode('edit');
  }, [isEditing]);

  const handleFocusApplied = useCallback(() => {
    setFocusOnEnable(false);
  }, []);

  const handleVoiceTranscription = useCallback((text: string) => {
    const liveEditor = editorRef.current;
    if (!liveEditor) return;
    liveEditor.insertText(text);
    liveEditor.focus();
  }, []);

  const handleVoiceCaptured = useCallback(async (payload: {
    uri: string;
    durationMillis: number;
    mimeType: string;
  }) => {
    if (attachmentsRef.current.length >= 24) {
      setSnackMsg(pm.editorAttachmentMaxReached);
      return;
    }
    const name = payload.mimeType.includes('mpeg') ? 'voice.mp3' : 'voice.m4a';
    const { content, size } = await readUriAsBase64(payload.uri, name);
    const voiceAtt = composerAttachmentFromBase64({
      uri: payload.uri,
      name,
      mimeType: payload.mimeType,
      content,
      size,
    });
    persistAttachments([...attachmentsRef.current, voiceAtt]);
    setSnackMsg(pm.editorVoiceSaved);
  }, [persistAttachments, pm.editorAttachmentMaxReached, pm.editorVoiceSaved]);

  const voiceInput = useNoteVoiceInput({
    onTranscription: handleVoiceTranscription,
    onVoiceCaptured: handleVoiceCaptured,
    onMessage: setSnackMsg,
    messages: {
      voiceNotSupported: pm.editorVoiceNotSupported,
      micRequired: pm.editorVoiceMicRequired,
      recordingFailed: pm.editorVoiceRecordingFailed,
      voiceTooShort: pm.editorVoiceTooShort,
      voiceFailed: pm.editorVoiceFailed,
      noVoiceContent: pm.editorVoiceNoContent,
    },
  });

  const syncEditsInBackground = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      await flushPendingNoteOperations();
      if (id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
      }
      setLocalNote(id ? readLocalNote(id) : null);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [id, queryClient]);

  const handleSubmitTitle = useCallback(async () => {
    const currentNote = noteRef.current;
    if (!currentNote) return;

    const nextTitle = titleDraft.trim();
    const currentTitle = currentNote.title?.trim() ?? '';
    setTitleEditing(false);

    if (nextTitle === currentTitle) {
      refreshViewTitle();
      return;
    }

    const optimisticNote: Note = {
      ...currentNote,
      title: nextTitle,
      updatedAt: Date.now(),
    };
    setViewTitle(resolveDisplayTitle(optimisticNote, blocksRef.current, pm.untitledNote));
    setTitleDraft(resolveDisplayTitle(optimisticNote, blocksRef.current, pm.untitledNote));
    noteRef.current = optimisticNote;
    queryClient.setQueryData(queryKeys.note(currentNote.id), optimisticNote);
    setLocalNote((previous) => {
      if (!previous) return previous;
      const nextSnapshot: LocalNoteSnapshot = {
        ...previous,
        title: nextTitle,
        updatedAt: optimisticNote.updatedAt,
      };
      writeLocalNote(nextSnapshot);
      return nextSnapshot;
    });

    try {
      const updated = await updateNote(currentNote.id, { title: nextTitle });
      const mergedNote: Note = {
        ...updated,
        ...noteRef.current,
        title: updated.title ?? nextTitle,
        updatedAt: updated.updatedAt,
        remoteVersion: updated.remoteVersion,
      };
      noteRef.current = mergedNote;
      queryClient.setQueryData(queryKeys.note(currentNote.id), mergedNote);
      setLocalNote((previous) => {
        if (!previous) return previous;
        const nextSnapshot: LocalNoteSnapshot = {
          ...previous,
          title: mergedNote.title,
          updatedAt: mergedNote.updatedAt,
          remoteVersion: mergedNote.remoteVersion,
        };
        writeLocalNote(nextSnapshot);
        return nextSnapshot;
      });
      upsertNoteInListCaches(queryClient, noteToIndexEntry(mergedNote));
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      refreshViewTitle();
    }
  }, [pm.actionFailed, pm.untitledNote, queryClient, refreshViewTitle, titleDraft]);

  const handleDoneEdit = useCallback(async () => {
    if (voiceInput.isActive) {
      await voiceInput.cancelRecording();
    }
    if (titleEditing) {
      await handleSubmitTitle();
    }
    await flushPendingSave();
    void syncEditsInBackground();
    refreshViewTitle();
    Keyboard.dismiss();
    setScreenMode('view');
  }, [flushPendingSave, handleSubmitTitle, refreshViewTitle, syncEditsInBackground, titleEditing, voiceInput]);

  const noteAttachments = useNoteAttachments(note, {
    maxAttachmentsReached: pm.editorAttachmentMaxReached,
    attachmentFileTooLarge: pm.editorAttachmentTooLarge,
    attachmentLoadFailed: pm.editorAttachmentLoadFailed,
    attachmentPermissionDenied: pm.editorAttachmentPermissionDenied,
  }, persistAttachments);

  const imageMenuItems = useMemo(() => [
    { key: 'camera', icon: 'camera-outline', label: pm.editorInsertTakePhoto, source: 'camera' as const },
    { key: 'photos', icon: 'image-outline', label: pm.editorInsertChoosePhoto, source: 'photos' as const },
    { key: 'scan', icon: 'scan-helper', label: pm.editorInsertDocScan, source: 'camera' as const },
    { key: 'idcard', icon: 'card-account-details-outline', label: pm.editorInsertIdCard, source: 'photos' as const },
  ], [pm]);

  const handlePickImageSource = useCallback(async (source: 'camera' | 'photos' | 'document') => {
    try {
      if (source === 'document') {
        if (noteAttachments.isFull) {
          setSnackMsg(pm.editorAttachmentMaxReached);
          return;
        }
        const added = await noteAttachments.addFromSource(source);
        if (added) {
          editorRef.current?.focus();
          setSnackMsg(pm.editorAttachmentAdded);
        }
        return;
      }

      const picked = await pickAttachmentFromSource(source);
      if (!picked) return;
      const dataUri = inlineImageDataUri(picked);
      if (!dataUri) {
        setSnackMsg(pm.editorAttachmentLoadFailed.replace('{{name}}', picked.name));
        return;
      }
      hybridEditorRef.current?.insertImageBlock(dataUri, picked.name);
      setSnackMsg(pm.editorAttachmentAdded);
    } catch (error) {
      const message = noteAttachments.mapPickError(error);
      if (message) setSnackMsg(message);
    }
  }, [noteAttachments, pm]);

  const handleAttachmentPress = useCallback(() => {
    void handlePickImageSource('document');
  }, [handlePickImageSource]);

  const insertDisabled = !editor || voiceInput.isActive;

  useEffect(() => {
    attachmentsRef.current = noteAttachments.attachments;
  }, [noteAttachments.attachments]);

  const handleBack = useCallback(() => {
    if (voiceInput.isActive) {
      void voiceInput.cancelRecording();
    }
    const commitTitle = titleEditing ? handleSubmitTitle() : Promise.resolve();
    void commitTitle
      .then(() => flushPendingSave())
      .then(() => syncEditsInBackground())
      .finally(() => dismissOrHome(router));
  }, [flushPendingSave, handleSubmitTitle, router, syncEditsInBackground, titleEditing, voiceInput]);

  useDismissOnHardwareBack(router);

  const handleFlush = useCallback(async () => {
    await flushPendingSave();
    await flushPendingNoteOperations();
    if (id) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
    }
    await invalidateNoteLists(queryClient);
    setLocalNote(id ? readLocalNote(id) : null);
    setSnackMsg(pm.updated);
  }, [flushPendingSave, id, pm.updated, queryClient]);

  const handleApplyAiBlocks = useCallback(
    (nextBlocks: NoteBlock[], patch: NoteAiPatch) => {
      if (!note) return;
      const snapshot = saveLocalNoteEdit(note, nextBlocks, attachmentsRef.current);
      if (!snapshot) return;
      setLocalNote(snapshot);
      noteRef.current = snapshot;
      queryClient.setQueryData(queryKeys.note(note.id), snapshot);
      setBlocks(nextBlocks);
      setContentRevision((revision) => revision + 1);
      if (screenMode === 'view') {
        setViewTitle(resolveDisplayTitle(note, nextBlocks, pm.untitledNote));
      }
      setSnackMsg(patch.summary || pm.updated);
    },
    [note, pm.untitledNote, pm.updated, queryClient, screenMode],
  );

  const handleShare = useCallback(async () => {
    await flushPendingSave();
    const markdown = blocksToMarkdown(blocksRef.current);
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(markdown);
      setSnackMsg(pm.shareNotesCopied);
      return;
    }
    try {
      await Share.share({ message: markdown });
    } catch {
      await Clipboard.setStringAsync(markdown);
      setSnackMsg(pm.shareNotesCopied);
    }
  }, [flushPendingSave, pm.shareNotesCopied]);

  const handleTogglePin = useCallback(async () => {
    if (!note) return;
    try {
      const nextPinned = !note.pinned;
      const updated = await updateNote(note.id, { pinned: nextPinned });
      const merged = { ...note, ...updated, pinned: nextPinned };
      queryClient.setQueryData(queryKeys.note(note.id), merged);
      setLocalNote((prev) => (prev ? { ...prev, pinned: nextPinned } : prev));
      noteRef.current = merged;
      await invalidateNoteLists(queryClient);
      setSnackMsg(pm.updated);
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
    }
  }, [note, pm.actionFailed, pm.updated, queryClient]);

  const handleApplyTags = useCallback(
    async (tags: string[]) => {
      if (!note) return;
      ensureNoteTags(tags);
      try {
        const updated = await updateNote(note.id, { tags });
        const merged = { ...note, ...updated, tags };
        queryClient.setQueryData(queryKeys.note(note.id), merged);
        upsertNoteInListCaches(queryClient, noteToIndexEntry(merged));
        setLocalNote((prev) => (prev ? { ...prev, tags } : prev));
        noteRef.current = merged;
        setSnackMsg(pm.tagUpdated);
      } catch (err) {
        setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      }
    },
    [ensureNoteTags, note, pm.actionFailed, pm.tagUpdated, queryClient],
  );

  const handleCreateTag = useCallback(
    (raw: string) => addNoteTag(raw),
    [addNoteTag],
  );

  const handleDelete = useCallback(async () => {
    if (!note) return;
    try {
      await flushPendingSave();
      await deleteNote(note.id);
      await invalidateNoteLists(queryClient);
      dismissOrHome(router);
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
    }
  }, [flushPendingSave, note, pm.actionFailed, queryClient, router]);

  const handleGenerateCatalyst = useCallback(async () => {
    if (!note || catalystLoading) return;
    setCatalystLoading(true);
    try {
      await flushPendingSave();
      const result = await requestNoteAiEdit(note.id, {
        instruction: pm.catalystInstruction,
        blocks: blocksRef.current,
      });
      const suggestion = extractCatalystSuggestion(result.patch) || result.patch.summary;
      setCatalystSuggestion(suggestion);
      setSnackMsg(suggestion);
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.aiEditFailed);
    } finally {
      setCatalystLoading(false);
    }
  }, [catalystLoading, flushPendingSave, note, pm.aiEditFailed, pm.catalystInstruction]);

  const handleCreateCatalystTask = useCallback(async () => {
    if (!note || catalystTaskLoading) return;
    setCatalystTaskLoading(true);
    try {
      await flushPendingSave();
      const noteText = blocksToMarkdown(blocksRef.current).trim();
      const sourceText = catalystSuggestion || noteText || viewTitle;
      const taskTitle = firstSuggestionLine(sourceText, pm.catalystDefaultTaskTitle);
      await createTask(taskTitle, { sourceNoteId: note.id });
      await invalidateNoteLists(queryClient);
      setSnackMsg(pm.catalystTaskCreated);
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
    } finally {
      setCatalystTaskLoading(false);
    }
  }, [catalystSuggestion, catalystTaskLoading, flushPendingSave, note, pm.actionFailed, pm.catalystDefaultTaskTitle, pm.catalystTaskCreated, queryClient, viewTitle]);

  const handleOpenCatalystChat = useCallback(async () => {
    if (!note || catalystChatLoading) return;
    setCatalystChatLoading(true);
    try {
      await flushPendingSave();
      const { attachments, droppedCount } = await collectNoteAttachmentsForChat(
        blocksRef.current,
        attachmentsRef.current,
        note.attachments,
      );
      const noteText = buildNoteChatContextText(
        blocksRef.current,
        {
          imagePlaceholder: (alt) => t(pm.noteChatImagePlaceholder, { alt }),
          voiceTranscript: (text) => t(pm.noteChatVoiceTranscript, { text }),
        },
        { voiceTranscripts: extractVoiceTranscripts(note.attachments) },
      ).trim();
      const messageParts = [
        pm.catalystChatPrompt,
        '',
        `${pm.catalystChatNoteTitle}: ${viewTitle || pm.untitledNote}`,
        noteText,
      ];
      if (catalystSuggestion) {
        messageParts.push('', `${pm.catalystChatSuggestionTitle}:`, catalystSuggestion);
      }
      const text = messageParts.filter(Boolean).join('\n');
      const sessionKey = await createSession(undefined, { forceNew: true });
      if (attachments.length > 0 || droppedCount > 0) {
        writeNoteChatPrefill(sessionKey, { text, attachments, droppedCount });
      }
      invalidateSessionLists(queryClient);
      openChat(router, sessionKey, { msg: text });
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
    } finally {
      setCatalystChatLoading(false);
    }
  }, [catalystChatLoading, catalystSuggestion, flushPendingSave, note, pm.actionFailed, pm.catalystChatNoteTitle, pm.catalystChatPrompt, pm.catalystChatSuggestionTitle, pm.noteChatImagePlaceholder, pm.noteChatVoiceTranscript, pm.untitledNote, queryClient, router, viewTitle]);

  const formattedDate = note
    ? new Date(note.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const charCountLabel = t(pm.charCount, { count: countNoteCharacters(blocks) });
  const activeNoteTags = getNoteTags(note ?? { tags: undefined });

  useEffect(() => {
    if (activeNoteTags.length) ensureNoteTags(activeNoteTags);
  }, [activeNoteTags, ensureNoteTags]);

  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;
  const showEditor = Boolean(note && id);
  const viewBottomPadding = floatingBottomPadding(insets.bottom) + FLOATING_BOTTOM_OFFSET + VIEW_BOTTOM_BAR_HEIGHT;
  const fileAttachments = useMemo(
    () => noteAttachments.attachments.filter(
      (att) => att.type !== 'image' && !att.mimeType.startsWith('image/'),
    ),
    [noteAttachments.attachments],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <NoteDetailHeader
        mode={screenMode}
        onBack={handleBack}
        onUndo={() => editor?.undo()}
        onRedo={() => editor?.redo()}
        onDone={() => void handleDoneEdit()}
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={!isEditing}
      >
        {showLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent.primary} />
            <Text style={{ color: colors.text.tertiary }}>{m.common.loading}</Text>
          </View>
        ) : showError ? (
          <View style={styles.center}>
            <Icon source="cloud-alert-outline" size={42} color={colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              {noteQuery.error instanceof Error ? noteQuery.error.message : pm.editorSlashNoMatch}
            </Text>
            <Button mode="contained-tonal" onPress={() => void noteQuery.refetch()}>
              {m.common.retry}
            </Button>
          </View>
        ) : showEditor ? (
          <>
            <KeyboardAwareScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                !isEditing && { paddingBottom: viewBottomPadding },
              ]}
              keyboardShouldPersistTaps="handled"
              bottomOffset={isEditing ? 56 : 0}
            >
              {titleEditing ? (
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  onBlur={() => void handleSubmitTitle()}
                  onSubmitEditing={() => void handleSubmitTitle()}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  style={[styles.noteTitle, styles.noteTitleInput, { color: colors.text.primary }]}
                  placeholder={pm.untitledNote}
                  placeholderTextColor={colors.text.tertiary}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setTitleDraft(noteRef.current?.title?.trim() ?? '');
                    setTitleEditing(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={viewTitle}
                >
                  <Text
                    style={[styles.noteTitle, { color: colors.text.primary }]}
                    numberOfLines={2}
                  >
                    {viewTitle}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={styles.metaRow}
                onPress={() => setShowTagPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={pm.tagPickerTitleMulti}
              >
                <View style={styles.tagChipRow}>
                  {activeNoteTags.length === 0 ? (
                    <View style={[styles.tagChip, { backgroundColor: '#FDE68A' }]}>
                      <Text style={[styles.tagText, { color: '#92400E' }]}>{pm.defaultTag}</Text>
                    </View>
                  ) : (
                    activeNoteTags.map((tag) => {
                      const palette = getTagColors(tag, noteTags);
                      return (
                        <View key={tag} style={[styles.tagChip, { backgroundColor: palette.bg }]}>
                          <Text style={[styles.tagText, { color: palette.fg }]}>{tag}</Text>
                        </View>
                      );
                    })
                  )}
                  <Icon source="chevron-down" size={14} color={colors.text.tertiary} />
                </View>
                <Text style={[styles.metaTime, { color: colors.text.tertiary }]}>
                  {formattedDate}
                </Text>
              </Pressable>
              {isEditing ? (
                <NoteVoiceInputBar
                  phase={voiceInput.phase}
                  durationMillis={voiceInput.durationMillis}
                  meterSamples={voiceInput.meterSamples}
                  onStop={voiceInput.stopRecording}
                  stopLabel={pm.editorVoiceStop}
                  transcribingLabel={pm.editorVoiceTranscribing}
                />
              ) : null}

              {fileAttachments.length > 0 ? (
                <ComposerAttachmentStrip
                  attachments={fileAttachments}
                  onRemove={(index) => {
                    const target = fileAttachments[index];
                    const fullIndex = noteAttachments.attachments.indexOf(target);
                    if (fullIndex >= 0) noteAttachments.removeAttachment(fullIndex);
                  }}
                  removeLabel={pm.editorAttachmentRemove}
                  readOnly={!isEditing}
                />
              ) : null}

              <View style={styles.editorBody}>
                {editorHostReady ? (
                  <HybridNoteEditor
                    ref={hybridEditorRef}
                    contentKey={`${id}:${contentRevision}`}
                    blocks={blocks}
                    onBlocksChange={handleBlocksChange}
                    onEditorReady={handleEditorReady}
                    slashMenuOpen={showSlashMenu}
                    onSlashMenuClose={() => setShowSlashMenu(false)}
                    editable={isEditing}
                    focusOnEnable={focusOnEnable}
                    onFocusApplied={handleFocusApplied}
                  />
                ) : (
                  <View style={styles.editorLoading}>
                    <ActivityIndicator color={colors.accent.primary} />
                  </View>
                )}
                {!isEditing ? (
                  <Pressable
                    style={styles.editorOverlay}
                    onPress={handleEnterEdit}
                    accessibilityRole="button"
                    accessibilityLabel={pm.edit}
                  />
                ) : null}
              </View>

              {!isEditing ? (
                <Text style={[styles.charCount, { color: colors.text.tertiary }]}>
                  {charCountLabel}
                </Text>
              ) : null}
            </KeyboardAwareScrollView>

            {isEditing ? (
              <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
                <EditorActionBar
                editor={editor}
                onAiPress={() => setShowAiPanel(true)}
                onSlashPress={() => setShowSlashMenu(true)}
                onImagePress={() => setShowImageMenu(true)}
                onAttachmentPress={handleAttachmentPress}
                insertDisabled={insertDisabled}
                imageLabel={pm.editorInsertImage}
                attachmentLabel={pm.editorInsertAttachment}
                onVoicePress={voiceInput.toggleVoiceInput}
                voiceActive={voiceInput.phase === 'recording'}
                voiceDisabled={!editor || voiceInput.phase === 'transcribing'}
                voiceLabel={voiceInput.phase === 'recording' ? pm.editorVoiceStop : pm.editorVoiceStart}
              />
              </KeyboardStickyView>
            ) : null}

            <EditorInsertMenu
              visible={showImageMenu}
              items={imageMenuItems}
              onPick={(source) => void handlePickImageSource(source)}
              onClose={() => setShowImageMenu(false)}
            />

            <Modal
              visible={showAiPanel}
              animationType="slide"
              transparent
              onRequestClose={() => setShowAiPanel(false)}
            >
              <KeyboardAvoidingView
                style={styles.modalKeyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
                <View style={styles.modalOverlay}>
                  <View
                    style={[
                      styles.modalContent,
                      { backgroundColor: colors.surface.base },
                    ]}
                  >
                    <NoteAiPanel
                      noteId={id!}
                      blocks={blocks}
                      isDark={colors.surface.base === '#000000'}
                      onApplyBlocks={(nextBlocks, patch) => {
                        handleApplyAiBlocks(nextBlocks, patch);
                        setShowAiPanel(false);
                      }}
                      onMessage={setSnackMsg}
                    />
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          </>
        ) : (
          <View style={styles.center}>
            <Icon
              source="file-question-outline"
              size={42}
              color={colors.text.tertiary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
              {pm.editorSlashNoMatch}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {!isEditing && showEditor && !showAiPanel ? (
        <NoteViewActionBar
          labels={{
            catalyst: pm.catalystTitle,
            openChat: pm.catalystOpenChat,
            more: pm.viewMore,
          }}
          loading={{
            catalyst: catalystLoading,
            openChat: catalystChatLoading,
          }}
          onCatalyst={() => void handleGenerateCatalyst()}
          onOpenChat={() => void handleOpenCatalystChat()}
          onMore={() => setShowMoreMenu(true)}
        />
      ) : null}

      {showMoreMenu ? (
        <Pressable style={styles.actionBackdrop} onPress={() => setShowMoreMenu(false)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface.panel }]}>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                void handleFlush();
              }}
            >
              <Icon source="cloud-sync-outline" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.syncNow}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                void handleShare();
              }}
            >
              <Icon source="share-variant-outline" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.viewShare}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                void handleCreateCatalystTask();
              }}
            >
              <Icon source="checkbox-marked-circle-plus-outline" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.catalystSaveTask}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                void handleTogglePin();
              }}
            >
              <Icon source={note?.pinned ? 'pin-off-outline' : 'pin-outline'} size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{note?.pinned ? pm.unpin : pm.pin}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                setShowAiPanel(true);
              }}
            >
              <Icon source="creation-outline" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.aiSuggestionTitle}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={async () => {
                setShowMoreMenu(false);
                if (!note) return;
                try {
                  await updateNote(note.id, { status: 'archived' });
                  await invalidateNoteLists(queryClient);
                  setSnackMsg(pm.updated);
                  dismissOrHome(router);
                } catch (err) {
                  setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
                }
              }}
            >
              <Icon source="archive" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.archive}</Text>
            </Pressable>
            <Pressable
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                void handleDelete();
              }}
            >
              <Icon source="delete-outline" size={20} color={colors.text.primary} />
              <Text style={{ color: colors.text.primary }}>{pm.delete}</Text>
            </Pressable>
            <Pressable style={styles.actionItem} onPress={() => setShowMoreMenu(false)}>
              <Text style={{ color: colors.text.tertiary }}>{m.common.cancel}</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      <Snackbar
        visible={Boolean(snackMsg)}
        onDismiss={() => setSnackMsg('')}
        duration={TOAST_DURATION_SHORT}
      >
        {snackMsg}
      </Snackbar>

      {showTagPicker ? (
        <NoteTagPickerSheet
          visible={showTagPicker}
          mode="multi"
          tags={noteTags}
          selectedTags={activeNoteTags}
          onApplyTags={(tags) => void handleApplyTags(tags)}
          onCreateTag={handleCreateTag}
          onDismiss={() => setShowTagPicker(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  modalKeyboardAvoid: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  editorBody: { minHeight: 120, position: 'relative' },
  editorOverlay: {
    ...StyleSheet.absoluteFill,
  },
  editorLoading: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitle: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 10,
  },
  noteTitleInput: {
    padding: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  tagChipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaTime: {
    fontSize: 13,
    fontWeight: '400',
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '60%',
  },
  actionBackdrop: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actionSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
});
