import '../src/shims';

import { QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

import { tryConsumeGatewayDeeplink } from '../src/features/gateway/apply-gateway-deeplink';
import { GatewayConnectLandingContext } from '../src/features/gateway/gateway-connect-context';
import { GatewayConnectLandingModal } from '../src/features/gateway/GatewayConnectLandingModal';
import { useMessages } from '../src/i18n/messages';
import { queryClient } from '../src/query/query-client';
import { useGatewayConfigured } from '../src/query/sessions';
import { useGatewayStore } from '../src/stores/gateway-store';
import {
  subscribeSystemAppearance,
  usePreferencesStore,
} from '../src/stores/preferences-store';

export default function RootLayout() {
  const router = useRouter();
  const resolvedTheme = usePreferencesStore((s) => s.resolvedTheme);
  const hydratePrefs = usePreferencesStore((s) => s.hydrate);
  const hydrateGateway = useGatewayStore((s) => s.hydrateFromStorage);
  const m = useMessages();
  const configured = useGatewayConfigured();
  const unauthorized = useGatewayStore((s) => s.unauthorized);
  const [userDismissedConnect, setUserDismissedConnect] = useState(false);

  const paperTheme = resolvedTheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  useEffect(() => {
    hydrateGateway();
    hydratePrefs();
    return subscribeSystemAppearance();
  }, [hydrateGateway, hydratePrefs]);

  useEffect(() => {
    if (configured) setUserDismissedConnect(false);
  }, [configured]);

  /** 401 — same as web: force gateway landing until credentials are fixed. */
  useEffect(() => {
    if (unauthorized) setUserDismissedConnect(false);
  }, [unauthorized]);

  useEffect(() => {
    let alive = true;
    const run = (url: string) => {
      void tryConsumeGatewayDeeplink(url, router, queryClient);
    };
    void Linking.getInitialURL().then((url) => {
      if (alive && url) run(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (alive) run(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [router]);

  const connectLandingVisible =
    (!configured && !userDismissedConnect) || unauthorized;

  const openGatewayConnectLanding = useCallback(() => {
    setUserDismissedConnect(false);
  }, []);

  const onConnectLandingClose = useCallback(() => {
    if (useGatewayStore.getState().unauthorized) return;
    setUserDismissedConnect(true);
    router.replace('/');
  }, [router]);

  const gatewayConnectCtx = useMemo(
    () => ({ openGatewayConnectLanding }),
    [openGatewayConnectLanding],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={paperTheme}>
            <GatewayConnectLandingContext.Provider value={gatewayConnectCtx}>
              <Stack screenOptions={{ headerShown: false }}>
              {/**
               * Keep the main app group first so cold start / restored state default to chat,
               * not the first modal screen declared below.
               */}
                <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="settings"
                  options={{
                    headerShown: false,
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="agents"
                  options={{
                    headerShown: true,
                    title: m.agentsPage.title,
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="schedules"
                  options={{
                    headerShown: false,
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="tasks"
                  options={{
                    headerShown: false,
                    presentation: 'modal',
                  }}
                />
              </Stack>
              <GatewayConnectLandingModal
                visible={connectLandingVisible}
                onRequestClose={onConnectLandingClose}
              />
            </GatewayConnectLandingContext.Provider>
          </PaperProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
