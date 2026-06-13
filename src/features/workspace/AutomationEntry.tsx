import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useGatewayConfigured } from '../../query/sessions';
import { useTheme } from '../../theme';

export function AutomationEntry() {
  const router = useRouter();
  const { colors } = useTheme();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const wm = m.workspaceHome;

  if (!configured) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{wm.automationSection}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface.panel }]}>
        <Pressable style={styles.row} onPress={() => router.push('/automation')}>
          <View style={styles.iconBubble}>
            <Icon source="clock-outline" size={16} color="#FF9500" />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text.primary }]}>{m.automationPage.title}</Text>
            <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>{wm.automationHint}</Text>
          </View>
          <Icon source="chevron-right" size={18} color={colors.text.tertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  card: { borderRadius: 20, padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10 },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,149,0,0.14)',
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 12 },
});
