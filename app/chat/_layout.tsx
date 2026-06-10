/**
 * Chat detail stack — pushed on top of the tab navigator.
 *
 * Route: /chat/[k]  (k = session key, optional msg = prefill message)
 */
import { Stack } from 'expo-router';

export default function ChatDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[k]" />
    </Stack>
  );
}
