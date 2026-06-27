import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';

import { apiFetch } from '../../api/client';
import { BottomSheetModal } from '../../components/BottomSheetModal';
import { TOAST_DURATION_SHORT } from '../../constants/toast';
import { t, useMessages } from '../../i18n/messages';
import { dismissOrHome, openChat, useDismissOnHardwareBack } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
import { noteToIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import { invalidateNoteLists } from '../../query/workspace-sync';
import {
  fetchNote,
  fetchNotes,
  recordNoteOpen,
  requestNoteAiEdit,
  updateNote,
  uploadNoteMedia,
  type ApiError,
  type Note,
  type NoteAttachment,
} from '../../query/notes';
import { createSession } from '../../query/sessions';
import { useTheme } from '../../theme';

import { NoteDetailHeader } from '../notes/NoteDetailHeader';
import { NoteViewActionBar, type NoteViewActionBarItem } from '../notes/NoteViewActionBar';
import { NoteTagPickerSheet } from '../notes/NoteTagPickerSheet';
import { discardLocalNoteState, flushPendingNoteOperations, readLocalNote, saveLocalMarkdownNoteEdit } from '../notes/notes-local';
import { applyMarkdownPatchResult } from '../notes/markdown/markdown-patch';
import {
  buildNoteChatContextText,
  collectNoteAttachmentsForChat,
  extractVoiceTranscripts,
} from '../notes/note-to-chat-payload';
import { setAppClipboardStringAsync } from '../clipboard-intake/write-app-clipboard';
import { AttachmentFileError, pickAttachmentFromSource, type AttachmentPickSource } from '../chat/attachment-file-io';
import { writeNoteChatPrefill } from '../chat/note-chat-prefill-storage';
import { NoteEditorBridge } from '../notes/editor/NoteEditorBridge';
import { countNoteCharacters } from '../notes/note-title';
import { getNotePrimaryTag, getTagColors } from '../notes/note-tag-utils';
import type {
  EditorCommand,
  EditorCommandInput,
  EditorAttachmentPickResult,
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorRuntimeState,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
} from '../notes/editor/editor-protocol';
import { useNoteTagsStore } from '../../stores/note-tags-store';

const SAVE_DEBOUNCE_MS = 600;

type SaveState = 'saved' | 'dirty' | 'saving' | 'pending' | 'failed';

const EMPTY_EDITOR_RUNTIME_STATE: EditorRuntimeState = {
  ready: false,
  focused: false,
  selection: { from: 0, to: 0 },
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  todo: false,
  bullet: false,
  ordered: false,
  quote: false,
  code: false,
  headingLevel: 0,
  textAlign: 'left',
  link: false,
  image: false,
};

function noteAttachmentRef(noteId: string, attachmentId: string): string {
  return `xopc-attachment://notes/${encodeURIComponent(noteId)}/${encodeURIComponent(attachmentId)}`;
}

function attachmentApiPath(noteId: string, attachmentId: string): string {
  return `/api/notes/${encodeURIComponent(noteId)}/media/${encodeURIComponent(attachmentId)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

function deriveTitle(note: Note | undefined, fallback: string): string {
  const explicit = note?.title?.trim();
  if (explicit) return explicit;
  const plain = note?.markdown?.replace(/[#*_`>\-[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain ? Array.from(plain).slice(0, 18).join('') : fallback;
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}

function firstRouteParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function isImageAttachment(attachment: NoteAttachment): boolean {
  return attachment.type === 'image' || attachment.mimeType.startsWith('image/');
}

export function PageScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = firstRouteParam(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;
  const noteTags = useNoteTagsStore((s) => s.tags);
  const addNoteTag = useNoteTagsStore((s) => s.addTag);
  const ensureNoteTags = useNoteTagsStore((s) => s.ensureTags);
  const hydrateNoteTags = useNoteTagsStore((s) => s.hydrate);

  const [markdown, setMarkdown] = useState('');
  const [editorMarkdown, setEditorMarkdown] = useState('');
  const [attachmentSrcMap, setAttachmentSrcMap] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[] | undefined>(undefined);
  const [noteStatus, setNoteStatus] = useState<Note['status']>('processed');
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [snackMsg, setSnackMsg] = useState('');
  const [moreVisible, setMoreVisible] = useState(false);
  const [tagPickerVisible, setTagPickerVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [actionLoading, setActionLoading] = useState<'pin' | 'catalyst' | 'openChat' | null>(null);
  const [editorRuntimeState, setEditorRuntimeState] = useState<EditorRuntimeState>(EMPTY_EDITOR_RUNTIME_STATE);
  const [editorCommand, setEditorCommand] = useState<EditorCommand | null>(null);
  const [, setSelection] = useState<EditorSelectionContext | null>(null);

  const editorCommandIdRef = useRef(0);
  const titleInputRef = useRef<TextInput | null>(null);
  const markdownRef = useRef(markdown);
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  const statusRef = useRef(noteStatus);
  const serverMarkdownRef = useRef('');
  const serverTitleRef = useRef<string | undefined>(undefined);
  const serverTagsRef = useRef<string[] | undefined>(undefined);
  const serverStatusRef = useRef<Note['status'] | undefined>(undefined);
  const dirtyRef = useRef(false);
  const seededNoteIdRef = useRef<string | null>(null);
  const openedNoteIdRef = useRef<string | null>(null);
  const handledMissingNoteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayAttachmentSrcMapRef = useRef(new Map<string, string>());

  markdownRef.current = markdown;
  titleRef.current = title;
  tagsRef.current = tags;
  statusRef.current = noteStatus;

  useEffect(() => {
    hydrateNoteTags();
  }, [hydrateNoteTags]);

  const resolveAttachmentRefsForDisplay = useCallback(async (
    currentNoteId: string,
    nextMarkdown: string,
    nextAttachments: NoteAttachment[] | undefined,
  ): Promise<Record<string, string>> => {
    displayAttachmentSrcMapRef.current.clear();
    const refPattern = /xopc-attachment:\/\/notes\/([^/\s)]+)\/([^\s)]+)/g;
    const refs = new Map<string, { noteId: string; attachmentId: string }>();
    for (const match of nextMarkdown.matchAll(refPattern)) {
      const canonical = match[0];
      refs.set(canonical, {
        noteId: decodeURIComponent(match[1]),
        attachmentId: decodeURIComponent(match[2]),
      });
    }
    for (const attachment of nextAttachments ?? []) {
      if (!isImageAttachment(attachment)) continue;
      refs.set(noteAttachmentRef(currentNoteId, attachment.id), {
        noteId: currentNoteId,
        attachmentId: attachment.id,
      });
    }
    if (refs.size === 0) return {};

    const nextMap: Record<string, string> = {};
    for (const [canonical, ref] of refs) {
      if (!ref.noteId || !ref.attachmentId) continue;
      try {
        const res = await apiFetch(attachmentApiPath(ref.noteId, ref.attachmentId));
        if (!res.ok) continue;
        const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
        const dataUri = `data:${contentType};base64,${arrayBufferToBase64(await res.arrayBuffer())}`;
        displayAttachmentSrcMapRef.current.set(dataUri, canonical);
        nextMap[canonical] = dataUri;
      } catch {
        continue;
      }
    }
    return nextMap;
  }, []);

  const canonicalizeEditorMarkdown = useCallback((nextMarkdown: string): string => {
    let canonical = nextMarkdown;
    for (const [displaySrc, canonicalSrc] of displayAttachmentSrcMapRef.current.entries()) {
      canonical = canonical.split(displaySrc).join(canonicalSrc);
    }
    return canonical;
  }, []);

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: () => fetchNote(id!),
    enabled: Boolean(id),
    retry: 1,
  });
  const note = noteQuery.data;

  useEffect(() => {
    if (!id || !noteQuery.isError || handledMissingNoteIdRef.current === id) return;
    const error = noteQuery.error as Partial<ApiError>;
    if (error.status !== 404) return;
    handledMissingNoteIdRef.current = id;
    discardLocalNoteState(id);
    queryClient.removeQueries({ queryKey: queryKeys.note(id) });
    void invalidateNoteLists(queryClient);
    setSnackMsg(pm.missing);
    router.replace('/notes');
  }, [id, noteQuery.error, noteQuery.isError, pm.missing, queryClient, router]);

  useEffect(() => {
    if (!note) return;
    const localNote = readLocalNote(note.id);
    const shouldUseLocal = localNote?.syncState === 'pending'
      || localNote?.syncState === 'failed'
      || (localNote?.localVersion ?? 0) > (note.localVersion ?? 0);
    const displayNote = shouldUseLocal && localNote ? localNote : note;
    const nextMarkdown = displayNote.markdown ?? '';
    const nextTitle = displayNote.title;
    const nextTags = displayNote.tags;
    const nextStatus = displayNote.status;

    serverMarkdownRef.current = nextMarkdown;
    serverTitleRef.current = nextTitle;
    serverTagsRef.current = nextTags;
    serverStatusRef.current = nextStatus;

    const isNewNote = seededNoteIdRef.current !== note.id;
    if (isNewNote || !dirtyRef.current) {
      seededNoteIdRef.current = note.id;
      dirtyRef.current = false;
      if (isNewNote) setEditing(true);
      setMarkdown(nextMarkdown);
      setEditorMarkdown(nextMarkdown);
      setAttachmentSrcMap({});
      void resolveAttachmentRefsForDisplay(note.id, nextMarkdown, displayNote.attachments).then((nextMap) => {
        if (seededNoteIdRef.current === note.id && !dirtyRef.current) {
          setAttachmentSrcMap(nextMap);
        }
      });
      setTitle(nextTitle ?? deriveTitle(note, pm.untitledNote));
      setTags(nextTags);
      ensureNoteTags(nextTags ?? []);
      setNoteStatus(nextStatus);
      setSaveState(shouldUseLocal && localNote?.syncState === 'failed' ? 'failed' : shouldUseLocal && localNote?.syncState === 'pending' ? 'pending' : 'saved');
    }

    upsertNoteInListCaches(queryClient, noteToIndexEntry(note));
  }, [ensureNoteTags, note?.id, note?.localVersion, note?.markdown, note?.status, note?.tags, note?.title, pm.untitledNote, queryClient, resolveAttachmentRefsForDisplay]);

  useEffect(() => {
    if (!id || openedNoteIdRef.current === id) return;
    openedNoteIdRef.current = id;
    void recordNoteOpen(id).catch(() => undefined);
  }, [id]);

  const flushSave = useCallback(async () => {
    if (!id || !note) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const nextMarkdown = markdownRef.current;
    const nextTitle = titleRef.current.trim() || undefined;
    const nextTags = tagsRef.current;
    const nextStatus = statusRef.current;

    if (
      nextMarkdown === serverMarkdownRef.current
      && nextTitle === serverTitleRef.current
      && tagsEqual(nextTags, serverTagsRef.current)
      && nextStatus === serverStatusRef.current
    ) {
      dirtyRef.current = false;
      const localSnapshot = readLocalNote(id);
      if (localSnapshot?.syncState === 'failed') {
        setSaveState('failed');
        return;
      }
      if (localSnapshot?.syncState === 'pending') {
        setSaveState('pending');
        void flushPendingNoteOperations()
          .then((flushed) => {
            if (flushed > 0) setSaveState('saved');
          })
          .catch(() => {
            setSaveState('failed');
            setSnackMsg(pm.savedOffline);
          });
        return;
      }
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    const snapshot = saveLocalMarkdownNoteEdit(note, {
      markdown: nextMarkdown,
      title: nextTitle,
      tags: nextTags,
      status: nextStatus,
    });
    serverMarkdownRef.current = nextMarkdown;
    serverTitleRef.current = snapshot.title;
    serverTagsRef.current = snapshot.tags;
    serverStatusRef.current = snapshot.status;
    dirtyRef.current = false;
    setSaveState('pending');
    queryClient.setQueryData(queryKeys.note(id), snapshot);
    upsertNoteInListCaches(queryClient, noteToIndexEntry(snapshot));
    void invalidateNoteLists(queryClient);
    void flushPendingNoteOperations()
      .then((flushed) => {
        if (flushed > 0) setSaveState('saved');
      })
      .catch(() => {
        setSaveState('failed');
        setSnackMsg(pm.savedOffline);
      });
  }, [id, note, pm.savedOffline, queryClient]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => () => {
      void flushSave();
    }, [flushSave]),
  );

  const updateMarkdown = useCallback((next: string) => {
    const canonical = canonicalizeEditorMarkdown(next);
    dirtyRef.current = true;
    setSaveState('dirty');
    setEditorMarkdown(next);
    setMarkdown(canonical);
    scheduleSave();
  }, [canonicalizeEditorMarkdown, scheduleSave]);

  const updateTitle = useCallback((next: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setTitle(next);
    scheduleSave();
  }, [scheduleSave]);

  const beginEditing = useCallback((focusBody = false) => {
    setEditing(true);
    if (!focusBody) return;
    setTimeout(() => {
      editorCommandIdRef.current += 1;
      setEditorCommand({ id: editorCommandIdRef.current, type: 'focus', position: 'end' });
    }, 0);
  }, []);

  const beginTitleEditing = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
  }, []);

  const sendEditorCommand = useCallback((next: EditorCommandInput) => {
    editorCommandIdRef.current += 1;
    setEditorCommand({ id: editorCommandIdRef.current, ...next } as EditorCommand);
  }, []);

  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    void flushSave();
    if (editing) {
      setEditing(false);
      return;
    }
    dismissOrHome(router);
  }, [editing, flushSave, router]);

  useDismissOnHardwareBack(router, { onBack: handleBack });

  const handleDone = useCallback(() => {
    Keyboard.dismiss();
    void flushSave();
    setEditing(false);
  }, [flushSave]);

  const buildChatPrefill = useCallback((instruction: string): string => {
    const context = buildNoteChatContextText(
      markdownRef.current,
      {
        imagePlaceholder: (alt) => t(pm.noteChatImagePlaceholder, { alt }),
        voiceTranscript: (text) => t(pm.noteChatVoiceTranscript, { text }),
      },
      { voiceTranscripts: extractVoiceTranscripts(note?.attachments) },
    );
    const noteTitle = titleRef.current.trim();
    return [
      instruction.trim(),
      noteTitle ? `${pm.catalystChatNoteTitle}: ${noteTitle}` : '',
      context,
    ].filter(Boolean).join('\n\n');
  }, [note?.attachments, pm.catalystChatNoteTitle, pm.noteChatImagePlaceholder, pm.noteChatVoiceTranscript]);

  const handleOpenNoteChat = useCallback(async (kind: 'catalyst' | 'openChat') => {
    if (!id || !note) return;
    setActionLoading(kind);
    try {
      Keyboard.dismiss();
      await flushSave();
      const instruction = kind === 'catalyst' ? pm.catalystChatPrompt : pm.editorSendToChatPrefix;
      const prefill = buildChatPrefill(instruction);
      const media = await collectNoteAttachmentsForChat(id, markdownRef.current, [], note.attachments);
      const key = await createSession();
      writeNoteChatPrefill(key, {
        text: prefill,
        attachments: media.attachments,
        droppedCount: media.droppedCount,
      });
      openChat(router, key, { msg: prefill });
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    } finally {
      setActionLoading(null);
    }
  }, [buildChatPrefill, flushSave, id, note, pm.actionFailed, pm.catalystChatPrompt, pm.editorSendToChatPrefix, router]);

  const handleShare = useCallback(async () => {
    setMoreVisible(false);
    try {
      await flushSave();
      const message = markdownRef.current.trim() || titleRef.current.trim() || pm.untitledNote;
      if (Platform.OS === 'web') {
        await setAppClipboardStringAsync(message);
        setSnackMsg(pm.shareNotesCopied);
        return;
      }
      await Share.share({
        message,
        title: titleRef.current.trim() || pm.shareNotesTitle,
      });
    } catch {
      await setAppClipboardStringAsync(markdownRef.current.trim() || titleRef.current.trim() || pm.untitledNote);
      setSnackMsg(pm.shareNotesCopied);
    }
  }, [flushSave, pm.shareNotesCopied, pm.shareNotesTitle, pm.untitledNote]);

  const handleSyncNow = useCallback(async () => {
    setMoreVisible(false);
    try {
      await flushSave();
      const flushed = await flushPendingNoteOperations();
      if (id) await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
      await invalidateNoteLists(queryClient);
      setSnackMsg(flushed > 0 ? pm.updated : pm.saved);
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    }
  }, [flushSave, id, pm.actionFailed, pm.saved, pm.updated, queryClient]);

  const handleCreateTag = useCallback((raw: string) => addNoteTag(raw), [addNoteTag]);

  const handleSelectPrimaryTag = useCallback((tag: string | null) => {
    const nextTags = tag ? [tag] : [];
    setTags(nextTags);
    tagsRef.current = nextTags;
    dirtyRef.current = true;
    setSaveState('dirty');
    scheduleSave();
    setTagPickerVisible(false);
  }, [scheduleSave]);

  const handleTogglePinned = useCallback(async () => {
    if (!id || !note) return;
    setActionLoading('pin');
    try {
      await flushSave();
      const updated = await updateNote(id, { pinned: !note.pinned });
      queryClient.setQueryData(queryKeys.note(id), updated);
      upsertNoteInListCaches(queryClient, noteToIndexEntry(updated));
      void invalidateNoteLists(queryClient);
      setSnackMsg(updated.pinned ? pm.pin : pm.unpin);
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    } finally {
      setActionLoading(null);
    }
  }, [flushSave, id, note, pm.actionFailed, pm.pin, pm.unpin, queryClient]);

  const handleRequestAttachment = useCallback(async (source: AttachmentPickSource): Promise<EditorAttachmentPickResult> => {
    if (!id) return null;
    try {
      const picked = await pickAttachmentFromSource(source);
      if (!picked) return null;
      await flushSave();
      const attachment = await uploadNoteMedia(id, {
        localUri: picked.localUri,
        name: picked.name,
        mimeType: picked.mimeType,
        content: picked.content,
      });
      queryClient.setQueryData<Note>(queryKeys.note(id), (current) => {
        if (!current) return current;
        const attachments = current.attachments?.some((item) => item.id === attachment.id)
          ? current.attachments
          : [...(current.attachments ?? []), attachment];
        return { ...current, attachments };
      });
      const canonical = noteAttachmentRef(id, attachment.id);
      const isImage = attachment.type === 'image' || attachment.mimeType.startsWith('image/');
      let dataUri: string | undefined;
      if (isImage) {
        const res = await apiFetch(attachmentApiPath(id, attachment.id));
        const contentType = res.headers.get('Content-Type') || picked.mimeType;
        const displaySrc = res.ok
          ? `data:${contentType};base64,${arrayBufferToBase64(await res.arrayBuffer())}`
          : canonical;
        dataUri = displaySrc;
        displayAttachmentSrcMapRef.current.set(dataUri, canonical);
        setAttachmentSrcMap((current) => ({ ...current, [canonical]: displaySrc }));
      }
      setSnackMsg(pm.editorAttachmentAdded);
      return {
        src: canonical,
        displaySrc: dataUri,
        alt: attachment.fileName || picked.name,
        kind: isImage ? 'image' : 'document',
      };
    } catch (error) {
      if (error instanceof AttachmentFileError && error.code === 'permission_denied') {
        setSnackMsg(source === 'camera' ? pm.editorCameraDenied : pm.editorAttachmentPermissionDenied);
        return null;
      }
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
      return null;
    }
  }, [flushSave, id, pm.actionFailed, pm.editorAttachmentAdded, pm.editorAttachmentPermissionDenied, pm.editorCameraDenied, queryClient]);

  const handleRequestAi = useCallback(async (request: EditorAiRequest): Promise<EditorAiResponse | null> => {
    if (!id) return null;
    try {
      await flushSave();
      const contextMarkdown = request.selection.markdown || request.selection.currentBlockMarkdown || request.markdown;
      const result = await requestNoteAiEdit(id, {
        instruction: request.instruction,
        markdown: request.markdown,
        context: {
          type: request.selection.from === request.selection.to ? 'block' : 'selection',
          range: { start: request.selection.from, end: request.selection.to },
          markdown: contextMarkdown,
          blockType: 'prosemirror',
        },
      });
      const patched = applyMarkdownPatchResult(request.markdown, result.patch.operations);
      return {
        id: result.patch.id,
        summary: result.patch.summary || result.message,
        markdown: patched.markdown,
        title: patched.metadata.title,
        tags: patched.metadata.tags,
        status: patched.metadata.status,
      };
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.aiEditFailed);
      return null;
    }
  }, [flushSave, id, pm.aiEditFailed]);

  const handleApplyAiMetadata = useCallback(async (metadata: EditorAiMetadata): Promise<void> => {
    let touched = false;
    if (metadata.title !== undefined) {
      setTitle(metadata.title ?? '');
      touched = true;
    }
    if (metadata.tags !== undefined) {
      setTags(metadata.tags);
      touched = true;
    }
    if (metadata.status !== undefined) {
      setNoteStatus(metadata.status);
      touched = true;
    }
    if (touched) {
      dirtyRef.current = true;
      setSaveState('dirty');
      scheduleSave();
    }
  }, [scheduleSave]);

  const handleRequestWikiLink = useCallback(async (query: string): Promise<EditorWikiLinkCandidate[]> => {
    try {
      const trimmed = query.trim();
      const result = await fetchNotes({
        search: trimmed || undefined,
        limit: 8,
        sortBy: trimmed ? 'updatedAt' : 'lastOpenedAt',
        sortOrder: 'desc',
      });
      return result.items
        .filter((item) => item.id !== id)
        .map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.snippet?.trim() || pm.untitledNote,
          subtitle: item.snippet,
        }));
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
      return [];
    }
  }, [id, pm.actionFailed, pm.untitledNote]);

  const labels = useMemo<NoteEditorLabels>(() => ({
    placeholder: pm.editorPlaceholderText,
    aiPlaceholder: pm.aiInputPlaceholder,
    aiRewrite: pm.aiPromptRewrite,
    aiShorten: pm.aiPromptShorten,
    aiContinue: pm.editorContinueBelow,
    aiTodo: pm.aiPromptExtractTodos,
    aiApply: pm.aiApply,
    aiDiscard: pm.aiDiscard,
    aiThinking: pm.aiGeneratePreview,
    image: pm.editorInsertImage,
    wikiLink: pm.editorInsertWikiLink,
    wikiLinkPlaceholder: pm.wikiLinkSearchPlaceholder,
    wikiLinkInsertTyped: pm.wikiLinkInsertTyped,
    wikiLinkNoResults: pm.wikiLinkNoResults,
    heading: pm.editorBlockHeading,
    headingOne: pm.editorHeadingOne,
    headingTwo: pm.editorHeadingTwo,
    headingThree: pm.editorHeadingThree,
    link: pm.editorInsertLink,
    undo: pm.editorUndo,
    redo: pm.editorRedo,
    style: pm.editorStyle,
    normalText: pm.editorNormalText,
    bold: pm.editorFormatBold,
    italic: pm.editorFormatItalic,
    underline: pm.editorFormatUnderline,
    alignLeft: pm.editorAlignLeft,
    alignCenter: pm.editorAlignCenter,
    alignRight: pm.editorAlignRight,
    alignment: pm.editorAlignment,
    lists: pm.editorLists,
    indent: pm.editorIndent,
    outdent: pm.editorOutdent,
    todo: pm.editorBlockTodo,
    bullet: pm.editorBlockBulletList,
    ordered: pm.editorBlockNumberedList,
    quote: pm.editorBlockQuote,
    code: pm.editorBlockCode,
    linkUrlPlaceholder: pm.editorLinkUrlPlaceholder,
    removeLink: pm.editorRemoveLink,
    imageFromLibrary: pm.editorImageLibrary,
    imageCamera: pm.editorImageCamera,
    imageScan: pm.editorImageScan,
    imageDocument: pm.editorImageDocument,
    unavailable: pm.editorUnavailable,
  }), [pm]);

  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;
  const showViewActions = Boolean(note && id && !editing && !keyboardVisible && !editorFocused);
  const primaryTag = useMemo(() => getNotePrimaryTag({ tags }), [tags]);
  const primaryTagPalette = useMemo(() => getTagColors(primaryTag, noteTags, colors), [colors, noteTags, primaryTag]);
  const wordCount = useMemo(() => countNoteCharacters(markdown), [markdown]);

  const rightActions = useMemo(() => {
    if (!editing) return [];
    return [
      {
        icon: 'undo',
        label: pm.editorUndo,
        disabled: !editorRuntimeState.canUndo,
        onPress: () => sendEditorCommand({ type: 'undo' }),
      },
      {
        icon: 'redo',
        label: pm.editorRedo,
        disabled: !editorRuntimeState.canRedo,
        onPress: () => sendEditorCommand({ type: 'redo' }),
      },
      { icon: 'check', label: pm.done, onPress: handleDone },
    ];
  }, [editing, editorRuntimeState.canRedo, editorRuntimeState.canUndo, handleDone, pm.done, pm.editorRedo, pm.editorUndo, sendEditorCommand]);

  const viewActionItems = useMemo<NoteViewActionBarItem[]>(() => [
    {
      key: 'share',
      icon: 'share-variant-outline',
      label: pm.viewShare,
      onPress: () => void handleShare(),
    },
    {
      key: 'pin',
      icon: note?.pinned ? 'star' : 'star-outline',
      label: note?.pinned ? pm.unpin : pm.pin,
      active: Boolean(note?.pinned),
      loading: actionLoading === 'pin',
      onPress: () => void handleTogglePinned(),
    },
    {
      key: 'chat',
      icon: 'chat-processing-outline',
      label: pm.catalystOpenChat,
      loading: actionLoading === 'openChat',
      onPress: () => void handleOpenNoteChat('openChat'),
    },
    {
      key: 'more',
      icon: 'dots-grid',
      label: pm.viewMore,
      onPress: () => setMoreVisible(true),
    },
  ], [actionLoading, handleOpenNoteChat, handleShare, handleTogglePinned, note?.pinned, pm.catalystOpenChat, pm.pin, pm.unpin, pm.viewMore, pm.viewShare]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <NoteDetailHeader
        onBack={handleBack}
        backLabel={m.common.back}
        rightActions={note ? rightActions : undefined}
      />

      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent.primary} />
          <Text style={{ color: colors.text.tertiary }}>{m.common.loading}</Text>
        </View>
      ) : showError ? (
        <View style={styles.center}>
          <Icon source="cloud-alert-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            {noteQuery.error instanceof Error ? noteQuery.error.message : pm.actionFailed}
          </Text>
          <Button mode="contained-tonal" onPress={() => void noteQuery.refetch()}>{m.common.retry}</Button>
        </View>
      ) : note && id ? (
        <View style={styles.editorWrap}>
          <View style={[styles.titleWrap, styles.titleWrapCompact, { borderBottomColor: colors.border.subtle }]}>
            <View style={styles.titleInputFrame}>
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={updateTitle}
                onFocus={() => {
                  setEditorFocused(false);
                  beginEditing(false);
                }}
                editable={editing}
                placeholder={pm.untitledNote}
                placeholderTextColor={colors.text.tertiary}
                accessibilityLabel={pm.aiMetadataNoteTitle}
                style={[styles.titleInput, { color: colors.text.primary }]}
              />
              {!editing ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={beginTitleEditing}
                  accessibilityRole="button"
                  accessibilityLabel={pm.edit}
                />
              ) : null}
            </View>
            <View style={styles.metaRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.categoryChip,
                  { backgroundColor: primaryTagPalette.bg, opacity: pressed ? 0.72 : 1 },
                ]}
                onPress={() => {
                  beginEditing(false);
                  setTagPickerVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={pm.tagPickerTitle}
              >
                <Icon source="folder-outline" size={14} color={primaryTagPalette.fg} />
                <Text numberOfLines={1} style={[styles.categoryChipText, { color: primaryTagPalette.fg }]}>
                  {primaryTag ?? pm.defaultTag}
                </Text>
                <Icon source="chevron-down" size={14} color={primaryTagPalette.fg} />
              </Pressable>
            </View>
          </View>
          <NoteEditorBridge
            noteId={id}
            markdown={editorMarkdown}
            attachmentSrcMap={attachmentSrcMap}
            editing={editing}
            topCommand={editorCommand}
            labels={labels}
            onChangeMarkdown={updateMarkdown}
            onSelectionChange={setSelection}
            onBeginEditing={() => beginEditing(true)}
            onRequestAttachment={handleRequestAttachment}
            onRequestAi={handleRequestAi}
            onApplyAiMetadata={handleApplyAiMetadata}
            onRequestWikiLink={handleRequestWikiLink}
            onFocusChange={setEditorFocused}
            onRuntimeStateChange={setEditorRuntimeState}
          />
        </View>
      ) : null}

      {showViewActions ? (
        <View style={styles.wordCountWrap} pointerEvents="none">
          <Text style={[styles.wordCountText, { color: colors.text.tertiary }]}>
            {t(pm.charCount, { count: wordCount })}
          </Text>
        </View>
      ) : null}

      {saveState === 'failed' ? (
        <Pressable
          style={[
            styles.retryBar,
            showViewActions ? styles.retryBarAboveActions : null,
            { backgroundColor: colors.surface.panel, borderColor: colors.border.default },
          ]}
          onPress={() => void flushSave()}
          accessibilityRole="button"
          accessibilityLabel={pm.saveFailed}
        >
          <Icon source="cloud-alert-outline" size={18} color={colors.semantic.error} />
          <Text style={[styles.retryText, { color: colors.text.primary }]}>{pm.saveFailed}</Text>
        </Pressable>
      ) : null}

      {showViewActions ? (
        <NoteViewActionBar
          items={viewActionItems}
        />
      ) : null}

      <BottomSheetModal
        visible={moreVisible}
        onDismiss={() => setMoreVisible(false)}
        title={pm.viewMore}
        maxHeight="40%"
      >
        <View style={styles.moreActions}>
          <Pressable
            style={({ pressed }) => [styles.moreAction, pressed && styles.moreActionPressed]}
            onPress={() => void handleSyncNow()}
            accessibilityRole="button"
            accessibilityLabel={pm.syncNow}
          >
            <Icon source="cloud-sync-outline" size={22} color={colors.text.secondary} />
            <Text style={[styles.moreActionLabel, { color: colors.text.primary }]}>{pm.syncNow}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.moreAction, pressed && styles.moreActionPressed]}
            onPress={() => void handleShare()}
            accessibilityRole="button"
            accessibilityLabel={pm.viewShare}
          >
            <Icon source="share-variant-outline" size={22} color={colors.text.secondary} />
            <Text style={[styles.moreActionLabel, { color: colors.text.primary }]}>{pm.viewShare}</Text>
          </Pressable>
        </View>
      </BottomSheetModal>

      <NoteTagPickerSheet
        visible={tagPickerVisible}
        tags={noteTags}
        selectedTag={primaryTag}
        onSelect={handleSelectPrimaryTag}
        onCreateTag={handleCreateTag}
        onDismiss={() => setTagPickerVisible(false)}
      />

      <Snackbar
        visible={Boolean(snackMsg)}
        duration={TOAST_DURATION_SHORT}
        onDismiss={() => setSnackMsg('')}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  editorWrap: {
    flex: 1,
    minHeight: 0,
  },
  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrapCompact: {
    paddingBottom: 4,
  },
  titleInputFrame: {
    position: 'relative',
  },
  titleInput: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    paddingVertical: 4,
  },
  titleText: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    paddingVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
  },
  categoryChip: {
    minHeight: 30,
    maxWidth: '76%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 15,
    paddingHorizontal: 10,
  },
  categoryChipText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  wordCountWrap: {
    position: 'absolute',
    right: 22,
    bottom: 94,
    zIndex: 12,
  },
  wordCountText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  retryBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryBarAboveActions: {
    bottom: 104,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  moreActions: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  moreAction: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  moreActionPressed: {
    opacity: 0.72,
  },
  moreActionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
