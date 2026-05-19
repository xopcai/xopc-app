import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import {
  SettingsRow,
  SettingsSection,
  useSettingsColors,
} from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../src/lib/navigation';
import { fetchChatAgents } from '../../src/query/agents';
import { queryKeys } from '../../src/query/keys';
import { useGatewayConfigured } from '../../src/query/sessions';
import {
  type Language,
  type ThemePreference,
  usePreferencesStore,
} from '../../src/stores/preferences-store';
import { useGatewayStore } from '../../src/stores/gateway-store';

function themeLabel(pref: ThemePreference, s: ReturnType<typeof useMessages>['settings']): string {
  if (pref === 'light') return s.themeLight;
  if (pref === 'dark') return s.themeDark;
  return s.themeSystem;
}

function languageLabel(lang: Language, s: ReturnType<typeof useMessages>['settings']): string {
  return lang === 'zh' ? s.languageZh : s.languageEn;
}

export default function SettingsIndexScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const m = useMessages();
  const s = m.settings;
  const colors = useSettingsColors();

  const configured = useGatewayConfigured();
  const baseUrl = useGatewayStore((st) => st.baseUrl);
  const language = usePreferencesStore((st) => st.language);
  const themePreference = usePreferencesStore((st) => st.themePreference);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
    enabled: configured,
  });

  const defaultAgentName = useMemo(() => {
    if (!agentsQuery.data) return '—';
    const id = agentsQuery.data.defaultId ?? 'main';
    return agentsQuery.data.items.find((a) => a.id === id)?.name?.trim() || id;
  }, [agentsQuery.data]);

  const gatewayValue = useMemo(() => {
    if (!configured || !baseUrl) return s.gatewayNotConfigured;
    try {
      const u = new URL(baseUrl);
      return u.host;
    } catch {
      return baseUrl;
    }
  }, [baseUrl, configured, s.gatewayNotConfigured]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useDismissOnHardwareBack(router);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <IconButton icon="arrow-left" onPress={() => dismissOrHome(router)} />
      ),
    });
  }, [navigation, router]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.pageBg }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <SettingsSection>
        <SettingsRow
          icon="web"
          iconColor="#5856D6"
          label={s.gateway}
          value={gatewayValue}
          onPress={() => router.push('/settings/gateway')}
        />
        <SettingsRow
          icon="robot-outline"
          iconColor="#007AFF"
          label={s.defaultAgent}
          value={defaultAgentName}
          isLast
          onPress={() => router.push('/agents')}
        />
      </SettingsSection>

      <SettingsSection title={s.sectionPreferences}>
        <SettingsRow
          icon="translate"
          iconColor="#34C759"
          label={s.language}
          value={languageLabel(language, s)}
          onPress={() => router.push('/settings/language')}
        />
        <SettingsRow
          icon="theme-light-dark"
          iconColor="#FF9500"
          label={s.theme}
          value={themeLabel(themePreference, s)}
          isLast
          onPress={() => router.push('/settings/theme')}
        />
      </SettingsSection>

      <SettingsSection title={s.sectionGatewayFeatures}>
        <SettingsRow
          icon="robot-outline"
          iconColor="#007AFF"
          label={m.agentsPage.title}
          onPress={() => router.push('/agents')}
        />
        <SettingsRow
          icon="clock-outline"
          iconColor="#FF9500"
          label={m.schedulesPage.title}
          onPress={() => router.push('/schedules')}
        />
        <SettingsRow
          icon="checkbox-marked-outline"
          iconColor="#34C759"
          label={m.tasksPage.title}
          isLast
          onPress={() => router.push('/tasks')}
        />
      </SettingsSection>

      <SettingsSection title={s.sectionAbout}>
        <SettingsRow
          icon="information-outline"
          iconColor="#8E8E93"
          label={s.about}
          onPress={() => router.push('/settings/about')}
        />
        <SettingsRow
          icon="book-open-variant"
          iconColor="#5856D6"
          label={s.helpDocs}
          onPress={() => void Linking.openURL('https://github.com/nicepkg/xopc')}
        />
        <SettingsRow
          icon="tag-outline"
          iconColor="#8E8E93"
          label={s.softwareVersion}
          value={appVersion}
          showChevron={false}
          isLast
        />
      </SettingsSection>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  bottomSpacer: {
    height: 24,
  },
});
