import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Share, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';

import { FloatingHeader } from '../../components/FloatingHeader';

import { useMessages } from '../../i18n/messages';
import { queryKeys } from '../../query/keys';
import { invalidateNoteLists } from '../../query/workspace-sync';
import {
  fetchNote,
  recordNoteOpen,
  type Note,
} from '../../query/notes';
import { useTheme } from '../../theme';

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
import { mergeRemoteWithLocal } from '../notes/merge-remote-local';
import {
  blocksToHtml,
  blocksToMarkdown,
  htmlToBlocks,
  noteToBlocks,
  type NoteAiPatch,
  type NoteBlock,
} from '../notes/note-blocks';
import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  writeLocalNote,
  type LocalNoteSnapshot,
} from '../notes/notes-local';

export function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
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
  }, [id]);

  // Seed editor when note first loads or external revision bumps (AI patch).
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
      setSnackMsg(patch.summary || pm.updated);
    },
    [note, pm.updated, queryClient],
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

  const title = note
    ? new Date(note.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;
  const showEditor = Boolean(note && id && editorSeed);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        title={title || pm.title}
        onBack={handleBack}
        rightActions={[
          { icon: 'share-variant-outline', onPress: () => void handleShare() },
          { icon: 'cloud-sync-outline', onPress: () => void handleFlush() },
        ]}
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
            <View style={styles.editorWrap}>
              <NoteVoiceInputBar
                phase={voiceInput.phase}
                durationMillis={voiceInput.durationMillis}
                meterSamples={voiceInput.meterSamples}
                onStop={voiceInput.stopRecording}
                stopLabel={pm.editorVoiceStop}
                transcribingLabel={pm.editorVoiceTranscribing}
              />
              {noteAttachments.attachments.length > 0 ? (
                <ComposerAttachmentStrip
                  attachments={noteAttachments.attachments}
                  onRemove={noteAttachments.removeAttachment}
                  removeLabel={pm.editorAttachmentRemove}
                />
              ) : null}
              <NoteBlockEditor
                key={editorSeed!.key}
                contentKey={editorSeed!.key}
                initialHtml={editorSeed!.html}
                onChange={handleEditorChange}
                onEditorReady={handleEditorReady}
                slashMenuOpen={showSlashMenu}
                onSlashMenuClose={() => setShowSlashMenu(false)}
              />
            </View>
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
  editorWrap: { flex: 1, paddingHorizontal: 16 },
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
});
