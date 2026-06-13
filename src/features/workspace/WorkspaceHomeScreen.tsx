import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { queryKeys } from '../../query/keys';
import { fetchHome } from '../../query/home';
import { resolveNoteListTitle } from '../notes/note-title';
import { readLocalNote } from '../notes/notes-local';
import { blankNoteIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import { createBlankNote, fetchNotes, type NoteIndexEntry } from '../../query/notes';
import { useGatewayConfigured } from '../../query/sessions';
import { useTheme } from '../../theme';

import { WorkspaceSearchOverlay } from '../search/WorkspaceSearchOverlay';
import { AutomationEntry } from './AutomationEntry';
import { InboxPreview } from './InboxPreview';
import { SpaceList } from './SpaceList';
import { TodayBrief } from './TodayBrief';
import { useHomeChatPrefetch } from './use-home-chat-prefetch';
import { useWorkspaceNavigation } from './workspace-navigation-context';

export function WorkspaceHomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const configured = useGatewayConfigured();
  const { openAskAi, prefetchAskAiSession } = useWorkspaceNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const createNoteInFlightRef = useRef(false);

  useHomeChatPrefetch(configured);

  const homeQuery = useQuery({
    queryKey: queryKeys.home,
    queryFn: fetchHome,
    enabled: configured,
  });

  const home = homeQuery.data;
  const recentlyOpened = home?.recentlyOpened ?? [];
  const needsRecentNotesFallback = configured && !homeQuery.isLoading && recentlyOpened.length === 0;

  const recentNotesFallbackQuery = useQuery({
    queryKey: [...queryKeys.notesAll, 'home-preview'] as const,
    queryFn: () =>
      fetchNotes({
        limit: 5,
        offset: 0,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: needsRecentNotesFallback,
    staleTime: 60_000,
  });

  const homeNotes = useMemo(() => {
    if (recentlyOpened.length > 0) return recentlyOpened.slice(0, 5);
    return recentNotesFallbackQuery.data?.items ?? [];
  }, [recentNotesFallbackQuery.data?.items, recentlyOpened]);

  const homeNotesLoading =
    homeQuery.isLoading || (needsRecentNotesFallback && recentNotesFallbackQuery.isLoading);

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
    void homeQuery.refetch().then((result) => {
      const opened = result.data?.recentlyOpened ?? [];
      if (opened.length === 0) {
        void recentNotesFallbackQuery.refetch();
      }
      prefetchAskAiSession();
    });
  }, [homeQuery, recentNotesFallbackQuery, prefetchAskAiSession]);

  const handleCreateNote = useCallback(async () => {
    if (createNoteInFlightRef.current) return;
    createNoteInFlightRef.current = true;
    setCreatingNote(true);
    try {
      const { note } = await createBlankNote();
      upsertNoteInListCaches(queryClient, blankNoteIndexEntry(note.id));
      router.push(`/notes/${note.id}`);
    } catch {
      router.push('/notes');
    } finally {
      createNoteInFlightRef.current = false;
      setCreatingNote(false);
    }
  }, [queryClient, router]);

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
        <FloatingHeader
          showLogo
          searchPlaceholder="搜索笔记和会话…"
          onSearchPress={() => setSearchOpen(true)}
          rightIcon="cog-outline"
          onRightPress={() => router.push('/settings')}
        />
        <View style={styles.centerContent}>
          <Icon source="cloud-off-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>连接你的 XOPC Gateway</Text>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>连接后即可使用 AI 原生工作空间。</Text>
        </View>
        <WorkspaceSearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
      </View>
    );
  }

  const refreshing = homeQuery.isFetching && !homeQuery.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
      <FloatingHeader
        showLogo
        searchPlaceholder="搜索笔记和会话…"
        onSearchPress={() => setSearchOpen(true)}
        rightIcon="cog-outline"
        onRightPress={() => router.push('/settings')}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
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
              notes={homeNotes}
              loading={homeNotesLoading}
              onNotePress={handleNotePress}
              creatingNote={creatingNote}
              onCreateNote={handleCreateNote}
              onViewAll={() => router.push('/notes')}
            />
            <SpaceList
              sessions={(home?.recentSessions ?? []).slice(0, 5)}
              onSessionPress={handleSessionPress}
              onAskAi={openAskAi}
              onAskAiPressIn={prefetchAskAiSession}
              onViewAll={() => router.push('/sessions')}
            />
            <AutomationEntry />
          </>
        )}
      </ScrollView>

      <WorkspaceSearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
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
  loading = false,
  creatingNote = false,
  onNotePress,
  onCreateNote,
  onViewAll,
}: {
  notes: NoteIndexEntry[];
  loading?: boolean;
  creatingNote?: boolean;
  onNotePress: (note: NoteIndexEntry) => void;
  onCreateNote: () => void;
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
        <Pressable
          style={[styles.itemRow, styles.actionRow, creatingNote && styles.actionRowDisabled]}
          onPress={onCreateNote}
          disabled={creatingNote}
        >
          <View style={[styles.iconBubble, styles.actionIconBubble]}>
            {creatingNote ? (
              <ActivityIndicator size={16} color="#6D5DFB" />
            ) : (
              <Icon source="square-edit-outline" size={16} color="#6D5DFB" />
            )}
          </View>
          <View style={styles.itemCopy}>
            <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>新建笔记</Text>
            <Text numberOfLines={1} style={[styles.itemSubtitle, { color: colors.text.tertiary }]}>
              {creatingNote ? '正在创建…' : '创建空白笔记'}
            </Text>
          </View>
          {!creatingNote && <Icon source="chevron-right" size={18} color={colors.text.tertiary} />}
        </Pressable>
        {loading ? (
          <View style={styles.emptyRow}>
            <ActivityIndicator size="small" />
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyRowCompact}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>还没有最近笔记</Text>
          </View>
        ) : (
          notes.map((note) => {
            const title = resolveNoteListTitle(note, '无标题', readLocalNote(note.id));
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
  emptyRowCompact: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10 },
  actionRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(109,93,251,0.12)' },
  actionRowDisabled: { opacity: 0.7 },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109,93,251,0.14)',
  },
  actionIconBubble: { backgroundColor: 'rgba(109,93,251,0.18)' },
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, fontWeight: '400' },
});
