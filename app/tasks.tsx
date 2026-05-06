/**
 * Tasks — recent cron executions from GET /api/cron/runs/history (gateway `hono/routes/cron.ts`).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Chip, Icon, Text } from 'react-native-paper';

import { useMessages } from '../src/i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../src/lib/navigation';
import { fetchCronRunsHistory, type CronRunRow } from '../src/query/cron';
import { queryKeys } from '../src/query/keys';
import { useGatewayConfigured } from '../src/query/sessions';

const DOCS_URL = 'https://github.com/nicepkg/xopc';
const RUNS_LIMIT = 50;

export default function TasksScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const isDark = useColorScheme() === 'dark';
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.tasksPage;

  const runsQuery = useQuery({
    queryKey: queryKeys.cronRunsHistory(RUNS_LIMIT),
    queryFn: () => fetchCronRunsHistory(RUNS_LIMIT),
    enabled: configured,
  });

  const runs = runsQuery.data ?? [];

  const statusLabel = useMemo(
    () => ({
      running: pm.statusRunning,
      success: pm.statusSuccess,
      failed: pm.statusFailed,
      cancelled: pm.statusCancelled,
    }),
    [pm.statusCancelled, pm.statusFailed, pm.statusRunning, pm.statusSuccess],
  );

  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E5EA';
  const textPrimary = isDark ? '#E5E7EB' : '#1F2937';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';

  const statusColor = useCallback(
    (s: CronRunRow['status']) => {
      switch (s) {
        case 'success':
          return isDark ? '#86EFAC' : '#16A34A';
        case 'failed':
          return isDark ? '#FCA5A5' : '#DC2626';
        case 'running':
          return isDark ? '#93C5FD' : '#2563EB';
        default:
          return textSecondary;
      }
    },
    [isDark, textSecondary],
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cronRunsHistory(RUNS_LIMIT) });
  }, [queryClient]);

  const renderRun = useCallback(
    ({ item }: { item: CronRunRow }) => {
      const jobTitle = item.jobName?.trim() || item.jobId;
      const color = statusColor(item.status);
      return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Icon source="play-circle-outline" size={24} color={textSecondary} />
            <View style={styles.cardTitleArea}>
              <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={1}>
                {jobTitle}
              </Text>
              <Text style={[styles.mono, { color: textSecondary }]} numberOfLines={1}>
                {item.id}
              </Text>
            </View>
            <View style={[styles.statusPill, { borderColor: color }]}>
              <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{statusLabel[item.status]}</Text>
            </View>
          </View>

          <Text style={[styles.row, { color: textSecondary }]}>
            {pm.job}: <Text style={{ color: textPrimary, fontFamily: 'monospace', fontSize: 11 }}>{item.jobId}</Text>
          </Text>

          <Text style={[styles.row, { color: textSecondary }]}>
            {pm.started}: <Text style={{ color: textPrimary }}>{item.startedAt}</Text>
          </Text>

          {item.endedAt ? (
            <Text style={[styles.row, { color: textSecondary }]}>
              → {item.endedAt}
              {typeof item.duration === 'number' ? ` · ${item.duration}ms` : ''}
            </Text>
          ) : null}

          {item.summary ? (
            <Text style={[styles.summary, { color: textSecondary }]} numberOfLines={4}>
              {item.summary}
            </Text>
          ) : null}

          {item.error ? (
            <Text style={[styles.error, { color: isDark ? '#FCA5A5' : '#DC2626' }]} numberOfLines={3}>
              {item.error}
            </Text>
          ) : null}
        </View>
      );
    },
    [cardBg, cardBorder, isDark, pm.started, statusColor, statusLabel, textPrimary, textSecondary],
  );

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={[styles.subtitle, { color: textSecondary }]}>{pm.subtitle}</Text>
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      <Button mode="text" compact icon="open-in-new" onPress={() => void Linking.openURL(DOCS_URL)}>
        {pm.openDocs}
      </Button>
    </View>
  );

  if (!configured) {
    return (
      <View style={[styles.screen, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
        <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
          <Appbar.BackAction onPress={() => dismissOrHome(router)} />
          <Appbar.Content title={pm.title} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={{ opacity: 0.6 }}>{m.sessions.gatewayNotConfigured}</Text>
        </View>
      </View>
    );
  }

  if (runsQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
        <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
          <Appbar.BackAction onPress={() => dismissOrHome(router)} />
          <Appbar.Content title={pm.title} />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (runsQuery.isError) {
    return (
      <View style={[styles.screen, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
        <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
          <Appbar.BackAction onPress={() => dismissOrHome(router)} />
          <Appbar.Content title={pm.title} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={{ opacity: 0.6, marginBottom: 12 }}>{pm.loadFailed}</Text>
          <Button
            mode="outlined"
            onPress={() => void queryClient.invalidateQueries({ queryKey: queryKeys.cronRunsHistory(RUNS_LIMIT) })}
          >
            {m.common.retry}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
      <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
        <Appbar.BackAction onPress={() => dismissOrHome(router)} />
        <Appbar.Content title={pm.title} />
      </Appbar.Header>
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        renderItem={renderRun}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={runsQuery.isFetching && !runsQuery.isLoading} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Chip icon="playlist-remove" mode="outlined">
              {pm.empty}
            </Chip>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  list: { padding: 16, paddingTop: 0, gap: 12, flexGrow: 1 },
  headerBlock: { marginBottom: 12 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitleArea: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  mono: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  row: { fontSize: 12, lineHeight: 17 },
  summary: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 12, lineHeight: 17 },
  footer: { alignItems: 'center', paddingVertical: 16 },
  empty: { alignItems: 'center', paddingVertical: 32 },
});
