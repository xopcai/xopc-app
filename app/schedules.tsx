/**
 * Schedules — lists and controls cron jobs from xopc gateway.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Chip, Icon, Snackbar, Text } from 'react-native-paper';

import { useMessages } from '../src/i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../src/lib/navigation';
import {
  cronJobPromptPreview,
  fetchCronJobs,
  runCronJobNow,
  toggleCronJob,
  type CronJobRow,
} from '../src/query/cron';
import { queryKeys } from '../src/query/keys';
import { useGatewayConfigured } from '../src/query/sessions';

const DOCS_URL = 'https://github.com/nicepkg/xopc';

export default function SchedulesScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const queryClient = useQueryClient();
  const isDark = useColorScheme() === 'dark';
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.schedulesPage;
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const jobsQuery = useQuery({
    queryKey: queryKeys.cronJobs,
    queryFn: fetchCronJobs,
    enabled: configured,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleCronJob(id, enabled),
    onSuccess: async (_data, variables) => {
      setSnackbarMessage(variables.enabled ? pm.enabledToast : pm.disabledToast);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
    onError: (error) => {
      setSnackbarMessage(error instanceof Error ? error.message : pm.actionFailed);
    },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => runCronJobNow(id),
    onSuccess: async () => {
      setSnackbarMessage(pm.runStartedToast);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cronRunsHistory(50) }),
      ]);
    },
    onError: (error) => {
      setSnackbarMessage(error instanceof Error ? error.message : pm.actionFailed);
    },
  });

  const jobs = jobsQuery.data ?? [];

  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E5EA';
  const textPrimary = isDark ? '#E5E7EB' : '#1F2937';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const enabledColor = isDark ? '#86EFAC' : '#16A34A';
  const disabledColor = isDark ? '#FCA5A5' : '#DC2626';

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
  }, [queryClient]);

  const renderJob = useCallback(
    ({ item }: { item: CronJobRow }) => {
      const title = item.name?.trim() || item.id;
      const preview = cronJobPromptPreview(item);
      const statusText = item.enabled ? pm.enabled : pm.disabled;
      const statusColor = item.enabled ? enabledColor : disabledColor;
      const actionInFlight = toggleMutation.isPending || runMutation.isPending;
      const isTogglingThisJob = toggleMutation.isPending && toggleMutation.variables?.id === item.id;
      const isRunningThisJob = runMutation.isPending && runMutation.variables === item.id;

      return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Icon source="clock-outline" size={24} color={textSecondary} />
            <View style={styles.cardTitleArea}>
              <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.mono, { color: textSecondary }]} numberOfLines={1}>
                {item.id}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: item.enabled ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' }]}>
              <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>
                {statusText}
              </Text>
            </View>
          </View>

          <Text style={[styles.label, { color: textSecondary }]}>
            {pm.schedule}: <Text style={{ color: textPrimary }}>{item.schedule}</Text>
            {item.timezone ? ` (${item.timezone})` : ''}
          </Text>

          {item.next_run ? (
            <Text style={[styles.label, { color: textSecondary }]}>
              {pm.nextRun}:{' '}
              <Text style={{ color: textPrimary }}>{item.next_run}</Text>
            </Text>
          ) : null}

          {preview ? (
            <Text style={[styles.preview, { color: textSecondary }]} numberOfLines={3}>
              {pm.prompt}: {preview}
            </Text>
          ) : null}

          <View style={styles.actionsRow}>
            <Button
              mode="contained-tonal"
              compact
              icon="play"
              onPress={() => runMutation.mutate(item.id)}
              loading={isRunningThisJob}
              disabled={actionInFlight}
            >
              {pm.runNow}
            </Button>
            <Button
              mode="outlined"
              compact
              icon={item.enabled ? 'pause' : 'play-pause'}
              onPress={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
              loading={isTogglingThisJob}
              disabled={actionInFlight}
            >
              {item.enabled ? pm.disable : pm.enable}
            </Button>
          </View>
        </View>
      );
    },
    [cardBg, cardBorder, disabledColor, enabledColor, pm, runMutation, textPrimary, textSecondary, toggleMutation],
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

  if (jobsQuery.isLoading) {
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

  if (jobsQuery.isError) {
    return (
      <View style={[styles.screen, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
        <Appbar.Header mode="center-aligned" style={{ backgroundColor: 'transparent' }}>
          <Appbar.BackAction onPress={() => dismissOrHome(router)} />
          <Appbar.Content title={pm.title} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={{ opacity: 0.6, marginBottom: 12 }}>{pm.loadFailed}</Text>
          <Button mode="outlined" onPress={() => void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs })}>
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
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={renderJob}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={jobsQuery.isFetching && !jobsQuery.isLoading} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Chip icon="timer-off-outline" mode="outlined">
              {pm.empty}
            </Chip>
          </View>
        }
      />
      <Snackbar
        visible={Boolean(snackbarMessage)}
        onDismiss={() => setSnackbarMessage('')}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitleArea: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  mono: { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  label: { fontSize: 13, lineHeight: 18 },
  preview: { fontSize: 12, lineHeight: 17 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  footer: { alignItems: 'center', paddingVertical: 16 },
  empty: { alignItems: 'center', paddingVertical: 32 },
});
