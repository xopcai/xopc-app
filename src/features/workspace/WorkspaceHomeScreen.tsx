import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { queryKeys } from '../../query/keys';
import { fetchHome } from '../../query/home';
import { createBlankNote, type NoteIndexEntry } from '../../query/notes';
import { useGatewayConfigured } from '../../query/sessions';
import { useTheme } from '../../theme';

import { BottomCommandBar } from './BottomCommandBar';
import { ContinueRail } from './ContinueRail';
import { InboxPreview } from './InboxPreview';
import { SpaceList } from './SpaceList';
import { TodayBrief } from './TodayBrief';
import { useHomeChatPrefetch } from './use-home-chat-prefetch';
import { useWorkspaceNavigation } from './workspace-navigation-context';

export function WorkspaceHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const configured = useGatewayConfigured();
  const { openAskAi, prefetchAskAiSession } = useWorkspaceNavigation();

  useHomeChatPrefetch(configured);

  const homeQuery = useQuery({
    queryKey: queryKeys.home,
    queryFn: fetchHome,
    enabled: configured,
  });

  const handleNotePress = useCallback((item: NoteIndexEntry) => {
    if (item.kind === 'task') {
      router.push(`/items/${item.id}`);
      return;
    }
    router.push(`/items/${item.id}`);
  }, [router]);

  const handleSessionPress = useCallback((sessionKey: string) => {
    router.push(`/chat/${sessionKey}`);
  }, [router]);

  const handleRefresh = useCallback(() => {
    void homeQuery.refetch().then(() => {
      prefetchAskAiSession();
    });
  }, [homeQuery, prefetchAskAiSession]);

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
        <FloatingHeader title="工作空间" rightIcon="cog-outline" onRightPress={() => router.push('/settings')} />
        <View style={styles.centerContent}>
          <Icon source="cloud-off-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>连接你的 XOPC Gateway</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>连接后即可使用 AI 原生工作空间。</Text>
        </View>
      </View>
    );
  }

  const home = homeQuery.data;
  const refreshing = homeQuery.isFetching && !homeQuery.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
      <FloatingHeader title="工作空间" rightIcon="cog-outline" onRightPress={() => router.push('/settings')} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {homeQuery.isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <TodayBrief
              inboxCount={home?.inboxCount ?? 0}
              pendingTaskCount={home?.pendingTaskCount ?? 0}
              onInboxPress={() => router.push('/inbox')}
              onTasksPress={() => router.push('/notes?kind=task')}
            />
            <ContinueRail items={home?.recentlyOpened ?? []} onItemPress={handleNotePress} />
            <InboxPreview count={home?.inboxCount ?? 0} onOpenInbox={() => router.push('/inbox')} />
            <SpaceList
              sessions={home?.recentSessions ?? []}
              onSessionPress={handleSessionPress}
            />
          </>
        )}
      </ScrollView>

      <BottomCommandBar
        bottomInset={insets.bottom}
        onSearch={() => router.push('/search')}
        onAskAi={openAskAi}
        onAskAiPressIn={prefetchAskAiSession}
        onCreate={async () => {
          try {
            const { note } = await createBlankNote();
            router.push(`/notes/${note.id}`);
          } catch {
            router.push('/notes');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
});
