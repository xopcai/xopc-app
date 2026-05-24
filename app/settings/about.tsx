import Constants from 'expo-constants';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { SettingsRow, SettingsSection, useSettingsColors } from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';

export default function AboutSettingsScreen() {
  const m = useMessages();
  const s = m.settings;
  const colors = useSettingsColors();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.pageBg }}
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.hero}>
        <Text style={[styles.appName, { color: colors.text }]}>XOPC</Text>
        <Text style={[styles.version, { color: colors.textMuted }]}>v{appVersion}</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>{s.aboutDescription}</Text>
      </View>

      <SettingsSection>
        <SettingsRow
          icon="book-open-variant"
          iconColor="#5856D6"
          label={s.helpDocs}
          onPress={() => void Linking.openURL('https://xopcai.github.io/xopc')}
        />
        <SettingsRow
          icon="github"
          iconColor="#1C1C1E"
          label={s.sourceCode}
          isLast
          onPress={() => void Linking.openURL('https://github.com/xopcai/xopc')}
        />
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
  },
  version: {
    fontSize: 15,
  },
  tagline: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 24,
  },
});
