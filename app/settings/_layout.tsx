import { Stack } from 'expo-router';

import { useMessages } from '../../src/i18n/messages';

export default function SettingsLayout() {
  const m = useMessages();
  const s = m.settings;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: s.title }} />
      <Stack.Screen name="gateway" options={{ title: s.gateway }} />
      <Stack.Screen name="language" options={{ title: s.language }} />
      <Stack.Screen name="theme" options={{ title: s.theme }} />
      <Stack.Screen name="about" options={{ title: s.about }} />
    </Stack>
  );
}
