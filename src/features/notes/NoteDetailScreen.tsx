import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Appbar, Snackbar, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { dismissOrHome, openChat, useDismissOnHardwareBack } from '../../lib/navigation';
import { fetchNote, type Note } from '../../query/notes';
import { queryKeys } from '../../query/keys';
import { createSession } from '../../query/sessions';
import { useTheme } from '../../theme';

import { NoteAiPanel } from './ai/NoteAiPanel';
import { NoteBlockEditor, type NoteBlockEditorHandle } from './editor/NoteBlockEditor';
import { EditorActionBar } from './editor/EditorActionBar';
import { SlashCommandMenu } from './editor/SlashCommandMenu';
import { blocksToMarkdown, blocksToPlainText, noteToBlocks, type NoteAiPatch, type NoteBlock, type NoteBlockType } from './note-blocks';
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
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [snackMsg, setSnackMsg] = useState('');
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [editorHandle, setEditorHandle] = useState<NoteBlockEditorHandle | null>(null);

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

  const handleSendToChat = useCallback((text: string) => {
    const prefill = `${pm.editorSendToChatPrefix}${text}`;
    void createSession(undefined, { forceNew: true })
      .then((key) => {
        openChat(router, key, { msg: prefill });
      })
      .catch(() => {
        setSnackMsg(pm.actionFailed);
      });
  }, [pm.actionFailed, pm.editorSendToChatPrefix, router]);

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

  // ── Slash command menu ───────────────────────────────────

  const handleOpenSlashMenu = useCallback(() => {
    setSlashMenuVisible(true);
  }, []);

  const handleSlashSelect = useCallback((type: NoteBlockType) => {
    setSlashMenuVisible(false);
    editorHandle?.convertActiveBlock(type);
  }, [editorHandle]);

  const handleSlashDismiss = useCallback(() => {
    setSlashMenuVisible(false);
  }, []);

  // ── Action bar handlers ──────────────────────────────────

  const handleActionBarConvert = useCallback((type: NoteBlockType) => {
    editorHandle?.convertActiveBlock(type);
  }, [editorHandle]);

  const handleActionBarInsert = useCallback(() => {
    editorHandle?.insertAfterActive();
  }, [editorHandle]);

  const title = note
    ? new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const syncText = localNote?.syncState === 'pending' || localNote?.syncState === 'failed'
    ? pm.savedOffline
    : `${blocksToPlainText(blocks).length} chars`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
        <Appbar.BackAction onPress={() => dismissOrHome(router)} />
        <Appbar.Content title={title} titleStyle={{ fontSize: 15 }} />
        <Appbar.Action icon="share-variant-outline" onPress={() => void handleShare()} />
        <Appbar.Action icon="cloud-sync-outline" onPress={() => void handleFlush()} />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {noteQuery.isLoading && !note ? (
          <View style={styles.center}>
            <Text style={{ color: colors.text.tertiary }}>Loading…</Text>
          </View>
        ) : note && id ? (
          <>
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.contentPad} keyboardDismissMode="interactive">
              <Text style={[styles.syncText, { color: colors.text.tertiary }]}>{syncText}</Text>
              <NoteBlockEditor
                blocks={blocks}
                onChange={persistBlocks}
                onSendToChat={handleSendToChat}
                onRequestSlashMenu={handleOpenSlashMenu}
                onHandleChange={setEditorHandle}
              />
            </ScrollView>
            <EditorActionBar
              activeBlockType={editorHandle?.activeBlockType ?? null}
              onConvertBlock={handleActionBarConvert}
              onInsertBlock={handleActionBarInsert}
              onOpenSlashMenu={handleOpenSlashMenu}
            />
            <View style={styles.aiPanelWrap}>
              <NoteAiPanel
                noteId={id}
                blocks={blocks}
                isDark={colors.surface.base === '#000000'}
                onApplyBlocks={handleApplyAiBlocks}
                onMessage={setSnackMsg}
              />
            </View>
            <SlashCommandMenu
              visible={slashMenuVisible}
              onSelect={handleSlashSelect}
              onDismiss={handleSlashDismiss}
            />
          </>
        ) : (
          <View style={styles.center}>
            <Text style={{ color: colors.text.tertiary }}>{pm.actionFailed}</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <Snackbar visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={2500}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1 },
  contentPad: { padding: 16, paddingBottom: 24 },
  syncText: { fontSize: 12, marginBottom: 10 },
  aiPanelWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
});
