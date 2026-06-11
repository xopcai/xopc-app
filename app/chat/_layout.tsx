/**
 * Chat detail stack — pushed on top of the tab navigator.
 *
 * Route: /chat          (fresh chat — bootstrap creates session key)
 *        /chat/[k]      (k = session key, optional msg = prefill message)
 */
import { Stack } from 'expo-router';

export default function ChatDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[k]" />
    </Stack>
  );
}
