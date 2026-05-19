/**
 * Drawer sidebar — Kimi-style profile card, tools menu, searchable grouped history.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions } from '@react-navigation/native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import Constants from 'expo-constants';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Icon,
  IconButton,
  Searchbar,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGatewayConnectLanding } from '../features/gateway/gateway-connect-context';
import { useMessages, t } from '../i18n/messages';
import { fetchChatAgents } from '../query/agents';
import { queryKeys } from '../query/keys';
import {
  createSession,
  fetchSessionsList,
  useGatewayConfigured,
} from '../query/sessions';
import type { SessionListItem } from '../query/sessions';

function groupSessions(
  items: SessionListItem[],
  labels: { sectionThisWeek: string; sectionThisYear: string; sectionEarlier: string },
): { title: string; data: SessionListItem[] }[] {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  const thisWeek: SessionListItem[] = [];
  const thisYear: SessionListItem[] = [];
  const earlier: SessionListItem[] = [];

  for (const s of items) {
    const time = new Date(s.updatedAt).getTime();
    if (Number.isNaN(time)) {
      earlier.push(s);
      continue;
    }
    if (time >= weekAgo) thisWeek.push(s);
    else if (time >= yearStart) thisYear.push(s);
    else earlier.push(s);
  }

  const out: { title: string; data: SessionListItem[] }[] = [];
  if (thisWeek.length) out.push({ title: labels.sectionThisWeek, data: thisWeek });
  if (thisYear.length) out.push({ title: labels.sectionThisYear, data: thisYear });
  if (earlier.length) out.push({ title: labels.sectionEarlier, data: earlier });
  return out;
}

export function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const { openGatewayConnectLanding } = useGatewayConnectLanding();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const configured = useGatewayConfigured();
  const m = useMessages();
  const dm = m.drawer;
  const params = useGlobalSearchParams<{ k?: string }>();
  const rawK = params.k;
  const activeKey = typeof rawK === 'string' ? rawK : Array.isArray(rawK) ? rawK[0] : '';

  const [searchQuery, setSearchQuery] = useState('');

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: fetchSessionsList,
    enabled: configured,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
  });

  const sessions = sessionsQuery.data ?? [];
  const defaultAgentId = agentsQuery.data?.defaultId ?? 'main';
  const defaultAgentName =
    agentsQuery.data?.items.find((a) => a.id === defaultAgentId)?.name?.trim() || defaultAgentId;

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q),
    );
  }, [sessions, searchQuery]);

  const sections = useMemo(
    () =>
      groupSessions(filteredSessions, {
        sectionThisWeek: dm.sectionThisWeek,
        sectionThisYear: dm.sectionThisYear,
        sectionEarlier: dm.sectionEarlier,
      }),
    [filteredSessions, dm.sectionThisWeek, dm.sectionThisYear, dm.sectionEarlier],
  );

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const createMut = useMutation({
    mutationFn: (_agentId?: string) => createSession(_agentId),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      router.setParams({ k: key });
      router.navigate({ pathname: '/', params: { k: key } });
      navigation.dispatch(DrawerActions.closeDrawer());
    },
  });

  const handleNewChat = useCallback(() => {
    createMut.mutate(undefined);
  }, [createMut]);

  const handleSessionTap = useCallback(
    (session: SessionListItem) => {
      router.navigate({ pathname: '/', params: { k: session.key } });
      navigation.dispatch(DrawerActions.closeDrawer());
    },
    [navigation, router],
  );

  const colors = {
    pageBg: isDark ? '#000000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#F5F5F7' : '#1C1C1E',
    textMuted: isDark ? '#8E8E93' : '#6D6D70',
    border: isDark ? '#38383A' : '#E5E5EA',
    accent: '#007AFF',
    activeRow: isDark ? 'rgba(0,122,255,0.18)' : 'rgba(0,122,255,0.10)',
    blueAvatar: '#007AFF',
  };

  const renderSessionRow = useCallback(
    (item: SessionListItem) => {
      const label = item.name?.trim() || item.key.slice(-24);
      const active = item.key === activeKey;
      return (
        <TouchableRipple
          key={item.key}
          style={[styles.sessionRow, active && { backgroundColor: colors.activeRow }]}
          onPress={() => handleSessionTap(item)}
          rippleColor={colors.activeRow}
        >
          <View style={styles.sessionRowInner}>
            <Icon source="chat-outline" size={18} color={colors.textMuted} />
            <Text numberOfLines={1} style={[styles.sessionLabel, { color: colors.text }]}>
              {label}
            </Text>
          </View>
        </TouchableRipple>
      );
    },
    [activeKey, colors.activeRow, colors.text, colors.textMuted, handleSessionTap],
  );

  if (!configured) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top + 24, backgroundColor: colors.pageBg }]}>
        <Text style={[styles.fallbackText, { color: colors.text }]}>{m.sessions.gatewayNotConfigured}</Text>
        <Text style={[styles.fallbackHint, { color: colors.textMuted }]}>{m.sessions.gatewayNotConfiguredHint}</Text>
        <Pressable
          style={[styles.newChatCta, { backgroundColor: colors.accent, marginTop: 16 }]}
          onPress={openGatewayConnectLanding}
        >
          <Text style={styles.newChatCtaLabel}>{m.sessions.connectGateway}</Text>
        </Pressable>
        <Pressable style={styles.secondaryLink} onPress={() => router.push('/settings')}>
          <Text style={[styles.secondaryLinkLabel, { color: colors.accent }]}>{m.sessions.openSettings}</Text>
        </Pressable>
      </View>
    );
  }

  if (sessionsQuery.isLoading) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top + 48, backgroundColor: colors.pageBg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const listEmpty =
    filteredSessions.length === 0 ? (
      <View style={styles.emptyWrap}>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
          {sessions.length === 0
            ? m.sessions.empty
            : t(m.sessions.noResultsHint, { query: searchQuery.trim() || '…' })}
        </Text>
      </View>
    ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBg, paddingTop: insets.top }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {/* Profile + actions */}
        <View style={[styles.card, { backgroundColor: colors.card, marginTop: 8 }]}>
          <View style={styles.profileRow}>
            <View style={styles.profileLeft}>
              <View style={[styles.avatar, { backgroundColor: colors.blueAvatar }]}>
                <Icon source="robot-outline" size={26} color="#FFFFFF" />
              </View>
              <View style={styles.profileText}>
                <Text style={[styles.profileName, { color: colors.text }]}>{dm.profileFallbackName}</Text>
                <View style={[styles.badge, { backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7' }]}>
                  <Text style={[styles.badgeText, { color: colors.textMuted }]} numberOfLines={1}>
                    {defaultAgentName}
                  </Text>
                </View>
              </View>
            </View>
            <IconButton
              icon="cog-outline"
              size={22}
              iconColor={colors.textMuted}
              onPress={() => {
                navigation.dispatch(DrawerActions.closeDrawer());
                router.push('/settings');
              }}
            />
          </View>

          <Text style={[styles.versionHint, { color: colors.textMuted }]}>v{appVersion}</Text>

          <Pressable
            style={[styles.newChatCta, { backgroundColor: colors.accent }]}
            onPress={handleNewChat}
            disabled={createMut.isPending}
          >
            <Icon source="plus" size={20} color="#FFFFFF" />
            <Text style={styles.newChatCtaLabel}>{dm.newChat}</Text>
          </Pressable>
        </View>

        {/* History */}
        <View style={[styles.card, styles.historyCard, { backgroundColor: colors.card }]}>
          <View style={styles.historyTitleRow}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{dm.historyTitle}</Text>
            <Searchbar
              placeholder={dm.search}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[styles.searchBar, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}
              inputStyle={{ fontSize: 14, minHeight: 0 }}
              iconColor={colors.textMuted}
              placeholderTextColor={colors.textMuted}
              elevation={0}
            />
          </View>

          {sections.length === 0 ? (
            listEmpty
          ) : (
            sections.map((section) => (
              <View key={section.title}>
                <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{section.title}</Text>
                {section.data.map((item) => renderSessionRow(item))}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  historyCard: {
    paddingBottom: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '100%',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionHint: {
    fontSize: 11,
    marginTop: 6,
    marginBottom: 12,
  },
  newChatCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 22,
  },
  newChatCtaLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  historyTitleRow: {
    gap: 10,
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchBar: {
    borderRadius: 14,
    height: 40,
    marginHorizontal: 0,
    elevation: 0,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
    marginLeft: 4,
  },
  sessionRow: {
    borderRadius: 12,
    marginBottom: 2,
  },
  sessionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  sessionLabel: {
    fontSize: 14,
    flex: 1,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  fallback: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  fallbackText: {
    textAlign: 'center',
    fontSize: 15,
    opacity: 0.85,
  },
  fallbackHint: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  secondaryLink: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryLinkLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
