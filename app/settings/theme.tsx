import { ScrollView, StyleSheet } from 'react-native';

import {
  SettingsOptionRow,
  SettingsSection,
  useSettingsColors,
} from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { type ThemePreference, usePreferencesStore } from '../../src/stores/preferences-store';

const OPTIONS: { value: ThemePreference; labelKey: 'themeLight' | 'themeDark' | 'themeSystem' }[] = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' },
];

export default function ThemeSettingsScreen() {
  const m = useMessages();
  const s = m.settings;
  const colors = useSettingsColors();
  const themePreference = usePreferencesStore((st) => st.themePreference);
  const setThemePreference = usePreferencesStore((st) => st.setThemePreference);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.pageBg }}
      contentContainerStyle={styles.scroll}
    >
      <SettingsSection>
        {OPTIONS.map((opt, i) => (
          <SettingsOptionRow
            key={opt.value}
            label={s[opt.labelKey]}
            selected={themePreference === opt.value}
            isLast={i === OPTIONS.length - 1}
            onPress={() => setThemePreference(opt.value)}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
