import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchActionBar } from '../../components/BatchActionBar';
import { BatchDeleteConfirmDialog } from '../../components/BatchDeleteConfirmDialog';
import { FloatingHeader } from '../../components/FloatingHeader';
import { ListSelectionCheckbox } from '../../components/ListSelectionCheckbox';
import { SwipeableRow, type SwipeRowAction } from '../../components/SwipeableRow';
import { SwipeHintBanner } from '../../components/SwipeHintBanner';
import { LIST_DELAY_LONG_PRESS, LIST_DELETE_UNDO_MS } from '../../constants/list-interaction';
import { useListSelection } from '../../hooks/use-list-selection';
import { useNoteDeleteWithUndo } from '../../hooks/use-note-delete-with-undo';
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
  const li = m.listInteraction;
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [snackUndo, setSnackUndo] = useState<{ label: string; onPress: () => void } | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const {
    selectionMode,
    selectedIds,
    selectedCount,
    exitSelectionMode,
    enterSelection,
    startSelection,
    toggleSelected,
  } = useListSelection<string>();
  const { deleteWithUndo } = useNoteDeleteWithUndo(queryClient);

  const inboxQuery = useQuery({
    queryKey: queryKeys.notes('inbox'),
    queryFn: () => fetchNotes({ status: 'inbox', limit: 100 }),
  });

  const items = inboxQuery.data?.items ?? [];

  const invalidateInbox = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes('inbox') });
    invalidateHomeFeed(queryClient);
  }, [queryClient]);

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
      setShowBatchDelete(false);
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
    enterSelection(item.id);
  }, [enterSelection, selectionMode, toggleSelected]);

  const handleSwipeAction = useCallback((item: NoteIndexEntry, action: 'archive' | 'delete') => {
    if (action === 'archive') {
      archiveMutation.mutate([item.id]);
      return;
    }
    const snack = deleteWithUndo(item);
    setSnackMsg(snack.message);
    setSnackUndo({ label: snack.undoLabel, onPress: snack.onUndo });
  }, [archiveMutation, deleteWithUndo]);

  const buildSwipeActions = useCallback(
    (item: NoteIndexEntry): SwipeRowAction[] => [
      {
        key: 'archive',
        icon: 'archive-arrow-down-outline',
        label: pm.archive,
        color: 'blue',
        onPress: () => handleSwipeAction(item, 'archive'),
      },
      {
        key: 'delete',
        icon: 'trash-can-outline',
        label: pm.delete,
        color: 'red',
        onPress: () => handleSwipeAction(item, 'delete'),
      },
    ],
    [handleSwipeAction, pm.archive, pm.delete],
  );

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
      onPress: () => setShowBatchDelete(true),
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
        delayLongPress={LIST_DELAY_LONG_PRESS}
        accessibilityState={selectionMode ? { selected } : undefined}
      >
        {selectionMode ? (
          <ListSelectionCheckbox selected={selected} />
        ) : (
          <View style={styles.itemIcon}>
            <Icon source={NOTE_KIND_ICONS[item.kind] ?? 'lightbulb-outline'} size={20} color="#6D5DFB" />
          </View>
        )}
        <InboxItemContent note={item} />
      </Pressable>
    );

    return (
      <SwipeableRow actions={buildSwipeActions(item)} borderRadius={20} enabled={!selectionMode}>
        {card}
      </SwipeableRow>
    );
  }, [
    buildSwipeActions,
    colors.accent.primary,
    colors.accent.selectionBg,
    colors.border.subtle,
    colors.surface.panel,
    handleItemLongPress,
    handleItemPress,
    selectedIds,
    selectionMode,
  ]);

  const listBottomPadding = selectionMode
    ? insets.bottom + 120
    : insets.bottom + 80;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        title={selectionMode ? t(li.selectedCount, { count: selectedCount }) : im.title}
        onBack={selectionMode ? exitSelectionMode : () => router.back()}
        rightLabel={selectionMode ? undefined : li.select}
        onRightLabelPress={selectionMode ? undefined : startSelection}
      />

      <SwipeHintBanner hasItems={!selectionMode && items.length > 0} />

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

      <BatchDeleteConfirmDialog
        visible={showBatchDelete}
        count={selectedCount}
        onDismiss={() => setShowBatchDelete(false)}
        onConfirm={() => deleteMutation.mutate([...selectedIds])}
        loading={deleteMutation.isPending}
      />

      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => {
          setSnackMsg('');
          setSnackUndo(null);
        }}
        duration={snackUndo ? LIST_DELETE_UNDO_MS : 2200}
        action={snackUndo ? { label: snackUndo.label, onPress: snackUndo.onPress } : undefined}
      >
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
