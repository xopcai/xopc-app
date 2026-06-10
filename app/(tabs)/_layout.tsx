/**
 * Main layout — single home screen (no bottom tabs).
 *
 * expo-router file-system route: app/(tabs)/_layout.tsx
 */
import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
