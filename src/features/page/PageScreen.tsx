import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Share, StyleSheet, View } from 'react-native';
import { Icon, Snackbar, Text } from 'react-native-paper';

import { FloatingHeader } from '../../components/FloatingHeader';

import { useMessages } from '../../i18n/messages';
import { queryKeys } from '../../query/keys';
import {
  fetchNote,
  recordNoteOpen,
  type Note,
} from '../../query/notes';
import { useTheme } from '../../theme';

import { NoteAiPanel } from '../notes/ai/NoteAiPanel';
import { NoteBlockEditor } from '../notes/editor/NoteBlockEditor';
import { EditorActionBar } from '../notes/editor/EditorActionBar';
import type { UnifiedEditor } from '../notes/editor/types';
import {
  blocksToMarkdown,
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
  const [snackMsg, setSnackMsg] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const editorRef = useRef<UnifiedEditor | null>(null);

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: async () => {
      const note = await fetchNote(id!);
      void recordNoteOpen(id!);
      return note;
    },
    enabled: Boolean(id),
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
    if (!note) return;
    setBlocks(noteToBlocks(note));
    if (id && !localNote) {
      writeLocalNote({
        ...note,
        blocks: noteToBlocks(note),
        localVersion: note.localVersion ?? 0,
        syncState: 'synced',
      });
    }
  }, [id, localNote, note]);

  const persistBlocks = useCallback(
    (nextBlocks: NoteBlock[]) => {
      if (!note) return;
      setBlocks(nextBlocks);
      const snapshot = saveLocalNoteEdit(note, nextBlocks);
      setLocalNote(snapshot);
      queryClient.setQueryData(queryKeys.note(note.id), snapshot);
    },
    [note, queryClient],
  );

  const handleFlush = useCallback(async () => {
    await flushPendingNoteOperations();
    if (id) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.notesAll });
    setLocalNote(id ? readLocalNote(id) : null);
    setSnackMsg(pm.updated);
  }, [id, pm.updated, queryClient]);

  const handleApplyAiBlocks = useCallback(
    (nextBlocks: NoteBlock[], patch: NoteAiPatch) => {
      persistBlocks(nextBlocks);
      setSnackMsg(patch.summary || pm.updated);
    },
    [persistBlocks, pm.updated],
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

  const handleEditorReady = useCallback((editor: UnifiedEditor) => {
    editorRef.current = editor;
  }, []);

  const title = note
    ? new Date(note.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        title={title || '笔记'}
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
        {noteQuery.isLoading && !note ? (
          <View style={styles.center}>
            <Text style={{ color: colors.text.tertiary }}>Loading…</Text>
          </View>
        ) : note && id ? (
          <>
            <View style={styles.editorWrap}>
              <NoteBlockEditor
                blocks={blocks}
                onChange={persistBlocks}
                onEditorReady={handleEditorReady}
              />
            </View>
            <EditorActionBar
              editor={editorRef.current}
              onAiPress={() => setShowAiPanel(true)}
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
                    noteId={id}
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
              内容不存在
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  editorWrap: { flex: 1, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
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
