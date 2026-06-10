import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { t, useMessages } from '../../i18n/messages';
import { useTheme } from '../../theme';

interface InboxPreviewProps {
  count: number;
  onOpenInbox: () => void;
}

export function InboxPreview({ count, onOpenInbox }: InboxPreviewProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  const accent = colors.accent.primary;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Inbox</Text>
        {count > 0 && (
          <Pressable onPress={onOpenInbox}>
            <Text style={[styles.openText, { color: accent }]}>{hm.viewAll}</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={[styles.card, { backgroundColor: colors.surface.panel }]} onPress={onOpenInbox}>
        {count === 0 ? (
          <View style={styles.emptyRow}>
            <Icon source="tray" size={20} color={colors.text.tertiary} />
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{hm.inboxCleared}</Text>
          </View>
        ) : (
          <View style={styles.countRow}>
            <Icon source="tray-full" size={20} color={accent} />
            <Text style={[styles.countText, { color: colors.text.primary }]}>
              {t(hm.inboxPendingCount, { count })}
            </Text>
            <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
          </View>
        )}
      </Pressable>
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
  emptyText: { fontSize: 13, fontWeight: '500' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  countText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
