import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useTheme } from '../../theme';

interface TodayBriefProps {
  inboxCount: number;
  pendingTaskCount: number;
  onInboxPress: () => void;
  onTasksPress: () => void;
}

export function TodayBrief({ inboxCount, pendingTaskCount, onInboxPress, onTasksPress }: TodayBriefProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.accent.soft,
          borderColor: colors.border.default,
        },
      ]}
    > 
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.text.primary }]}>今日简报</Text>
          <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>Inbox 和任务的轻量提醒</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="待整理" value={inboxCount} onPress={onInboxPress} />
        <Metric label="待办任务" value={pendingTaskCount} onPress={onTasksPress} />
      </View>
    </View>
  );
}

function Metric({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.metric,
        {
          backgroundColor: colors.surface.panel,
          borderColor: colors.border.subtle,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.metricValue, { color: colors.text.primary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.text.tertiary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 16, gap: 16, borderWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  titleWrap: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 12, fontWeight: '400' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  metricValue: { fontSize: 20, fontWeight: '600' },
  metricLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});
