import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { FloatingHeader } from '../../components/FloatingHeader';
import { useMessages } from '../../i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../lib/navigation';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';
import { useGatewayConfigured } from '../../query/sessions';

import { CronRunsList } from './CronRunsList';
import { SchedulesList } from './SchedulesList';

type AutomationTab = 'schedules' | 'runs';

export function AutomationScreen() {
  const router = useRouter();
  useDismissOnHardwareBack(router);
  const isDark = useResolvedIsDark();
  const configured = useGatewayConfigured();
  const m = useMessages();
  const pm = m.automationPage;
  const [tab, setTab] = useState<AutomationTab>('schedules');

  const screenBg = isDark ? '#111827' : '#F9FAFB';
  const tabBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const activeTabBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const tabText = isDark ? '#9CA3AF' : '#6B7280';
  const activeTabText = isDark ? '#F9FAFB' : '#111827';

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <FloatingHeader title={pm.title} onBack={() => dismissOrHome(router)} />

      {!configured ? (
        <View style={styles.center}>
          <Text style={{ opacity: 0.6 }}>{m.sessions.gatewayNotConfigured}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.tabBar, { backgroundColor: tabBg }]}>
            <TabButton
              label={pm.schedulesTab}
              active={tab === 'schedules'}
              onPress={() => setTab('schedules')}
              activeBg={activeTabBg}
              textColor={tabText}
              activeTextColor={activeTabText}
            />
            <TabButton
              label={pm.runsTab}
              active={tab === 'runs'}
              onPress={() => setTab('runs')}
              activeBg={activeTabBg}
              textColor={tabText}
              activeTextColor={activeTabText}
            />
          </View>
          <View style={styles.content}>
            {tab === 'schedules' ? <SchedulesList /> : <CronRunsList />}
          </View>
        </>
      )}
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  activeBg,
  textColor,
  activeTextColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeBg: string;
  textColor: string;
  activeTextColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabButton,
        active && { backgroundColor: activeBg },
      ]}
    >
      <Text
        style={[
          styles.tabLabel,
          { color: active ? activeTextColor : textColor },
          active && styles.tabLabelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});
