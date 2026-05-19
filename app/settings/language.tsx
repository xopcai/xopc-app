import { ScrollView, StyleSheet } from 'react-native';

import {
  SettingsOptionRow,
  SettingsSection,
  useSettingsColors,
} from '../../src/features/settings/settings-ui';
import { useMessages } from '../../src/i18n/messages';
import { type Language, usePreferencesStore } from '../../src/stores/preferences-store';

const OPTIONS: { value: Language; labelKey: 'languageEn' | 'languageZh' }[] = [
  { value: 'en', labelKey: 'languageEn' },
  { value: 'zh', labelKey: 'languageZh' },
];

export default function LanguageSettingsScreen() {
  const m = useMessages();
  const s = m.settings;
  const colors = useSettingsColors();
  const language = usePreferencesStore((st) => st.language);
  const setLanguage = usePreferencesStore((st) => st.setLanguage);

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
            selected={language === opt.value}
            isLast={i === OPTIONS.length - 1}
            onPress={() => setLanguage(opt.value)}
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
