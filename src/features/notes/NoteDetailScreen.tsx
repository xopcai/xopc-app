import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Appbar, Snackbar, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
import { fetchNote, type Note } from '../../query/notes';
import { queryKeys } from '../../query/keys';

import { NoteAiPanel } from './ai/NoteAiPanel';
import { NoteBlockEditor } from './editor/NoteBlockEditor';
import { blocksToPlainText, noteToBlocks, type NoteAiPatch, type NoteBlock } from './note-blocks';
import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  writeLocalNote,
  type LocalNoteSnapshot,
} from './notes-local';

function mergeRemoteWithLocal(remoteNote?: Note, localNote?: LocalNoteSnapshot | null): Note | undefined {
  if (!remoteNote) return localNote ?? undefined;
  if (!localNote) return remoteNote;
  if (localNote.updatedAt >= remoteNote.updatedAt) return localNote;
  return remoteNote;
}

export function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const pm = m.notesPage;

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [snackMsg, setSnackMsg] = useState('');

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', ''],
    queryFn: () => fetchNote(id!),
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

  const persistBlocks = useCallback((nextBlocks: NoteBlock[]) => {
    if (!note) return;
    setBlocks(nextBlocks);
    const snapshot = saveLocalNoteEdit(note, nextBlocks);
    setLocalNote(snapshot);
    queryClient.setQueryData(queryKeys.note(note.id), snapshot);
  }, [note, queryClient]);

  const handleFlush = useCallback(async () => {
    const flushed = await flushPendingNoteOperations();
    if (id) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    setLocalNote(id ? readLocalNote(id) : null);
    setSnackMsg(flushed > 0 ? pm.updated : pm.savedOffline);
  }, [id, pm.savedOffline, pm.updated, queryClient]);

  const handleApplyAiBlocks = useCallback((nextBlocks: NoteBlock[], patch: NoteAiPatch) => {
    persistBlocks(nextBlocks);
    setSnackMsg(patch.summary || pm.updated);
  }, [persistBlocks, pm.updated]);

  const pageBg = isDark ? '#000000' : '#F5F5F7';
  const mutedColor = '#8E8E93';

  const title = note
    ? new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const syncText = localNote?.syncState === 'pending' || localNote?.syncState === 'failed'
    ? pm.savedOffline
    : `${blocksToPlainText(blocks).length} chars`;

  return (
    <View style={[styles.screen, { backgroundColor: pageBg }]}> 
      <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
        <Appbar.BackAction onPress={() => dismissOrHome(router)} />
        <Appbar.Content title={title} titleStyle={{ fontSize: 15 }} />
        <Appbar.Action icon="cloud-sync-outline" onPress={() => void handleFlush()} />
      </Appbar.Header>

      {noteQuery.isLoading && !note ? (
        <View style={styles.center}>
          <Text style={{ color: mutedColor }}>Loading…</Text>
        </View>
      ) : note && id ? (
        <>
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.contentPad} keyboardDismissMode="interactive">
            <Text style={[styles.syncText, { color: mutedColor }]}>{syncText}</Text>
            <NoteBlockEditor blocks={blocks} isDark={isDark} onChange={persistBlocks} />
          </ScrollView>
          <View style={styles.aiPanelWrap}>
            <NoteAiPanel
              noteId={id}
              blocks={blocks}
              isDark={isDark}
              onApplyBlocks={handleApplyAiBlocks}
              onMessage={setSnackMsg}
            />
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: mutedColor }}>{pm.actionFailed}</Text>
        </View>
      )}

      <Snackbar visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={2500}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1 },
  contentPad: { padding: 16, paddingBottom: 24 },
  syncText: { fontSize: 12, marginBottom: 10 },
  aiPanelWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
});
