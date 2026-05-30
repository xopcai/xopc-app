import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useGatewayStore } from '../../stores/gateway-store';

import { syncGatewayAfterConnectivityChange } from './gateway-connection-sync';

const REFRESH_MS = 90_000;
const REFRESH_COOLDOWN_MS = 15_000;

let lastRouteRefreshAt = 0;

/**
 * Re-probe LAN vs tunnel when app is foregrounded and periodically while active.
 */
export function useGatewayConnectionWatch(enabled: boolean): void {
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  const lanUrl = useGatewayStore((s) => s.lanUrl);
  const refreshActiveBaseUrl = useGatewayStore((s) => s.refreshActiveBaseUrl);

  useEffect(() => {
    if (!enabled || !baseUrl) return;

    const run = async () => {
      const now = Date.now();
      if (now - lastRouteRefreshAt < REFRESH_COOLDOWN_MS) return;
      lastRouteRefreshAt = now;

      const prev = useGatewayStore.getState().activeBaseUrl;
      const next = await refreshActiveBaseUrl();
      if (prev && next && prev !== next) {
        syncGatewayAfterConnectivityChange({ immediate: true });
      }
    };

    run();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') run();
    };

    const sub = AppState.addEventListener('change', onAppState);
    const intervalId = setInterval(run, REFRESH_MS);

    return () => {
      sub.remove();
      clearInterval(intervalId);
    };
  }, [enabled, baseUrl, lanUrl, refreshActiveBaseUrl]);
}

/** @internal test helper */
export function resetGatewayConnectionWatchStateForTests(): void {
  lastRouteRefreshAt = 0;
}
