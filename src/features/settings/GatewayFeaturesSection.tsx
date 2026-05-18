/**
 * Gateway capability shortcuts — agents and cron screens.
 */
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Divider, List, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

const ROWS = [
  { href: '/agents' as const, icon: 'robot-outline', titleKey: 'agentsTitle' as const },
  { href: '/schedules' as const, icon: 'clock-outline', titleKey: 'schedulesTitle' as const },
  { href: '/tasks' as const, icon: 'checkbox-marked-outline', titleKey: 'tasksTitle' as const },
];

export const GatewayFeaturesSection = memo(function GatewayFeaturesSection() {
  const router = useRouter();
  const m = useMessages();
  const s = m.settings;
  const isDark = useColorScheme() === 'dark';

  const titles = {
    agentsTitle: m.agentsPage.title,
    schedulesTitle: m.schedulesPage.title,
    tasksTitle: m.tasksPage.title,
  };

  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E5EA';

  const go = useCallback(
    (href: (typeof ROWS)[number]['href']) => {
      router.push(href);
    },
    [router],
  );

  return (
    <View style={styles.wrap}>
      <Text variant="titleMedium" style={styles.heading}>
        {s.gatewayFeatures}
      </Text>
      <Text variant="bodySmall" style={styles.hint}>
        {s.gatewayFeaturesHint}
      </Text>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {ROWS.map((row, i) => (
          <View key={row.href}>
            {i > 0 ? <Divider style={[styles.rowDivider, { backgroundColor: cardBorder }]} /> : null}
            <List.Item
              title={titles[row.titleKey]}
              left={(props) => <List.Icon {...props} icon={row.icon} />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => go(row.href)}
              titleStyle={styles.rowTitle}
              style={styles.row}
            />
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  heading: {
    marginBottom: 6,
  },
  hint: {
    marginBottom: 12,
    opacity: 0.72,
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 4,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowDivider: {
    marginLeft: 56,
  },
});
