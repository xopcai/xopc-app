import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';
import { fetchCronRunsHistory, type CronRunRow } from '../../query/cron';
import { queryKeys } from '../../query/keys';
import { useGatewayConfigured } from '../../query/sessions';

const DOCS_URL = 'https://xopcai.github.io/xopc/cron';
const RUNS_LIMIT = 50;

export function CronRunsList() {
  const queryClient = useQueryClient();
  const isDark = useResolvedIsDark();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.cronRunsPage;

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
        <View style={[styles.card, { backgroundColor: cardBg }]}>
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
            <View style={[styles.statusPill, { backgroundColor: `${color}18` }]}>
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
    [cardBg, isDark, pm.job, pm.started, statusColor, statusLabel, textPrimary, textSecondary],
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

  if (runsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (runsQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={{ opacity: 0.6, marginBottom: 12 }}>{pm.loadFailed}</Text>
        <Button
          mode="outlined"
          onPress={() => void queryClient.invalidateQueries({ queryKey: queryKeys.cronRunsHistory(RUNS_LIMIT) })}
        >
          {m.common.retry}
        </Button>
      </View>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  list: { padding: 16, paddingTop: 0, gap: 12, flexGrow: 1 },
  headerBlock: { marginBottom: 12 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 14,
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
