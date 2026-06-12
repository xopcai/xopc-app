/**
 * Main layout — AI Workspace single home screen (no bottom tabs).
 *
 * expo-router file-system route: app/(tabs)/_layout.tsx
 */
import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '../../src/lib/stack-screen-theme';

export default function MainLayout() {
  const themedScreenOptions = useThemedStackScreenOptions();

  return (
    <Stack screenOptions={{ headerShown: false, ...themedScreenOptions }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
