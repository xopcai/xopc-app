import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../theme';

interface TodayBriefProps {
  inboxCount: number;
  pendingTaskCount: number;
  onInboxPress: () => void;
  onTasksPress: () => void;
}

export function TodayBrief({ inboxCount, pendingTaskCount, onInboxPress, onTasksPress }: TodayBriefProps) {
  const { colors, isDark } = useTheme();
  const backgroundColor = isDark ? '#151B2B' : '#EEF4FF';
  const metricBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.46)';

  return (
    <View style={[styles.card, { backgroundColor }]}> 
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Icon source="weather-sunny" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.text.primary }]}>今日简报</Text>
          <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>Inbox 和任务的轻量提醒</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="待整理" value={inboxCount} onPress={onInboxPress} metricBg={metricBg} />
        <Metric label="待办任务" value={pendingTaskCount} onPress={onTasksPress} metricBg={metricBg} />
      </View>
    </View>
  );
}

function Metric({ label, value, onPress, metricBg }: { label: string; value: number; onPress: () => void; metricBg: string }) {
  const { colors } = useTheme();
  return (
    <Pressable style={[styles.metric, { backgroundColor: metricBg }]} onPress={onPress}>
      <Text style={[styles.metricValue, { color: colors.text.primary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.text.tertiary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 16, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6D5DFB' },
  titleWrap: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 12, fontWeight: '400' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  metricValue: { fontSize: 20, fontWeight: '600' },
  metricLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});
