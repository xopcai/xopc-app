import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchActionBar } from '../../components/BatchActionBar';
import { BatchDeleteConfirmDialog } from '../../components/BatchDeleteConfirmDialog';
import { AppToast } from '../../components/AppToast';
import { FloatingHeader } from '../../components/FloatingHeader';
import { ListSelectionCheckbox } from '../../components/ListSelectionCheckbox';
import { TOAST_BOTTOM_LIFT_ABOVE_BAR, TOAST_DURATION_SHORT } from '../../constants/toast';
import { dismissOrHome } from '../../lib/navigation';
import { useListSelection } from '../../hooks/use-list-selection';
import { useMessages, t } from '../../i18n/messages';
import { AttachmentFileError, pickAttachmentFromSource, type AttachmentPickSource } from '../chat/attachment-file-io';
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
  const cm = m.chat;
  const li = m.listInteraction;
  const [captureText, setCaptureText] = useState('');
  const [snackMsg, setSnackMsg] = useState('');
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const {
    selectionMode,
    selectedIds,
    selectedCount,
    exitSelectionMode,
    startSelection,
    toggleSelected,
  } = useListSelection<string>();

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
      if (error instanceof AttachmentFileError && error.code === 'permission_denied') {
        setSnackMsg(source === 'camera' ? cm.attachmentCameraPermissionDenied : cm.attachmentPermissionDenied);
        return;
      }
      setSnackMsg(pm.actionFailed);
    }
  }, [captureMutation, cm.attachmentCameraPermissionDenied, cm.attachmentPermissionDenied, pm.actionFailed]);

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

  const headerOverflowMenu = useMemo(
    () => [
      {
        key: 'select',
        icon: 'checkbox-multiple-marked-outline',
        label: li.select,
        onPress: startSelection,
      },
    ],
    [li.select, startSelection],
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
    return (
      <Pressable
        style={[
          styles.itemCard,
          {
            backgroundColor: selected ? colors.accent.selectionBg : colors.surface.panel,
            borderColor: selected ? colors.accent.primary : colors.border.subtle,
          },
        ]}
        onPress={() => handleItemPress(item)}
        accessibilityState={selectionMode ? { selected } : undefined}
      >
        {selectionMode ? (
          <ListSelectionCheckbox selected={selected} />
        ) : (
          <View style={[styles.itemIcon, { backgroundColor: colors.accent.selectionBg }]}>
            <Icon source={NOTE_KIND_ICONS[item.kind] ?? 'lightbulb-outline'} size={20} color={colors.accent.primary} />
          </View>
        )}
        <InboxItemContent note={item} />
      </Pressable>
    );
  }, [
    colors.accent.primary,
    colors.accent.selectionBg,
    colors.border.subtle,
    colors.surface.panel,
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
        onBack={selectionMode ? exitSelectionMode : () => dismissOrHome(router)}
        overflowMenuItems={selectionMode ? undefined : headerOverflowMenu}
        overflowMenuA11yLabel={li.moreMenu}
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

      <BatchDeleteConfirmDialog
        visible={showBatchDelete}
        count={selectedCount}
        onDismiss={() => setShowBatchDelete(false)}
        onConfirm={() => deleteMutation.mutate([...selectedIds])}
        loading={deleteMutation.isPending}
      />

      <AppToast
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg('')}
        duration={TOAST_DURATION_SHORT}
        bottomLift={TOAST_BOTTOM_LIFT_ABOVE_BAR}
      >
        {snackMsg}
      </AppToast>
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
