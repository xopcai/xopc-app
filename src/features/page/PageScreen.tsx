import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMessages, t } from '../../i18n/messages';
import { openChat } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
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
import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

import { NoteAiPanel } from '../notes/ai/NoteAiPanel';
import { ComposerAttachmentStrip } from '../chat/composer-attachment-strip';
import { NoteBlockEditor } from '../notes/editor/NoteBlockEditor';
import { EditorActionBar } from '../notes/editor/EditorActionBar';
import { EditorInsertMenu } from '../notes/editor/EditorInsertMenu';
import { NoteVoiceInputBar } from '../notes/editor/NoteVoiceInputBar';
import { useNoteAttachments } from '../notes/editor/useNoteAttachments';
import { useNoteVoiceInput } from '../notes/editor/useNoteVoiceInput';
import type { NoteEditorAttachment } from '../notes/editor/note-attachment.types';
import { useDebouncedCallback } from '../notes/editor/useDebouncedCallback';
import type { UnifiedEditor } from '../notes/editor/types';
import { NoteDetailHeader, type NoteScreenMode } from '../notes/NoteDetailHeader';
import { NoteViewActionBar } from '../notes/NoteViewActionBar';
import { mergeRemoteWithLocal } from '../notes/merge-remote-local';
import {
  blocksToHtml,
  blocksToMarkdown,
  blocksToPlainText,
  htmlToBlocks,
  noteToBlocks,
  type NoteAiPatch,
  type NoteBlock,
} from '../notes/note-blocks';
import { countNoteCharacters, deriveNoteTitle } from '../notes/note-title';
import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  writeLocalNote,
  type LocalNoteSnapshot,
} from '../notes/notes-local';

const VIEW_BOTTOM_BAR_HEIGHT = 64;

function resolveDisplayTitle(note: Pick<Note, 'title'> | undefined, blocks: NoteBlock[], fallback: string): string {
  const explicitTitle = note?.title?.trim();
  return explicitTitle || deriveNoteTitle(blocks, 10, fallback);
}

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const pm = m.notesPage;

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(
    () => (id ? readLocalNote(id) : null),
  );
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [editor, setEditor] = useState<UnifiedEditor | null>(null);
  const [contentRevision, setContentRevision] = useState(0);
  const [editorSeed, setEditorSeed] = useState<{ key: string; html: string } | null>(null);
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
  const lastSeedKeyRef = useRef('');

  const blocksRef = useRef<NoteBlock[]>([]);
  const latestHtmlRef = useRef('');
  const attachmentsRef = useRef<NoteEditorAttachment[]>([]);
  const noteRef = useRef<Note | undefined>(undefined);
  const editorRef = useRef<UnifiedEditor | null>(null);
  blocksRef.current = blocks;

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: async () => {
      const note = await fetchNote(id!);
      void recordNoteOpen(id!);
      return note;
    },
    enabled: Boolean(id),
    retry: 1,
  });

  const note = useMemo(
    () => mergeRemoteWithLocal(noteQuery.data, localNote),
    [localNote, noteQuery.data],
  );
  noteRef.current = note;

  const isEditing = screenMode === 'edit';

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
    latestHtmlRef.current = '';
    setContentRevision(0);
    setEditorSeed(null);
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
    const html = blocksToHtml(nextBlocks);
    latestHtmlRef.current = html;
    setEditorSeed({ key: seedKey, html });
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

  const saveHtmlNow = useCallback((html: string) => {
    const currentNote = noteRef.current;
    if (!currentNote) return;
    latestHtmlRef.current = html;
    const nextBlocks = htmlToBlocks(html, blocksRef.current);
    setBlocks(nextBlocks);
    const snapshot = saveLocalNoteEdit(currentNote, nextBlocks, attachmentsRef.current);
    setLocalNote(snapshot);
    noteRef.current = snapshot;
    queryClient.setQueryData(queryKeys.note(currentNote.id), snapshot);
  }, [queryClient]);

  const persistAttachments = useCallback((nextAttachments: NoteEditorAttachment[]) => {
    attachmentsRef.current = nextAttachments;
    const currentNote = noteRef.current;
    if (!currentNote) return;
    const snapshot = saveLocalNoteEdit(currentNote, blocksRef.current, nextAttachments);
    setLocalNote(snapshot);
    noteRef.current = snapshot;
    queryClient.setQueryData(queryKeys.note(currentNote.id), snapshot);
  }, [queryClient]);

  const persistHtmlDebounced = useDebouncedCallback((html: string) => {
    saveHtmlNow(html);
  }, 400);

  const handleEditorChange = useCallback((html: string) => {
    latestHtmlRef.current = html;
    persistHtmlDebounced(html);
  }, [persistHtmlDebounced]);

  const flushPendingSave = useCallback(async () => {
    persistHtmlDebounced.flush();

    const liveEditor = editorRef.current;
    if (liveEditor) {
      try {
        const html = await liveEditor.getHTML();
        if (typeof html === 'string' && html !== latestHtmlRef.current) {
          saveHtmlNow(html);
          return;
        }
      } catch {
        // Editor may already be torn down.
      }
    }

    if (latestHtmlRef.current) {
      saveHtmlNow(latestHtmlRef.current);
    }
  }, [persistHtmlDebounced, saveHtmlNow]);

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

  const voiceInput = useNoteVoiceInput({
    onTranscription: handleVoiceTranscription,
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

  const handleDoneEdit = useCallback(async () => {
    if (voiceInput.isActive) {
      await voiceInput.cancelRecording();
    }
    await flushPendingSave();
    refreshViewTitle();
    Keyboard.dismiss();
    setScreenMode('view');
  }, [flushPendingSave, refreshViewTitle, voiceInput]);

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
      await invalidateNoteLists(queryClient);
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      refreshViewTitle();
    }
  }, [pm.actionFailed, pm.untitledNote, queryClient, refreshViewTitle, titleDraft]);

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
    if (noteAttachments.isFull) {
      setSnackMsg(pm.editorAttachmentMaxReached);
      return;
    }
    try {
      const added = await noteAttachments.addFromSource(source);
      if (added) {
        editorRef.current?.focus();
        setSnackMsg(pm.editorAttachmentAdded);
      }
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
    void flushPendingSave().finally(() => router.back());
  }, [flushPendingSave, router, voiceInput]);

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
      setLocalNote(snapshot);
      noteRef.current = snapshot;
      queryClient.setQueryData(queryKeys.note(note.id), snapshot);
      setBlocks(nextBlocks);
      latestHtmlRef.current = blocksToHtml(nextBlocks);
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

  const handleDelete = useCallback(async () => {
    if (!note) return;
    try {
      await flushPendingSave();
      await deleteNote(note.id);
      await invalidateNoteLists(queryClient);
      router.back();
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
      const noteText = blocksToMarkdown(blocksRef.current).trim();
      const messageParts = [
        pm.catalystChatPrompt,
        '',
        `${pm.catalystChatNoteTitle}: ${viewTitle || pm.untitledNote}`,
        noteText,
      ];
      if (catalystSuggestion) {
        messageParts.push('', `${pm.catalystChatSuggestionTitle}:`, catalystSuggestion);
      }
      const sessionKey = await createSession(undefined, { forceNew: true });
      invalidateSessionLists(queryClient);
      openChat(router, sessionKey, { msg: messageParts.filter(Boolean).join('\n') });
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
    } finally {
      setCatalystChatLoading(false);
    }
  }, [catalystChatLoading, catalystSuggestion, flushPendingSave, note, pm.actionFailed, pm.catalystChatNoteTitle, pm.catalystChatPrompt, pm.catalystChatSuggestionTitle, pm.untitledNote, queryClient, router, viewTitle]);

  const formattedDate = note
    ? new Date(note.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const charCountLabel = t(pm.charCount, { count: countNoteCharacters(blocks) });
  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;
  const showEditor = Boolean(note && id && editorSeed);
  const viewBottomPadding = floatingBottomPadding(insets.bottom) + FLOATING_BOTTOM_OFFSET + VIEW_BOTTOM_BAR_HEIGHT;

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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <View
              style={[
                styles.editorWrap,
                !isEditing && { paddingBottom: viewBottomPadding },
              ]}
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
                    setTitleDraft(viewTitle);
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

              <View style={styles.metaRow}>
                <View style={[styles.tagChip, { backgroundColor: '#FDE68A' }]}> 
                  <Text style={[styles.tagText, { color: '#92400E' }]}> 
                    {note?.tags?.[0] ?? pm.defaultTag}
                  </Text>
                  <Icon source="chevron-down" size={14} color="#92400E" />
                </View>
                <Text style={[styles.metaTime, { color: colors.text.tertiary }]}> 
                  {formattedDate}
                </Text>
              </View>
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

              {noteAttachments.attachments.length > 0 ? (
                <ComposerAttachmentStrip
                  attachments={noteAttachments.attachments}
                  onRemove={noteAttachments.removeAttachment}
                  removeLabel={pm.editorAttachmentRemove}
                  readOnly={!isEditing}
                />
              ) : null}

              <View style={styles.editorPressable}>
                <NoteBlockEditor
                  key={editorSeed!.key}
                  contentKey={editorSeed!.key}
                  initialHtml={editorSeed!.html}
                  onChange={handleEditorChange}
                  onEditorReady={handleEditorReady}
                  slashMenuOpen={showSlashMenu}
                  onSlashMenuClose={() => setShowSlashMenu(false)}
                  editable={isEditing}
                  focusOnEnable={focusOnEnable}
                  onFocusApplied={handleFocusApplied}
                />
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
            </View>

            {isEditing ? (
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
          pinned={note?.pinned}
          labels={{
            catalyst: pm.catalystTitle,
            saveTask: pm.catalystSaveTask,
            openChat: pm.catalystOpenChat,
            pin: pm.pin,
            unpin: pm.unpin,
            more: pm.viewMore,
          }}
          loading={{
            catalyst: catalystLoading,
            saveTask: catalystTaskLoading,
            openChat: catalystChatLoading,
          }}
          onCatalyst={() => void handleGenerateCatalyst()}
          onSaveTask={() => void handleCreateCatalystTask()}
          onOpenChat={() => void handleOpenCatalystChat()}
          onPin={() => void handleTogglePin()}
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
                  router.back();
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
        duration={2200}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  editorWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  editorPressable: { flex: 1, minHeight: 120, position: 'relative' },
  editorOverlay: {
    ...StyleSheet.absoluteFill,
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
