/**
 * Drawer sidebar — Kimi-style profile card, tools menu, searchable grouped history.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions } from '@react-navigation/native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Checkbox,
  Icon,
  IconButton,
  Searchbar,
  Snackbar,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGatewayConnectLanding } from '../features/gateway/gateway-connect-context';
import { DrawerGatewayConnection } from '../features/gateway/DrawerGatewayConnection';
import { SessionListSkeleton } from '../features/gateway/SessionListSkeleton';
import { DeleteConfirmDialog } from '../features/sessions/DeleteConfirmDialog';
import { RenameDialog } from '../features/sessions/RenameDialog';
import {
  SessionActionPopover,
  type SessionPopoverAction,
} from '../features/sessions/SessionActionPopover';
import { useMessages, t } from '../i18n/messages';
import { useResolvedIsDark } from '../lib/stack-screen-theme';
import { fetchChatAgents, readPlaceholderAgents } from '../query/agents';
import { queryKeys } from '../query/keys';
import { resolveEffectiveDefaultAgentId } from '../query/agents';
import {
  createSession,
  deleteSession,
  fetchSessionsList,
  readPlaceholderSessions,
  renameSession,
  useGatewayConfigured,
} from '../query/sessions';
import { usePreferencesStore } from '../stores/preferences-store';
import type { SessionListItem, SessionsPage } from '../query/sessions';

const SESSIONS_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const SCROLL_LOAD_MORE_THRESHOLD = 120;

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

function sessionDisplayName(item: SessionListItem): string {
  if (item.name?.trim()) return item.name.trim();
  const key = item.key;
  return key.length > 24 ? `…${key.slice(-24)}` : key;
}

export function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const { openGatewayConnectLanding } = useGatewayConnectLanding();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isDark = useResolvedIsDark();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const dm = m.drawer;
  const params = useGlobalSearchParams<{ k?: string }>();
  const rawK = params.k;
  const activeKey = typeof rawK === 'string' ? rawK : Array.isArray(rawK) ? rawK[0] : '';

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState({ x: 0, y: 0, width: 0 });
  const [actionSession, setActionSession] = useState<SessionListItem | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [snackMsg, setSnackMsg] = useState('');
  const rowRefs = useRef<Map<string, View>>(new Map());

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.sessions(debouncedSearch),
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      fetchSessionsList({
        limit: SESSIONS_PAGE_SIZE,
        offset: pageParam,
        search: debouncedSearch,
      }),
    getNextPageParam: (last: SessionsPage) =>
      last.hasMore ? last.offset + last.limit : undefined,
    enabled: configured,
    // Hydrate the no-search first page from MMKV for instant cold-start paint.
    // react-query immediately revalidates because initialDataUpdatedAt is 0.
    initialData: () => {
      if (debouncedSearch) return undefined;
      const cached = readPlaceholderSessions();
      if (!cached) return undefined;
      const page: SessionsPage = {
        items: cached,
        total: cached.length,
        limit: SESSIONS_PAGE_SIZE,
        offset: 0,
        hasMore: cached.length >= SESSIONS_PAGE_SIZE,
      };
      return { pages: [page], pageParams: [0] };
    },
    initialDataUpdatedAt: 0,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
    placeholderData: () => readPlaceholderAgents() ?? undefined,
  });

  const localDefaultAgentId = usePreferencesStore((s) => s.defaultAgentId);

  const sessions = useMemo(
    () => sessionsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [sessionsQuery.data?.pages],
  );
  const defaultAgentId = resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId);
  const defaultAgentName =
    agentsQuery.data?.items.find((a) => a.id === defaultAgentId)?.name?.trim() || defaultAgentId;

  const sections = useMemo(
    () =>
      groupSessions(sessions, {
        sectionThisWeek: dm.sectionThisWeek,
        sectionThisYear: dm.sectionThisYear,
        sectionEarlier: dm.sectionEarlier,
      }),
    [sessions, dm.sectionThisWeek, dm.sectionThisYear, dm.sectionEarlier],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!sessionsQuery.hasNextPage || sessionsQuery.isFetchingNextPage) return;
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom <= SCROLL_LOAD_MORE_THRESHOLD) {
        void sessionsQuery.fetchNextPage();
      }
    },
    [sessionsQuery],
  );

  const openGatewaySettings = useCallback(() => {
    navigation.dispatch(DrawerActions.closeDrawer());
    router.push('/settings/gateway');
  }, [navigation, router]);

  const createMut = useMutation({
    mutationFn: (agentId?: string) =>
      createSession(
        agentId ?? resolveEffectiveDefaultAgentId(agentsQuery.data, localDefaultAgentId),
        { forceNew: true },
      ),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      router.replace({ pathname: '/', params: { k: key } });
      navigation.dispatch(DrawerActions.closeDrawer());
    },
  });

  const handleNewChat = useCallback(() => {
    createMut.mutate(undefined);
  }, [createMut]);

  const handleSessionTap = useCallback(
    (session: SessionListItem) => {
      if (multiSelectMode) {
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(session.key)) next.delete(session.key);
          else next.add(session.key);
          return next;
        });
        return;
      }
      router.replace({ pathname: '/', params: { k: session.key } });
      navigation.dispatch(DrawerActions.closeDrawer());
    },
    [multiSelectMode, navigation, router],
  );

  const closePopover = useCallback(() => {
    setPopoverVisible(false);
  }, []);

  const handleSessionLongPress = useCallback((item: SessionListItem) => {
    if (multiSelectMode) return;
    const row = rowRefs.current.get(item.key);
    if (!row) return;
    row.measureInWindow((x, y, width, height) => {
      setActionSession(item);
      setPopoverAnchor({ x, y: y + height, width });
      setPopoverVisible(true);
    });
  }, [multiSelectMode]);

  const handlePopoverAction = useCallback((action: SessionPopoverAction) => {
    if (!actionSession) return;
    closePopover();
    if (action === 'edit') {
      setRenameVisible(true);
      return;
    }
    if (action === 'delete') {
      setDeleteVisible(true);
      return;
    }
    setMultiSelectMode(true);
    setSelectedKeys(new Set([actionSession.key]));
    setActionSession(null);
  }, [actionSession, closePopover]);

  const handleRename = useCallback(async (name: string) => {
    if (!actionSession) return;
    setRenameLoading(true);
    try {
      await renameSession(actionSession.key, name);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      if (actionSession.key === activeKey) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionHistory(actionSession.key) });
      }
      setRenameVisible(false);
      setActionSession(null);
    } catch {
      setSnackMsg(m.sessionActions.failedToRename);
    } finally {
      setRenameLoading(false);
    }
  }, [actionSession, activeKey, m.sessionActions.failedToRename, queryClient]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!actionSession) return;
    setDeleteLoading(true);
    try {
      await deleteSession(actionSession.key);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      setDeleteVisible(false);
      setSnackMsg(m.sessionActions.sessionDeleted);
      if (actionSession.key === activeKey) {
        router.replace({ pathname: '/' });
      }
      setActionSession(null);
    } catch {
      setSnackMsg(m.sessionActions.failedToDelete);
    } finally {
      setDeleteLoading(false);
    }
  }, [actionSession, activeKey, m.sessionActions.failedToDelete, m.sessionActions.sessionDeleted, queryClient, router]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    setDeleteLoading(true);
    try {
      await Promise.all([...selectedKeys].map((key) => deleteSession(key)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      if (activeKey && selectedKeys.has(activeKey)) {
        router.replace({ pathname: '/' });
      }
      setMultiSelectMode(false);
      setSelectedKeys(new Set());
      setSnackMsg(m.sessionActions.sessionDeleted);
    } catch {
      setSnackMsg(m.sessionActions.failedToDelete);
    } finally {
      setDeleteLoading(false);
    }
  }, [activeKey, m.sessionActions.failedToDelete, m.sessionActions.sessionDeleted, queryClient, router, selectedKeys]);

  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

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
      const label = sessionDisplayName(item);
      const active = item.key === activeKey;
      const selected = selectedKeys.has(item.key);
      return (
        <View
          key={item.key}
          ref={(node) => {
            if (node) rowRefs.current.set(item.key, node);
            else rowRefs.current.delete(item.key);
          }}
          collapsable={false}
        >
          <TouchableRipple
            style={[
              styles.sessionRow,
              (active || selected) && { backgroundColor: colors.activeRow },
            ]}
            onPress={() => handleSessionTap(item)}
            onLongPress={() => handleSessionLongPress(item)}
            delayLongPress={350}
            rippleColor={colors.activeRow}
          >
            <View style={styles.sessionRowInner}>
              {multiSelectMode ? (
                <Checkbox
                  status={selected ? 'checked' : 'unchecked'}
                  onPress={() => handleSessionTap(item)}
                  color={colors.accent}
                />
              ) : (
                <Icon source="chat-outline" size={18} color={colors.textMuted} />
              )}
              <Text numberOfLines={1} style={[styles.sessionLabel, { color: colors.text }]}>
                {label}
              </Text>
            </View>
          </TouchableRipple>
        </View>
      );
    },
    [
      activeKey,
      colors.accent,
      colors.activeRow,
      colors.text,
      colors.textMuted,
      handleSessionLongPress,
      handleSessionTap,
      multiSelectMode,
      selectedKeys,
    ],
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

  const historyContent = (() => {
    if (sessionsQuery.isLoading && sessions.length === 0) {
      return <SessionListSkeleton isDark={isDark} />;
    }

    if (sessionsQuery.isError && sessions.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            {m.sessions.loadFailed}
          </Text>
          <Pressable
            style={styles.secondaryLink}
            onPress={() => void sessionsQuery.refetch()}
          >
            <Text style={[styles.secondaryLinkLabel, { color: colors.accent }]}>{m.common.retry}</Text>
          </Pressable>
        </View>
      );
    }

    if (sessions.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            {debouncedSearch
              ? t(m.sessions.noResultsHint, { query: debouncedSearch })
              : m.sessions.empty}
          </Text>
        </View>
      );
    }

    return (
      <>
        {sections.map((section) => (
          <View key={section.title}>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{section.title}</Text>
            {section.data.map((item) => renderSessionRow(item))}
          </View>
        ))}
        {sessionsQuery.isFetchingNextPage ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : null}
      </>
    );
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBg, paddingTop: insets.top }]}>
      {/* Fixed header — profile card */}
      <View style={styles.headerArea}>
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

          <DrawerGatewayConnection onPress={openGatewaySettings} />

          <Pressable
            style={[styles.newChatCta, { backgroundColor: colors.accent }]}
            onPress={handleNewChat}
            disabled={createMut.isPending}
          >
            <Icon source="plus" size={20} color="#FFFFFF" />
            <Text style={styles.newChatCtaLabel}>{dm.newChat}</Text>
          </Pressable>
        </View>
      </View>

      {/* History card — title/search fixed, sessions scroll inside */}
      <View style={styles.historyArea}>
        <View style={[styles.card, styles.historyCard, { backgroundColor: colors.card, flex: 1 }]}>
          <View style={styles.historyTitleRow}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{dm.historyTitle}</Text>
            {multiSelectMode ? (
              <View style={styles.multiSelectBar}>
                <Pressable onPress={exitMultiSelect} style={styles.multiSelectAction}>
                  <Text style={{ color: colors.textMuted }}>{dm.multiSelectCancel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleBulkDelete()}
                  disabled={selectedKeys.size === 0 || deleteLoading}
                  style={styles.multiSelectAction}
                >
                  <Text style={{ color: selectedKeys.size > 0 ? '#FF453A' : colors.textMuted }}>
                    {t(dm.multiSelectDelete, { count: selectedKeys.size })}
                  </Text>
                </Pressable>
              </View>
            ) : (
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
            )}
          </View>

          <ScrollView
            style={styles.sessionsScroll}
            contentContainerStyle={styles.sessionsScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={200}
          >
            {historyContent}
          </ScrollView>
        </View>
      </View>

      <SessionActionPopover
        visible={popoverVisible}
        anchorX={popoverAnchor.x}
        anchorY={popoverAnchor.y}
        anchorWidth={popoverAnchor.width}
        onAction={handlePopoverAction}
        onDismiss={closePopover}
      />

      <RenameDialog
        visible={renameVisible}
        currentName={actionSession?.name?.trim() ?? ''}
        onDismiss={() => {
          setRenameVisible(false);
          setActionSession(null);
        }}
        onRename={(name) => void handleRename(name)}
        loading={renameLoading}
      />

      <DeleteConfirmDialog
        visible={deleteVisible}
        sessionName={actionSession ? sessionDisplayName(actionSession) : ''}
        onDismiss={() => {
          setDeleteVisible(false);
          setActionSession(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleteLoading}
      />

      <Snackbar visible={Boolean(snackMsg)} onDismiss={() => setSnackMsg('')} duration={2500}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerArea: {
    paddingHorizontal: 12,
  },
  historyArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 12,
    minHeight: 0,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  historyCard: {
    paddingBottom: 10,
    marginBottom: 0,
  },
  sessionsScroll: {
    flex: 1,
  },
  sessionsScrollContent: {
    paddingBottom: 12,
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
  multiSelectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiSelectAction: {
    paddingVertical: 8,
    paddingHorizontal: 4,
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
  footerLoader: {
    paddingVertical: 12,
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
