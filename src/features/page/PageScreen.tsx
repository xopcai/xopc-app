import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { NoteBlockEditor } from '../notes/editor/NoteBlockEditor';
import { EditorActionBar } from '../notes/editor/EditorActionBar';
import { useDebouncedCallback } from '../notes/editor/useDebouncedCallback';
import type { UnifiedEditor } from '../notes/editor/types';
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

function mergeRemoteWithLocal(
  remoteNote?: Note,
  localNote?: LocalNoteSnapshot | null,
): Note | undefined {
  if (!remoteNote) return localNote ?? undefined;
  if (!localNote) return remoteNote;
  if (localNote.updatedAt >= remoteNote.updatedAt) return localNote;
  return remoteNote;
}

export function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [editor, setEditor] = useState<UnifiedEditor | null>(null);
  const [contentRevision, setContentRevision] = useState(0);
  const [editorSeed, setEditorSeed] = useState<{ key: string; html: string } | null>(null);
  const [snackMsg, setSnackMsg] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const lastSeedKeyRef = useRef('');

  const blocksRef = useRef<NoteBlock[]>([]);
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

  useEffect(() => {
    if (!id) return;
    setLocalNote(readLocalNote(id));
  }, [id]);

  useEffect(() => {
    lastSeedKeyRef.current = '';
    setContentRevision(0);
    setEditorSeed(null);
    setEditor(null);
  }, [id]);

  // Seed editor when note first loads or external revision bumps (AI patch).
  useEffect(() => {
    if (!note || !id) return;
    const seedKey = `${id}:${contentRevision}`;
    if (lastSeedKeyRef.current === seedKey) return;
    lastSeedKeyRef.current = seedKey;

    const nextBlocks = noteToBlocks(note);
    const html = blocksToHtml(nextBlocks);
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
  }, [id, contentRevision, note]);

  const persistHtml = useDebouncedCallback((html: string) => {
    if (!note) return;
    const nextBlocks = htmlToBlocks(html, blocksRef.current);
    setBlocks(nextBlocks);
    const snapshot = saveLocalNoteEdit(note, nextBlocks);
    setLocalNote(snapshot);
    queryClient.setQueryData(queryKeys.note(note.id), snapshot);
  }, 400);

  const handleFlush = useCallback(async () => {
    await flushPendingNoteOperations();
    if (id) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
    }
    await invalidateNoteLists(queryClient);
    setLocalNote(id ? readLocalNote(id) : null);
    setSnackMsg(pm.updated);
  }, [id, pm.updated, queryClient]);

  const handleApplyAiBlocks = useCallback(
    (nextBlocks: NoteBlock[], patch: NoteAiPatch) => {
      if (!note) return;
      const snapshot = saveLocalNoteEdit(note, nextBlocks);
      setLocalNote(snapshot);
      queryClient.setQueryData(queryKeys.note(note.id), snapshot);
      setBlocks(nextBlocks);
      setContentRevision((revision) => revision + 1);
      setSnackMsg(patch.summary || pm.updated);
    },
    [note, pm.updated, queryClient],
  );

  const handleShare = useCallback(async () => {
    const markdown = blocksToMarkdown(blocks);
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
  }, [blocks, pm.shareNotesCopied]);

  const handleEditorReady = useCallback((nextEditor: UnifiedEditor) => {
    setEditor(nextEditor);
  }, []);

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
        onBack={() => router.back()}
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
              <NoteBlockEditor
                key={editorSeed!.key}
                contentKey={editorSeed!.key}
                initialHtml={editorSeed!.html}
                onChange={persistHtml}
                onEditorReady={handleEditorReady}
                slashMenuOpen={showSlashMenu}
                onSlashMenuClose={() => setShowSlashMenu(false)}
              />
            </View>
            <EditorActionBar
              editor={editor}
              onAiPress={() => setShowAiPanel(true)}
              onSlashPress={() => setShowSlashMenu(true)}
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
