import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchActionBar } from '../../components/BatchActionBar';
import { FloatingHeader } from '../../components/FloatingHeader';
import { useMessages, t } from '../../i18n/messages';
import { pickAttachmentFromSource, type AttachmentPickSource } from '../chat/attachment-file-io';
import type { ComposerAttachment } from '../chat/composer.types';
import { deleteNote, fetchNotes, captureNote, updateNote, type NoteIndexEntry } from '../../query/notes';
import { queryKeys } from '../../query/keys';
import { invalidateHomeFeed } from '../../query/workspace-sync';
import { NOTE_KIND_ICONS } from '../notes/note-list-display';
import { useTheme, FLOATING_BOTTOM_OFFSET, floatingBottomPadding } from '../../theme';
import {
  captureNoteWithComposerAttachment,
  captureNoteWithVoice,
  prepareVoiceCapturePayload,
} from '../notes/capture-note-media';
import { parseCaptureIntent } from '../notes/capture-parser';
import { flushPendingNotes, queueMediaCapture, queueNote } from '../notes/notes-sync';
import { QuickCaptureComposer } from '../notes/QuickCaptureComposer';
import { InboxItemContent } from './InboxItemContent';
import { InboxSwipeableItem } from './InboxSwipeableItem';

type CapturePayload =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachment: ComposerAttachment }
  | { type: 'voice'; uri: string; durationMillis: number; mimeType: string };

export function InboxScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const im = m.inboxPage;
  const pm = m.notesPage;
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const inboxQuery = useQuery({
    queryKey: queryKeys.notes('inbox'),
    queryFn: () => fetchNotes({ status: 'inbox', limit: 100 }),
  });

  const items = inboxQuery.data?.items ?? [];
  const selectedCount = selectedIds.size;

  const invalidateInbox = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
    invalidateHomeFeed(queryClient);
  }, [queryClient]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const captureMutation = useMutation({
    mutationFn: async (payload: CapturePayload) => {
      if (payload.type === 'text') {
        const intent = parseCaptureIntent(payload.text);
        return captureNote({ text: payload.text, kind: intent.kind });
      }
      if (payload.type === 'attachment') {
        return captureNoteWithComposerAttachment(payload.attachment, captureText);
      }
      return captureNoteWithVoice(payload);
    },
    onSuccess: async () => {
      setCaptureText('');
      await invalidateInbox();
    },
    onError: async (err, payload) => {
      try {
        if (payload.type === 'text') {
          queueNote(payload.text);
        } else if (payload.type === 'attachment') {
          queueMediaCapture({ type: 'attachment', attachment: payload.attachment, text: captureText });
        } else {
          const queued = await prepareVoiceCapturePayload(payload);
          queueMediaCapture({ type: 'voice', ...queued });
        }
        setCaptureText('');
        setSnackMsg(pm.savedOffline);
      } catch {
        setSnackMsg(err instanceof Error ? err.message : pm.actionFailed);
      }
    },
  });

  const archiveIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => updateNote(id, { status: 'archived' })));
    await invalidateInbox();
  }, [invalidateInbox]);

  const deleteIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => deleteNote(id)));
    await invalidateInbox();
  }, [invalidateInbox]);

  const archiveMutation = useMutation({
    mutationFn: archiveIds,
    onSuccess: (_data, ids) => {
      if (ids.length > 1) {
        setSnackMsg(t(im.batchArchived, { count: ids.length }));
      } else {
        setSnackMsg(im.archived);
      }
      exitSelectionMode();
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : pm.actionFailed),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIds,
    onSuccess: (_data, ids) => {
      setSnackMsg(ids.length > 1 ? t(im.batchDeleted, { count: ids.length }) : pm.deleted);
      exitSelectionMode();
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : pm.actionFailed),
  });

  const handleCapture = useCallback(() => {
    const text = captureText.trim();
    if (!text) return;
    captureMutation.mutate({ type: 'text', text });
  }, [captureMutation, captureText]);

  const handleAttachmentSource = useCallback(async (source: AttachmentPickSource) => {
    try {
      const attachment = await pickAttachmentFromSource(source);
      if (!attachment) return;
      captureMutation.mutate({ type: 'attachment', attachment });
    } catch (error) {
      if (error instanceof Error && error.message.includes('permission')) {
        setSnackMsg(pm.micDenied);
        return;
      }
      setSnackMsg(pm.actionFailed);
    }
  }, [captureMutation, pm.actionFailed, pm.micDenied]);

  const handleVoiceCapture = useCallback((payload: { uri: string; durationMillis: number; mimeType: string }) => {
    captureMutation.mutate({ type: 'voice', ...payload });
  }, [captureMutation]);

  const enterSelection = useCallback((item: NoteIndexEntry) => {
    setSelectionMode(true);
    setSelectedIds(new Set([item.id]));
  }, []);

  const toggleSelected = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const handleItemPress = useCallback((item: NoteIndexEntry) => {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    router.push(`/items/${item.id}`);
  }, [router, selectionMode, toggleSelected]);

  const handleItemLongPress = useCallback((item: NoteIndexEntry) => {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    enterSelection(item);
  }, [enterSelection, selectionMode, toggleSelected]);

  const handleSwipeAction = useCallback((item: NoteIndexEntry, action: 'archive' | 'delete') => {
    if (action === 'archive') {
      archiveMutation.mutate([item.id]);
      return;
    }
    deleteMutation.mutate([item.id]);
  }, [archiveMutation, deleteMutation]);

  const batchActions = useMemo(() => [
    {
      key: 'archive',
      icon: 'archive-arrow-down-outline',
      label: pm.archive,
      onPress: () => archiveMutation.mutate([...selectedIds]),
      disabled: selectedCount === 0 || archiveMutation.isPending || deleteMutation.isPending,
      loading: archiveMutation.isPending,
    },
    {
      key: 'delete',
      icon: 'trash-can-outline',
      label: pm.delete,
      destructive: true,
      onPress: () => deleteMutation.mutate([...selectedIds]),
      disabled: selectedCount === 0 || archiveMutation.isPending || deleteMutation.isPending,
      loading: deleteMutation.isPending,
    },
  ], [archiveMutation, deleteMutation, pm.archive, pm.delete, selectedCount, selectedIds]);

  const renderItem = useCallback(({ item }: { item: NoteIndexEntry }) => {
    const selected = selectedIds.has(item.id);
    const card = (
      <Pressable
        style={[
          styles.itemCard,
          {
            backgroundColor: selected ? colors.accent.selectionBg : colors.surface.panel,
            borderColor: selected ? colors.accent.primary : colors.border.subtle,
          },
        ]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
        delayLongPress={280}
      >
        {selectionMode ? (
          <View style={[styles.checkbox, selected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary }]}>
            {selected ? <Icon source="check" size={14} color={colors.text.inverse} /> : null}
          </View>
        ) : (
          <View style={styles.itemIcon}>
            <Icon source={NOTE_KIND_ICONS[item.kind] ?? 'lightbulb-outline'} size={20} color="#6D5DFB" />
          </View>
        )}
        <InboxItemContent note={item} />
      </Pressable>
    );

    if (selectionMode) return card;

    return (
      <InboxSwipeableItem
        archiveLabel={pm.archive}
        deleteLabel={pm.delete}
        onAction={(action) => handleSwipeAction(item, action)}
      >
        {card}
      </InboxSwipeableItem>
    );
  }, [
    colors.accent.primary,
    colors.accent.selectionBg,
    colors.border.subtle,
    colors.surface.panel,
    colors.text.inverse,
    handleItemLongPress,
    handleItemPress,
    handleSwipeAction,
    pm.archive,
    pm.delete,
    selectedIds,
    selectionMode,
  ]);

  const listBottomPadding = selectionMode
    ? insets.bottom + 120
    : insets.bottom + 80;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        title={selectionMode ? t(im.selectedCount, { count: selectedCount }) : im.title}
        onBack={selectionMode ? exitSelectionMode : () => router.back()}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={{ selectionMode, selectedCount, selectedKey: [...selectedIds].join('|') }}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={inboxQuery.isFetching}
            onRefresh={async () => {
              await flushPendingNotes();
              await inboxQuery.refetch();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icon source="tray" size={42} color={colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{im.emptyTitle}</Text>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{im.emptyHint}</Text>
          </View>
        }
      />

      {selectionMode ? (
        <BatchActionBar items={batchActions} />
      ) : (
        <KeyboardStickyView
          offset={{ closed: 0, opened: 0 }}
          style={{ marginBottom: FLOATING_BOTTOM_OFFSET }}
        >
          <View style={[styles.bottomBar, { paddingBottom: floatingBottomPadding(insets.bottom) }]}>
            <QuickCaptureComposer
              value={captureText}
              onChangeText={setCaptureText}
              onSubmit={handleCapture}
              onVoiceCapture={handleVoiceCapture}
              onAttachmentSource={(source) => void handleAttachmentSource(source)}
              placeholder={im.capturePlaceholder}
              submitting={captureMutation.isPending}
            />
          </View>
        </KeyboardStickyView>
      )}

      <Snackbar visible={!!snackMsg} onDismiss={() => setSnackMsg('')} duration={2200}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bottomBar: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
  },
  listContent: { padding: 16, gap: 10 },
  itemCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109,93,251,0.14)',
    marginTop: 2,
  },
  checkbox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(120,120,128,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 110,
    paddingHorizontal: 36,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
