import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Snackbar, Text } from 'react-native-paper';

import { FloatingHeader } from '../../components/FloatingHeader';
import { useMessages } from '../../i18n/messages';
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
  unpinSession,
  useGatewayConfigured,
} from '../../query/sessions';
import { useTheme } from '../../theme';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { RenameDialog } from './RenameDialog';
import { SessionCard, type SessionAction } from './SessionCard';

const PAGE_SIZE = 20;

type SessionMutationAction = Exclude<SessionAction, 'open' | 'rename' | 'delete'>;

export function SessionsScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const m = useMessages();
  const sm = m.sessionsPage;
  const sa = m.sessionActions;
  const configured = useGatewayConfigured();
  const [snackMsg, setSnackMsg] = useState('');
  const [renameTarget, setRenameTarget] = useState<SessionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionListItem | null>(null);

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

  const actionMutation = useMutation({
    mutationFn: async ({ session, action }: { session: SessionListItem; action: SessionMutationAction }) => {
      if (action === 'pin') {
        await pinSession(session.key);
        return;
      }
      if (action === 'unpin') {
        await unpinSession(session.key);
        return;
      }
      if (action === 'archive') {
        await archiveSession(session.key);
        return;
      }
      if (action === 'unarchive') {
        await unarchiveSession(session.key);
      }
    },
    onSuccess: async (_data, variables) => {
      await refreshList();
      const msg = {
        pin: sa.sessionPinned,
        unpin: sa.sessionUnpinned,
        archive: sa.sessionArchived,
        unarchive: sa.sessionUnarchived,
      }[variables.action];
      setSnackMsg(msg);
    },
    onError: (error, variables) => {
      const msg = {
        pin: sa.failedToPin,
        unpin: sa.failedToUnpin,
        archive: sa.failedToArchive,
        unarchive: sa.failedToUnarchive,
      }[variables.action];
      setSnackMsg(error instanceof Error ? error.message : msg);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ key, name }: { key: string; name: string }) => renameSession(key, name),
    onSuccess: async () => {
      setRenameTarget(null);
      await refreshList();
      setSnackMsg(sa.sessionRenamed);
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

  const handleOpenSession = useCallback((session: SessionListItem) => {
    router.push(`/chat/${session.key}`);
  }, [router]);

  const handleSessionAction = useCallback((session: SessionListItem, action: SessionAction) => {
    if (action === 'open') {
      handleOpenSession(session);
      return;
    }
    if (action === 'rename') {
      setRenameTarget(session);
      return;
    }
    if (action === 'delete') {
      setDeleteTarget(session);
      return;
    }
    actionMutation.mutate({ session, action });
  }, [actionMutation, handleOpenSession]);

  const handleLoadMore = useCallback(() => {
    if (!sessionsQuery.hasNextPage || sessionsQuery.isFetchingNextPage) return;
    void sessionsQuery.fetchNextPage();
  }, [sessionsQuery.fetchNextPage, sessionsQuery.hasNextPage, sessionsQuery.isFetchingNextPage]);

  const { onEndReached, onMomentumScrollBegin } = useFlatListEndReached(handleLoadMore);

  const handleRefresh = useCallback(() => {
    void refreshList();
  }, [refreshList]);

  const renderSession = useCallback(({ item }: { item: SessionListItem }) => (
    <SessionCard
      session={item}
      onPress={() => handleOpenSession(item)}
      onAction={(action) => handleSessionAction(item, action)}
    />
  ), [handleOpenSession, handleSessionAction]);

  const renderListFooter = useCallback(() => {
    if (sessionsQuery.isFetchingNextPage) {
      return <View style={styles.footerLoader}><ActivityIndicator size="small" /></View>;
    }
    return null;
  }, [sessionsQuery.isFetchingNextPage]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <FloatingHeader title={sm.title} onBack={() => dismissOrHome(router)} />

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
        <FlatList
          data={allSessions}
          keyExtractor={(item) => item.key}
          renderItem={renderSession}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onMomentumScrollBegin={onMomentumScrollBegin}
          ListFooterComponent={renderListFooter}
          refreshControl={
            <RefreshControl
              refreshing={sessionsQuery.isFetching && !sessionsQuery.isLoading && !sessionsQuery.isFetchingNextPage}
              onRefresh={handleRefresh}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon source="message-processing-outline" size={42} color={colors.text.tertiary} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{sm.empty}</Text>
              <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{sm.emptyHint}</Text>
            </View>
          }
        />
      )}

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

      <Snackbar visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={2200}>
        {snackMsg}
      </Snackbar>
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
