import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';

import { fetchWebchatGoalRuns } from '../../query/goals';
import { queryKeys } from '../../query/keys';
import { runVerdictLabel, type GoalMessages } from './goal-utils';

type Props = {
  sessionKey: string;
  t: GoalMessages;
};

export const GoalLatestRun = memo(function GoalLatestRun({ sessionKey, t }: Props) {
  const isDark = useColorScheme() === 'dark';
  const q = useQuery({
    queryKey: queryKeys.webchatGoalRuns(sessionKey, 1),
    queryFn: () => fetchWebchatGoalRuns(sessionKey, { limit: 1 }),
    enabled: Boolean(sessionKey),
    staleTime: 5_000,
  });
  const run = q.data?.runs?.[0];
  if (!run) return null;

  const panelBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const verdict = runVerdictLabel(run.verdict, t);
  const checklist = run.checklistProgress;

  return (
    <View style={[styles.wrap, { backgroundColor: panelBg }]}> 
      <View style={styles.head}>
        <Text variant="labelMedium" style={styles.title}>{t.latestRunTitle}</Text>
        <Text style={styles.verdict}>{verdict}</Text>
      </View>
      {run.reason ? (
        <Text variant="bodySmall" style={styles.reason} numberOfLines={3}>
          {run.reason}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{run.willContinue ? t.nextStepContinue : t.nextStepStop}</Text>
        <Text style={styles.meta}>{`${run.turnsUsed}/${run.maxTurns}`}</Text>
        {checklist ? <Text style={styles.meta}>{`${checklist.done}/${checklist.total}`}</Text> : null}
      </View>
      {run.assistantPreview ? (
        <Text variant="bodySmall" style={styles.preview} numberOfLines={2}>
          {run.assistantPreview}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    padding: 10,
    gap: 7,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontWeight: '800',
  },
  verdict: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(16,185,129,0.12)',
    color: '#10B981',
    fontSize: 11,
    fontWeight: '900',
  },
  reason: {
    opacity: 0.72,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  meta: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,122,255,0.10)',
    color: '#007AFF',
    fontSize: 10,
    fontWeight: '800',
  },
  preview: {
    opacity: 0.58,
    lineHeight: 18,
  },
});
