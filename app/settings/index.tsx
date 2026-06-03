import Constants from 'expo-constants';
import { useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import {
  SettingsRow,
  SettingsSection,
  useSettingsColors,
} from '../../src/features/settings/settings-ui';
import { ConnectionLogCard } from '../../src/features/gateway/ConnectionLogCard';
import { useMessages } from '../../src/i18n/messages';
import { dismissOrHome, useDismissOnHardwareBack } from '../../src/lib/navigation';
import {
  connectionKindLabel,
  useGatewayConnectionView,
} from '../../src/features/gateway/use-gateway-connection-view';
import { useGatewayConfigured } from '../../src/query/sessions';
import { useGatewayStore } from '../../src/stores/gateway-store';
import {
  type Language,
  type ThemePreference,
  usePreferencesStore,
} from '../../src/stores/preferences-store';

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
  const connectionView = useGatewayConnectionView();
  const profiles = useGatewayStore((st) => st.profiles);
  const activeProfile = useGatewayStore((st) =>
    st.activeGatewayId ? st.profiles.find((p) => p.id === st.activeGatewayId) : null,
  );
  const mGateway = m.gateway;
  const gatewayValue = useMemo(() => {
    if (!configured || connectionView.connectionKind === 'unconfigured') {
      return s.gatewayNotConfigured;
    }
    const host = connectionView.activeHost || connectionView.tunnelHost;
    const kind = connectionKindLabel(connectionView.connectionKind, mGateway);
    const hostPart = host ? `${host} · ${kind}` : kind;
    if (profiles.length > 1 && activeProfile?.name) {
      return `${activeProfile.name} · ${hostPart}`;
    }
    return hostPart;
  }, [
    activeProfile?.name,
    configured,
    connectionView,
    mGateway,
    profiles.length,
    s.gatewayNotConfigured,
  ]);

  const language = usePreferencesStore((st) => st.language);
  const themePreference = usePreferencesStore((st) => st.themePreference);

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
          isLast
          onPress={() => router.push('/settings/gateway')}
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
          onPress={() => router.push('/tasks')}
        />
        <SettingsRow
          icon="share-variant"
          iconColor="#2563EB"
          label={m.mySharesPage.title}
          isLast
          onPress={() => router.push('/shares')}
        />
      </SettingsSection>

      <ConnectionLogCard />

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
          onPress={() => void Linking.openURL('https://xopcai.github.io/xopc')}
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
