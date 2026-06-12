import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Snackbar, Text } from 'react-native-paper';

import { FloatingHeader } from '../../components/FloatingHeader';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
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

import { SessionCard, type SessionAction } from './SessionCard';

const PAGE_SIZE = 20;

export function SessionsScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const configured = useGatewayConfigured();
  const [snackMsg, setSnackMsg] = useState('');

  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.sessionsAll,
    queryFn: ({ pageParam }) => fetchSessionsList({ limit: PAGE_SIZE, offset: pageParam, channel: null }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: SessionsPage) => lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    enabled: configured,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const allSessions = sessionsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = sessionsQuery.data?.pages[sessionsQuery.data.pages.length - 1]?.hasMore ?? false;

  const actionMutation = useMutation({
    mutationFn: async ({ session, action }: { session: SessionListItem; action: SessionAction }) => {
      if (action === 'open') return;
      if (action === 'rename') {
        await renameSession(session.key, session.name?.trim() || session.title?.trim() || '新对话');
        return;
      }
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
        return;
      }
      await deleteSession(session.key);
    },
    onSuccess: async (_data, variables) => {
      if (variables.action === 'open') return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
      setSnackMsg(variables.action === 'delete' ? '对话已删除' : '对话已更新');
    },
    onError: (error) => setSnackMsg(error instanceof Error ? error.message : '操作失败'),
  });

  const handleOpenSession = useCallback((session: SessionListItem) => {
    router.push(`/chat/${session.key}`);
  }, [router]);

  const handleSessionAction = useCallback((session: SessionListItem, action: SessionAction) => {
    if (action === 'open') {
      handleOpenSession(session);
      return;
    }
    actionMutation.mutate({ session, action });
  }, [actionMutation, handleOpenSession]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !sessionsQuery.isFetching && !sessionsQuery.isFetchingNextPage) {
      sessionsQuery.fetchNextPage();
    }
  }, [hasMore, sessionsQuery]);

  const handleRefresh = useCallback(() => {
    void sessionsQuery.refetch();
  }, [sessionsQuery]);

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
      <FloatingHeader title="全部对话" onBack={() => dismissOrHome(router)} />

      {!configured ? (
        <View style={styles.center}>
          <Icon source="cloud-off-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>未连接网关</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>连接后即可查看所有对话。</Text>
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
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
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
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>还没有对话</Text>
              <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>开始一次 AI 对话后会显示在这里。</Text>
            </View>
          }
        />
      )}

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
