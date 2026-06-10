/**
 * Chat detail screen — pushed on top of the tab navigator.
 *
 * Wraps the existing ChatScreen inside a drawer for session switching.
 * Route: /chat/[k]  (k = session key, optional msg = prefill message)
 */
import { Drawer } from 'expo-router/drawer';

import { DrawerContent } from '../../src/components/DrawerContent';

export default function ChatDetailLayout() {
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: '80%' },
        swipeEnabled: true,
        swipeEdgeWidth: 40,
      }}
    >
      <Drawer.Screen name="[k]" options={{ headerShown: false }} />
    </Drawer>
  );
}
