import { memo, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { WebchatPersistentGoalWire } from '../../query/goals';
import { verdictLabel, type GoalMessages } from './goal-utils';

type Props = {
  goal: WebchatPersistentGoalWire;
  t: GoalMessages;
};

export const GoalJudgementSummary = memo(function GoalJudgementSummary({ goal, t }: Props) {
  const [open, setOpen] = useState(false);
  const isDark = useColorScheme() === 'dark';
  const hasJudgement = Boolean(goal.lastVerdict || goal.lastReason || goal.pausedReason);
  if (!hasJudgement) return null;

  const verdict = goal.lastVerdict ? verdictLabel(goal.lastVerdict, t) : '';
  const primaryReason = goal.pausedReason || goal.lastReason;
  const panelBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const detailBg = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.72)';

  return (
    <View style={[styles.wrap, { backgroundColor: panelBg }]}> 
      <Pressable style={styles.head} onPress={() => setOpen((v) => !v)}>
        <View style={styles.titleBox}>
          <View style={styles.titleRow}>
            <Text variant="labelMedium" style={styles.title}>{t.lastJudgementTitle}</Text>
            {verdict ? <Text style={styles.verdict}>{verdict}</Text> : null}
          </View>
          {primaryReason ? (
            <Text variant="bodySmall" style={styles.reason} numberOfLines={open ? 8 : 2}>
              {primaryReason}
            </Text>
          ) : null}
        </View>
        <Text style={styles.toggle}>{open ? t.hideDetails : t.showDetails}</Text>
      </Pressable>

      {open ? (
        <View style={[styles.detailBox, { backgroundColor: detailBg }]}> 
          {goal.lastVerdict ? (
            <Text variant="bodySmall" style={styles.detailLine}>
              <Text style={styles.detailLabel}>{t.lastVerdict}: </Text>{verdict}
            </Text>
          ) : null}
          {goal.lastReason ? (
            <Text variant="bodySmall" style={styles.detailLine}>
              <Text style={styles.detailLabel}>{t.lastReason}: </Text>{goal.lastReason}
            </Text>
          ) : null}
          {goal.pausedReason ? (
            <Text variant="bodySmall" style={styles.detailLine}>
              <Text style={styles.detailLabel}>{t.pausedReason}: </Text>{goal.pausedReason}
            </Text>
          ) : null}
          {goal.judgeModelRef ? (
            <Text variant="bodySmall" style={styles.detailLine}>
              <Text style={styles.detailLabel}>{t.judgeModel}: </Text>{goal.judgeModelRef}
            </Text>
          ) : null}
          {goal.consecutiveParseFailures ? (
            <Text variant="bodySmall" style={styles.detailLine}>
              <Text style={styles.detailLabel}>{t.parseFailures}: </Text>{goal.consecutiveParseFailures}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleBox: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '800',
  },
  verdict: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,122,255,0.12)',
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '800',
  },
  reason: {
    opacity: 0.72,
    lineHeight: 18,
  },
  toggle: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 1,
  },
  detailBox: {
    borderRadius: 10,
    padding: 9,
    gap: 5,
  },
  detailLine: {
    opacity: 0.78,
    lineHeight: 18,
  },
  detailLabel: {
    fontWeight: '800',
  },
});
