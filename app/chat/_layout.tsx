/**
 * Chat detail stack — pushed on top of the tab navigator.
 *
 * Route: /chat          (fresh chat — bootstrap creates session key)
 *        /chat/[k]      (k = session key, optional msg = prefill message)
 */
import { Stack } from 'expo-router';

import { useThemedStackScreenOptions } from '../../src/lib/stack-screen-theme';

export default function ChatDetailLayout() {
  const themedScreenOptions = useThemedStackScreenOptions();

  return (
    <Stack screenOptions={{ headerShown: false, ...themedScreenOptions }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[k]" />
    </Stack>
  );
}
