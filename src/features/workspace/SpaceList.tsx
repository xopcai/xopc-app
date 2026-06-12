import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { sessionDisplayName } from '../../lib/session-helpers';
import type { SessionListItem } from '../../query/sessions';
import { useTheme } from '../../theme';

interface SpaceListProps {
  sessions: SessionListItem[];
  onSessionPress: (sessionKey: string) => void;
  onViewAll: () => void;
}

export function SpaceList({ sessions, onSessionPress, onViewAll }: SpaceListProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>对话</Text>
        <Pressable onPress={onViewAll}>
          <Text style={[styles.openText, { color: '#6D5DFB' }]}>查看更多</Text>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface.panel }]}>
        {sessions.length === 0 ? (
          <View style={styles.emptyRow}>
            <Icon source="message-processing-outline" size={20} color={colors.text.tertiary} />
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>还没有 AI 对话</Text>
          </View>
        ) : (
          sessions.map((session) => (
            <Pressable key={session.key} style={styles.itemRow} onPress={() => onSessionPress(session.key)}>
              <View style={styles.iconBubble}>
                <Icon source="message-processing-outline" size={16} color="#6D5DFB" />
              </View>
              <View style={styles.itemCopy}>
                <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text.primary }]}>{sessionDisplayName(session)}</Text>
              </View>
              <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  openText: { fontSize: 13, fontWeight: '600' },
  card: { borderRadius: 20, overflow: 'hidden' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  emptyText: { flex: 1, fontSize: 13, fontWeight: '500' },
  itemRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(109,93,251,0.14)' },
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600' },
});
