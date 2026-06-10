/**
 * HomeScreen — unified entry point with smart input, quick actions,
 * and a mixed recent list (chats + notes sorted by time).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ActivityIndicator, Icon, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, useMessages } from '../../i18n/messages';
import { queryKeys } from '../../query/keys';
import { fetchNotes, type NoteIndexEntry } from '../../query/notes';
import {
  createSession,
  fetchSessionsList,
  type SessionListItem,
} from '../../query/sessions';
import { useGatewayConfigured } from '../../query/sessions';
import { resolveEffectiveDefaultAgentId } from '../../query/agents';
import { usePreferencesStore } from '../../stores/preferences-store';
import { useTheme } from '../../theme';

import {
  formatRelativeTime,
  mergeRecentItems,
  type RecentItem,
} from './recent-items';

type RecentFilter = 'all' | 'chats' | 'notes';

const RECENT_SESSIONS_LIMIT = 20;
const RECENT_NOTES_LIMIT = 20;

export function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const hp = m.homePage;
  const insets = useSafeAreaInsets();

  const [inputText, setInputText] = useState('');
  const [recentFilter, setRecentFilter] = useState<RecentFilter>('all');

  // ── Data queries ──────────────────────────────────────

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessionsRecent,
    queryFn: () => fetchSessionsList({ limit: RECENT_SESSIONS_LIMIT }),
    enabled: configured,
  });

  const notesQuery = useQuery({
    queryKey: queryKeys.notes,
    queryFn: () => fetchNotes({ limit: RECENT_NOTES_LIMIT }),
    enabled: configured,
  });

  const sessions = sessionsQuery.data?.items ?? [];
  const notes = notesQuery.data?.items ?? [];

  const recentItems = useMemo(() => {
    const merged = mergeRecentItems(sessions, notes);
    if (recentFilter === 'chats') return merged.filter((i) => i.kind === 'chat');
    if (recentFilter === 'notes') return merged.filter((i) => i.kind === 'note');
    return merged;
  }, [sessions, notes, recentFilter]);

  // ── New chat mutation ─────────────────────────────────

  const localDefaultAgentId = usePreferencesStore((s) => s.defaultAgentId);

  const createChatMutation = useMutation({
    mutationFn: (agentId?: string) =>
      createSession(agentId ?? localDefaultAgentId ?? undefined, { forceNew: true }),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      router.push({ pathname: '/chat/[k]', params: { k: key } });
    },
  });

  // ── Handlers ──────────────────────────────────────────

  const handleInputSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    // Create a new chat and pass the initial message via query param
    createChatMutation.mutate(undefined, {
      onSuccess: (key) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        router.push({ pathname: '/chat/[k]', params: { k: key, msg: text } });
      },
    });
  }, [inputText, createChatMutation, queryClient, router]);

  const handleNewChat = useCallback(() => {
    createChatMutation.mutate(undefined);
  }, [createChatMutation]);

  const handleNewNote = useCallback(() => {
    router.push('/notes');
  }, [router]);

  const handleRecentItemPress = useCallback(
    (item: RecentItem) => {
      if (item.kind === 'chat') {
        router.push({ pathname: '/chat/[k]', params: { k: item.session.key } });
      } else {
        router.push(`/notes/${item.note.id}`);
      }
    },
    [router],
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes }),
    ]);
  }, [queryClient]);

  // ── Colors ────────────────────────────────────────────

  const pageBg = colors.surface.base;
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const inputBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const chipBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const chipActiveBg = colors.accent.primary;
  const chatBadgeBg = isDark ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.08)';
  const noteBadgeBg = isDark ? 'rgba(255,159,10,0.15)' : 'rgba(255,159,10,0.08)';

  // ── Filter chips ──────────────────────────────────────

  const filterChips: { key: RecentFilter; label: string }[] = [
    { key: 'all', label: hp.filterAll },
    { key: 'chats', label: hp.filterChats },
    { key: 'notes', label: hp.filterNotes },
  ];

  // ── Render helpers ────────────────────────────────────

  const renderRecentItem = useCallback(
    ({ item }: { item: RecentItem }) => {
      const isChat = item.kind === 'chat';
      const icon = isChat ? 'chat-outline' : 'note-text-outline';
      const iconColor = isChat ? '#007AFF' : '#FF9F0A';
      const rowBg = isChat ? chatBadgeBg : noteBadgeBg;

      const label = isChat
        ? item.session.name?.trim() || item.session.key.slice(0, 24)
        : item.note.snippet?.trim() || item.note.id.slice(0, 16);

      const timeLabel = formatRelativeTime(
        item.timestamp,
        { justNow: hp.justNow, minutesAgo: hp.minutesAgo, hoursAgo: hp.hoursAgo, daysAgo: hp.daysAgo },
        t,
      );

      return (
        <Pressable
          style={[styles.recentRow, { backgroundColor: rowBg }]}
          onPress={() => handleRecentItemPress(item)}
        >
          <Icon source={icon} size={18} color={iconColor} />
          <Text numberOfLines={1} style={[styles.recentLabel, { color: colors.text.primary }]}>
            {label}
          </Text>
          <Text style={[styles.recentTime, { color: colors.text.tertiary }]}>{timeLabel}</Text>
        </Pressable>
      );
    },
    [chatBadgeBg, noteBadgeBg, colors.text.primary, colors.text.tertiary, hp, handleRecentItemPress],
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {/* ── Smart input box ── */}
      <View style={[styles.inputBox, { backgroundColor: inputBg, borderColor: colors.border.default }]}>
        <Icon source="star-four-points-outline" size={18} color={colors.accent.primary} />
        <TextInput
          style={[styles.inputField, { color: colors.text.primary }]}
          placeholder={hp.inputPlaceholder}
          placeholderTextColor={colors.text.tertiary}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleInputSubmit}
          returnKeyType="send"
          blurOnSubmit
        />
        {inputText.trim() ? (
          <Pressable
            style={[styles.sendBtn, { backgroundColor: colors.accent.primary }]}
            onPress={handleInputSubmit}
            disabled={createChatMutation.isPending}
            hitSlop={8}
          >
            {createChatMutation.isPending ? (
              <ActivityIndicator size={16} color="#FFFFFF" />
            ) : (
              <Icon source="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        ) : null}
      </View>

      {/* ── Quick action chips ── */}
      <View style={styles.quickRow}>
        <Pressable
          style={[styles.quickChip, { backgroundColor: chatBadgeBg }]}
          onPress={handleNewChat}
          disabled={createChatMutation.isPending}
        >
          <Icon source="robot-outline" size={16} color="#007AFF" />
          <Text style={[styles.quickLabel, { color: '#007AFF' }]}>{hp.quickNewChat}</Text>
        </Pressable>
        <Pressable
          style={[styles.quickChip, { backgroundColor: noteBadgeBg }]}
          onPress={handleNewNote}
        >
          <Icon source="note-edit-outline" size={16} color="#FF9F0A" />
          <Text style={[styles.quickLabel, { color: '#FF9F0A' }]}>{hp.quickNewNote}</Text>
        </Pressable>
      </View>

      {/* ── Recent section header + filter chips ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
          {hp.sectionRecent}
        </Text>
        <View style={styles.filterRow}>
          {filterChips.map((chip) => {
            const active = recentFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? chipActiveBg : chipBg },
                ]}
                onPress={() => setRecentFilter(chip.key)}
              >
                <Text
                  style={[
                    styles.filterChipLabel,
                    { color: active ? '#FFFFFF' : colors.text.secondary },
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  const isLoading = sessionsQuery.isLoading || notesQuery.isLoading;
  const isRefreshing =
    (sessionsQuery.isFetching && !sessionsQuery.isLoading) ||
    (notesQuery.isFetching && !notesQuery.isLoading);

  // ── Unconfigured fallback ─────────────────────────────

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <View style={styles.emptyCenter}>
          <Icon source="home-outline" size={48} color={colors.text.tertiary} />
          <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: '600', marginTop: 12 }}>
            {hp.emptyTitle}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: 'center', maxWidth: 260 }}>
            {m.sessions.gatewayNotConfiguredHint}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: pageBg, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>XOPC</Text>
        <IconButton
          icon="cog-outline"
          size={22}
          iconColor={colors.text.tertiary}
          onPress={() => router.push('/settings')}
        />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.emptyCenter}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={recentItems}
          keyExtractor={(item) => item.key}
          renderItem={renderRecentItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accent.selectionBg }]}>
                <Icon source="home-heart" size={40} color={colors.accent.primary} />
              </View>
              <Text style={{ color: colors.text.secondary, marginTop: 12, fontSize: 16, fontWeight: '600' }}>
                {hp.emptyTitle}
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
                {hp.emptyHint}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  listHeader: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 4,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  filterChipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 12,
  },
  recentLabel: {
    flex: 1,
    fontSize: 14,
  },
  recentTime: {
    fontSize: 12,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 6,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
