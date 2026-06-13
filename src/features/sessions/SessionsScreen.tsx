import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppToast } from '../../components/AppToast';
import { BatchActionBar } from '../../components/BatchActionBar';
import { BatchDeleteConfirmDialog } from '../../components/BatchDeleteConfirmDialog';
import { FloatingHeader } from '../../components/FloatingHeader';
import { SwipeableRow, type SwipeRowAction } from '../../components/SwipeableRow';
import { SwipeHintBanner } from '../../components/SwipeHintBanner';
import { TOAST_DURATION_SHORT } from '../../constants/toast';
import { useListSelection } from '../../hooks/use-list-selection';
import { useMessages, t } from '../../i18n/messages';
import { sessionDisplayName } from '../../lib/session-helpers';
import { useFlatListEndReached } from '../../lib/use-flat-list-end-reached';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
import { refreshSessionsList } from '../../query/infinite-list-sync';
import { queryKeys } from '../../query/keys';
import {
  archiveSession,
  deleteSession,
  fetchSessionsList,
  pinSession,
  renameSession,
  type SessionListItem,
  type SessionsPage,
  unarchiveSession,
  useGatewayConfigured,
} from '../../query/sessions';
import { useTheme } from '../../theme';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { RenameDialog } from './RenameDialog';
import { SessionCard } from './SessionCard';

const PAGE_SIZE = 20;

type SessionSwipeAction = 'archive' | 'unarchive' | 'delete';

export function SessionsScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const sm = m.sessionsPage;
  const sa = m.sessionActions;
  const li = m.listInteraction;
  const configured = useGatewayConfigured();
  const [snackMsg, setSnackMsg] = useState('');
  const [renameTarget, setRenameTarget] = useState<SessionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionListItem | null>(null);
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

  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.sessionsAll,
    queryFn: ({ pageParam }) => fetchSessionsList({ limit: PAGE_SIZE, offset: pageParam, channel: null }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: SessionsPage) => lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    enabled: configured,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const allSessions = sessionsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const refreshList = useCallback(async () => {
    await refreshSessionsList(queryClient);
  }, [queryClient]);

  const runBatchArchive = useCallback(async () => {
    const keys = [...selectedIds];
    await Promise.all(keys.map(async (key) => {
      const session = allSessions.find((item) => item.key === key);
      if (!session) return;
      if (session.status === 'archived') {
        await unarchiveSession(key);
        return;
      }
      await archiveSession(key);
    }));
    await refreshList();
    setSnackMsg(sa.sessionArchived);
    exitSelectionMode();
  }, [allSessions, exitSelectionMode, refreshList, sa.sessionArchived, selectedIds]);

  const runBatchPin = useCallback(async () => {
    const keys = [...selectedIds];
    await Promise.all(keys.map(async (key) => {
      const session = allSessions.find((item) => item.key === key);
      if (!session || session.status === 'pinned') return;
      await pinSession(key);
    }));
    await refreshList();
    setSnackMsg(sa.sessionPinned);
    exitSelectionMode();
  }, [allSessions, exitSelectionMode, refreshList, sa.sessionPinned, selectedIds]);

  const archiveMutation = useMutation({
    mutationFn: async ({ session, action }: { session: SessionListItem; action: 'archive' | 'unarchive' }) => {
      if (action === 'archive') await archiveSession(session.key);
      else await unarchiveSession(session.key);
    },
    onSuccess: async (_data, variables) => {
      await refreshList();
      setSnackMsg(variables.action === 'archive' ? sa.sessionArchived : sa.sessionUnarchived);
    },
    onError: (error, variables) => {
      const msg = variables.action === 'archive' ? sa.failedToArchive : sa.failedToUnarchive;
      setSnackMsg(error instanceof Error ? error.message : msg);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ key, name }: { key: string; name: string }) => renameSession(key, name),
    onSuccess: async () => {
      setRenameTarget(null);
      await refreshList();
      setSnackMsg(sa.sessionRenamed);
      exitSelectionMode();
    },
    onError: (error) => setSnackMsg(error instanceof Error ? error.message : sa.failedToRename),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteSession(key),
    onSuccess: async () => {
      setDeleteTarget(null);
      await refreshList();
      setSnackMsg(sa.sessionDeleted);
    },
    onError: (error) => setSnackMsg(error instanceof Error ? error.message : sa.failedToDelete),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      await Promise.all(keys.map((key) => deleteSession(key)));
    },
    onSuccess: async (_data, keys) => {
      await refreshList();
      setSnackMsg(keys.length > 1 ? t(li.batchDeleted, { count: keys.length }) : sa.sessionDeleted);
      exitSelectionMode();
      setShowBatchDelete(false);
    },
    onError: (error) => setSnackMsg(error instanceof Error ? error.message : sa.failedToDelete),
  });

  const handleOpenSession = useCallback((session: SessionListItem) => {
    router.push(`/chat/${session.key}`);
  }, [router]);

  const handleSessionPress = useCallback((session: SessionListItem) => {
    if (selectionMode) {
      toggleSelected(session.key);
      return;
    }
    handleOpenSession(session);
  }, [handleOpenSession, selectionMode, toggleSelected]);

  const handleSessionLongPress = useCallback((session: SessionListItem) => {
    if (selectionMode) {
      toggleSelected(session.key);
      return;
    }
    enterSelection(session.key);
  }, [enterSelection, selectionMode, toggleSelected]);

  const handleSwipeAction = useCallback((session: SessionListItem, action: SessionSwipeAction) => {
    if (action === 'delete') {
      setDeleteTarget(session);
      return;
    }
    archiveMutation.mutate({
      session,
      action: action === 'unarchive' ? 'unarchive' : 'archive',
    });
  }, [archiveMutation]);

  const buildSwipeActions = useCallback((session: SessionListItem): SwipeRowAction[] => {
    const isArchived = session.status === 'archived';
    const archiveAction: SessionSwipeAction = isArchived ? 'unarchive' : 'archive';
    return [
      {
        key: archiveAction,
        icon: isArchived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline',
        label: isArchived ? sa.unarchive : sa.archive,
        color: 'blue',
        onPress: () => handleSwipeAction(session, archiveAction),
      },
      {
        key: 'delete',
        icon: 'trash-can-outline',
        label: sa.delete,
        color: 'red',
        onPress: () => handleSwipeAction(session, 'delete'),
      },
    ];
  }, [handleSwipeAction, sa.archive, sa.delete, sa.unarchive]);

  const handleBatchRename = useCallback(() => {
    if (selectedCount !== 1) return;
    const key = [...selectedIds][0];
    const session = allSessions.find((item) => item.key === key);
    if (session) setRenameTarget(session);
  }, [allSessions, selectedCount, selectedIds]);

  const batchActions = useMemo(() => [
    {
      key: 'archive',
      icon: 'archive-arrow-down-outline',
      label: sa.archive,
      onPress: () => void runBatchArchive(),
      disabled: selectedCount === 0 || batchDeleteMutation.isPending,
    },
    {
      key: 'pin',
      icon: 'pin-outline',
      label: sa.pin,
      onPress: () => void runBatchPin(),
      disabled: selectedCount === 0 || batchDeleteMutation.isPending,
    },
    {
      key: 'rename',
      icon: 'pencil-outline',
      label: li.rename,
      onPress: handleBatchRename,
      disabled: selectedCount !== 1 || batchDeleteMutation.isPending,
    },
    {
      key: 'delete',
      icon: 'trash-can-outline',
      label: sa.delete,
      destructive: true,
      onPress: () => setShowBatchDelete(true),
      disabled: selectedCount === 0 || batchDeleteMutation.isPending,
      loading: batchDeleteMutation.isPending,
    },
  ], [
    batchDeleteMutation.isPending,
    handleBatchRename,
    li.rename,
    runBatchArchive,
    runBatchPin,
    sa.archive,
    sa.delete,
    sa.pin,
    selectedCount,
  ]);

  const handleLoadMore = useCallback(() => {
    if (!sessionsQuery.hasNextPage || sessionsQuery.isFetchingNextPage) return;
    void sessionsQuery.fetchNextPage();
  }, [sessionsQuery.fetchNextPage, sessionsQuery.hasNextPage, sessionsQuery.isFetchingNextPage]);

  const { onEndReached, onMomentumScrollBegin } = useFlatListEndReached(handleLoadMore);

  const handleRefresh = useCallback(() => {
    void refreshList();
  }, [refreshList]);

  const renderSession = useCallback(({ item }: { item: SessionListItem }) => {
    const selected = selectedIds.has(item.key);
    return (
      <SwipeableRow actions={buildSwipeActions(item)} borderRadius={12} enabled={!selectionMode}>
        <SessionCard
          session={item}
          onPress={() => handleSessionPress(item)}
          onLongPress={() => handleSessionLongPress(item)}
          selectionMode={selectionMode}
          selected={selected}
        />
      </SwipeableRow>
    );
  }, [
    buildSwipeActions,
    handleSessionLongPress,
    handleSessionPress,
    selectedIds,
    selectionMode,
  ]);

  const renderListFooter = useCallback(() => {
    if (sessionsQuery.isFetchingNextPage) {
      return <View style={styles.footerLoader}><ActivityIndicator size="small" /></View>;
    }
    return null;
  }, [sessionsQuery.isFetchingNextPage]);

  const listBottomPadding = selectionMode ? insets.bottom + 120 : insets.bottom + 24;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader
        title={selectionMode ? t(li.selectedCount, { count: selectedCount }) : sm.title}
        onBack={selectionMode ? exitSelectionMode : () => dismissOrHome(router)}
        rightLabel={selectionMode ? undefined : li.select}
        onRightLabelPress={selectionMode ? undefined : startSelection}
        rightIcon={selectionMode ? undefined : 'robot-outline'}
        onRightPress={selectionMode ? undefined : () => router.push('/ai/agents')}
      />

      {!configured ? (
        <View style={styles.center}>
          <Icon source="cloud-off-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{m.sessions.gatewayNotConfigured}</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{m.sessions.gatewayNotConfiguredHint}</Text>
        </View>
      ) : sessionsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <SwipeHintBanner hasItems={!selectionMode && allSessions.length > 0} />
          <FlatList
            data={allSessions}
            keyExtractor={(item) => item.key}
            renderItem={renderSession}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            onMomentumScrollBegin={onMomentumScrollBegin}
            ListFooterComponent={renderListFooter}
            extraData={{ selectionMode, selectedCount, selectedKey: [...selectedIds].join('|') }}
            refreshControl={
              <RefreshControl
                refreshing={sessionsQuery.isFetching && !sessionsQuery.isLoading && !sessionsQuery.isFetchingNextPage}
                onRefresh={handleRefresh}
              />
            }
            contentContainerStyle={[styles.list, { paddingBottom: listBottomPadding }]}
            ListEmptyComponent={
              <View style={styles.center}>
                <Icon source="message-processing-outline" size={42} color={colors.text.tertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{sm.empty}</Text>
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{sm.emptyHint}</Text>
              </View>
            }
          />
        </>
      )}

      {selectionMode ? <BatchActionBar items={batchActions} /> : null}

      <RenameDialog
        visible={Boolean(renameTarget)}
        currentName={renameTarget ? sessionDisplayName(renameTarget) : ''}
        loading={renameMutation.isPending}
        onDismiss={() => setRenameTarget(null)}
        onRename={(name) => {
          if (!renameTarget) return;
          renameMutation.mutate({ key: renameTarget.key, name });
        }}
      />

      <DeleteConfirmDialog
        visible={Boolean(deleteTarget)}
        sessionName={deleteTarget ? sessionDisplayName(deleteTarget) : ''}
        loading={deleteMutation.isPending}
        onDismiss={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.key);
        }}
      />

      <BatchDeleteConfirmDialog
        visible={showBatchDelete}
        count={selectedCount}
        onDismiss={() => setShowBatchDelete(false)}
        onConfirm={() => batchDeleteMutation.mutate([...selectedIds])}
        loading={batchDeleteMutation.isPending}
      />

      <AppToast visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={TOAST_DURATION_SHORT}>
        {snackMsg}
      </AppToast>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  list: { paddingVertical: 12, flexGrow: 1 },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
