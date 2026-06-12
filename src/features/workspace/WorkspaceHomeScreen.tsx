import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { queryKeys } from '../../query/keys';
import { fetchHome } from '../../query/home';
import { createBlankNote, type NoteIndexEntry } from '../../query/notes';
import { useGatewayConfigured } from '../../query/sessions';
import { useTheme } from '../../theme';

import { BottomCommandBar } from './BottomCommandBar';
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
            <InboxPreview count={home?.inboxCount ?? 0} onOpenInbox={() => router.push('/inbox')} />
            <RecentNotesCard
              notes={(home?.recentlyOpened ?? []).slice(0, 5)}
              onNotePress={handleNotePress}
              onViewAll={() => router.push('/notes')}
            />
            <SpaceList
              sessions={(home?.recentSessions ?? []).slice(0, 5)}
              onSessionPress={handleSessionPress}
              onViewAll={() => router.push('/sessions')}
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

function iconForNoteKind(kind: NoteIndexEntry['kind']): string {
  if (kind === 'task') return 'checkbox-marked-circle-outline';
  if (kind === 'voice') return 'microphone-outline';
  if (kind === 'media') return 'image-outline';
  if (kind === 'bookmark') return 'bookmark-outline';
  return 'note-text-outline';
}

function RecentNotesCard({
  notes,
  onNotePress,
  onViewAll,
}: {
  notes: NoteIndexEntry[];
  onNotePress: (note: NoteIndexEntry) => void;
  onViewAll: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>笔记</Text>
        <Pressable onPress={onViewAll}>
          <Text style={[styles.openText, { color: '#6D5DFB' }]}>查看更多</Text>
        </Pressable>
      </View>
      <View style={[styles.listCard, { backgroundColor: colors.surface.panel }]}> 
        {notes.length === 0 ? (
          <View style={styles.emptyRow}>
            <Icon source="note-text-outline" size={20} color={colors.text.tertiary} />
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>还没有最近笔记</Text>
          </View>
        ) : (
          notes.map((note) => {
            const title = note.title?.trim() || note.snippet || '无标题';
            const subtitle = note.title?.trim() && note.snippet?.trim() ? note.snippet : null;
            return (
            <Pressable key={note.id} style={styles.itemRow} onPress={() => onNotePress(note)}>
              <View style={styles.iconBubble}>
                <Icon source={iconForNoteKind(note.kind)} size={16} color="#6D5DFB" />
              </View>
              <View style={styles.itemCopy}>
                <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>
                  {title}
                </Text>
                {!!subtitle && (
                  <Text numberOfLines={1} style={[styles.itemSubtitle, { color: colors.text.tertiary }]}>
                    {subtitle}
                  </Text>
                )}
              </View>
              <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
            </Pressable>
            );
          })
        )}
      </View>
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
  section: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  openText: { fontSize: 13, fontWeight: '600' },
  listCard: { borderRadius: 20, padding: 8, gap: 2 },
  emptyRow: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10 },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109,93,251,0.14)',
  },
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, fontWeight: '400' },
});
