/**
 * ChatsScreen — session list for the Chats tab.
 *
 * Extracted from DrawerContent session-list logic, adapted for a
 * full-screen tab context with search, sections, and action popover.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Checkbox,
  Icon,
  IconButton,
  Searchbar,
  Snackbar,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, useMessages } from '../../i18n/messages';
import { queryKeys } from '../../query/keys';
import {
  createSession,
  deleteSession,
  fetchSessionsList,
  renameSession,
  type SessionListItem,
  type SessionsPage,
} from '../../query/sessions';
import { useGatewayConfigured } from '../../query/sessions';
import { fetchChatAgents, readPlaceholderAgents, resolveEffectiveDefaultAgentId } from '../../query/agents';
import { groupSessions, sessionDisplayName } from '../../lib/session-helpers';
import { readPlaceholderSessions } from '../../query/sessions';
import { usePreferencesStore } from '../../stores/preferences-store';
import { useTheme } from '../../theme';
import {
  DeleteConfirmDialog,
  RenameDialog,
  SessionActionPopover,
  type SessionPopoverAction,
} from '../sessions';

const SESSIONS_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;
const SCROLL_LOAD_MORE_THRESHOLD = 200;

export function ChatsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const dm = m.drawer;
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [snackMsg, setSnackMsg] = useState('');

  // Action states
  const [actionSession, setActionSession] = useState<SessionListItem | null>(null);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState({ x: 0, y: 0, width: 0 });
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Map<string, View>>(new Map());

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.sessions(debouncedSearch),
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      fetchSessionsList({ limit: SESSIONS_PAGE_SIZE, offset: pageParam, search: debouncedSearch }),
    getNextPageParam: (last: SessionsPage) =>
      last.hasMore ? last.offset + last.limit : undefined,
    enabled: configured,
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

  const sessions = useMemo(
    () => sessionsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [sessionsQuery.data?.pages],
  );

  const sections = useMemo(
    () =>
      groupSessions(sessions, {
        sectionThisWeek: dm.sectionThisWeek,
        sectionThisYear: dm.sectionThisYear,
        sectionEarlier: dm.sectionEarlier,
      }),
    [sessions, dm.sectionThisWeek, dm.sectionThisYear, dm.sectionEarlier],
  );

  const localDefaultAgentId = usePreferencesStore((s) => s.defaultAgentId);

  const createMut = useMutation({
    mutationFn: (agentId?: string) =>
      createSession(agentId ?? localDefaultAgentId ?? undefined, { forceNew: true }),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      router.push({ pathname: '/chat/[k]', params: { k: key } });
    },
  });

  const handleNewChat = useCallback(() => createMut.mutate(undefined), [createMut]);

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
      router.push({ pathname: '/chat/[k]', params: { k: session.key } });
    },
    [multiSelectMode, router],
  );

  const handleSessionLongPress = useCallback(
    (item: SessionListItem) => {
      if (multiSelectMode) return;
      const row = rowRefs.current.get(item.key);
      if (!row) return;
      row.measureInWindow((x, y, width, height) => {
        setActionSession(item);
        setPopoverAnchor({ x, y: y + height, width });
        setPopoverVisible(true);
      });
    },
    [multiSelectMode],
  );

  const closePopover = useCallback(() => setPopoverVisible(false), []);

  const handlePopoverAction = useCallback(
    (action: SessionPopoverAction) => {
      if (!actionSession) return;
      closePopover();
      if (action === 'edit') { setRenameVisible(true); return; }
      if (action === 'delete') { setDeleteVisible(true); return; }
      setMultiSelectMode(true);
      setSelectedKeys(new Set([actionSession.key]));
      setActionSession(null);
    },
    [actionSession, closePopover],
  );

  const handleRename = useCallback(
    async (name: string) => {
      if (!actionSession) return;
      setRenameLoading(true);
      try {
        await renameSession(actionSession.key, name);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
        setRenameVisible(false);
        setActionSession(null);
      } catch {
        setSnackMsg(m.sessionActions.failedToRename);
      } finally {
        setRenameLoading(false);
      }
    },
    [actionSession, m.sessionActions.failedToRename, queryClient],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!actionSession) return;
    setDeleteLoading(true);
    try {
      await deleteSession(actionSession.key);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      setDeleteVisible(false);
      setSnackMsg(m.sessionActions.sessionDeleted);
      setActionSession(null);
    } catch {
      setSnackMsg(m.sessionActions.failedToDelete);
    } finally {
      setDeleteLoading(false);
    }
  }, [actionSession, m.sessionActions.failedToDelete, m.sessionActions.sessionDeleted, queryClient]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    setDeleteLoading(true);
    try {
      await Promise.all([...selectedKeys].map((key) => deleteSession(key)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll });
      setMultiSelectMode(false);
      setSelectedKeys(new Set());
      setSnackMsg(m.sessionActions.sessionDeleted);
    } catch {
      setSnackMsg(m.sessionActions.failedToDelete);
    } finally {
      setDeleteLoading(false);
    }
  }, [m.sessionActions.failedToDelete, m.sessionActions.sessionDeleted, queryClient, selectedKeys]);

  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!sessionsQuery.hasNextPage || sessionsQuery.isFetchingNextPage) return;
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom <= SCROLL_LOAD_MORE_THRESHOLD) void sessionsQuery.fetchNextPage();
    },
    [sessionsQuery],
  );

  // ── Colors ────────────────────────────────────────────

  const pageBg = colors.surface.base;
  const cardText = colors.text.primary;
  const mutedText = colors.text.tertiary;
  const accent = colors.accent.primary;
  const activeRowBg = isDark ? 'rgba(0,122,255,0.18)' : 'rgba(0,122,255,0.10)';

  // ── Render ────────────────────────────────────────────

  const renderSessionRow = useCallback(
    (item: SessionListItem) => {
      const label = sessionDisplayName(item);
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
            style={[styles.sessionRow, selected && { backgroundColor: activeRowBg }]}
            onPress={() => handleSessionTap(item)}
            onLongPress={() => handleSessionLongPress(item)}
            delayLongPress={350}
            rippleColor={activeRowBg}
          >
            <View style={styles.sessionRowInner}>
              {multiSelectMode ? (
                <Checkbox
                  status={selected ? 'checked' : 'unchecked'}
                  onPress={() => handleSessionTap(item)}
                  color={accent}
                />
              ) : (
                <Icon source="chat-outline" size={18} color={mutedText} />
              )}
              <Text numberOfLines={1} style={[styles.sessionLabel, { color: cardText }]}>
                {label}
              </Text>
            </View>
          </TouchableRipple>
        </View>
      );
    },
    [accent, activeRowBg, cardText, handleSessionLongPress, handleSessionTap, multiSelectMode, mutedText, selectedKeys],
  );

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: pageBg, paddingTop: insets.top + 16 }]}>
        <View style={styles.emptyCenter}>
          <Text style={{ opacity: 0.6, color: mutedText }}>{m.sessions.gatewayNotConfigured}</Text>
        </View>
      </View>
    );
  }

  const historyContent = (() => {
    if (sessionsQuery.isLoading && sessions.length === 0) {
      return (
        <View style={styles.emptyCenter}>
          <ActivityIndicator size="large" />
        </View>
      );
    }
    if (sessions.length === 0) {
      return (
        <View style={styles.emptyCenter}>
          <Text style={{ color: mutedText, textAlign: 'center' }}>
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
            <Text style={[styles.sectionHeader, { color: mutedText }]}>{section.title}</Text>
            {section.data.map((item) => renderSessionRow(item))}
          </View>
        ))}
        {sessionsQuery.isFetchingNextPage && (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color={mutedText} />
          </View>
        )}
      </>
    );
  })();

  return (
    <View style={[styles.screen, { backgroundColor: pageBg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: cardText }]}>{m.homePage.tabChats}</Text>
        <IconButton
          icon="plus"
          size={22}
          iconColor={accent}
          onPress={handleNewChat}
          disabled={createMut.isPending}
        />
      </View>

      {/* Search / multi-select bar */}
      <View style={styles.searchRow}>
        {multiSelectMode ? (
          <View style={styles.multiSelectBar}>
            <Pressable onPress={exitMultiSelect} style={styles.multiSelectAction}>
              <Text style={{ color: mutedText }}>{dm.multiSelectCancel}</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleBulkDelete()}
              disabled={selectedKeys.size === 0 || deleteLoading}
              style={styles.multiSelectAction}
            >
              <Text style={{ color: selectedKeys.size > 0 ? '#FF453A' : mutedText }}>
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
            iconColor={mutedText}
            placeholderTextColor={mutedText}
            elevation={0}
          />
        )}
      </View>

      {/* Session list */}
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

      {/* Dialogs */}
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
        onDismiss={() => { setRenameVisible(false); setActionSession(null); }}
        onRename={(name) => void handleRename(name)}
        loading={renameLoading}
      />
      <DeleteConfirmDialog
        visible={deleteVisible}
        sessionName={actionSession ? sessionDisplayName(actionSession) : ''}
        onDismiss={() => { setDeleteVisible(false); setActionSession(null); }}
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
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBar: {
    borderRadius: 14,
    height: 40,
    elevation: 0,
  },
  multiSelectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  multiSelectAction: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sessionsScroll: { flex: 1 },
  sessionsScrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
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
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  sessionLabel: {
    fontSize: 14,
    flex: 1,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});
