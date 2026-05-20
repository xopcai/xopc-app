import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useGatewayStore } from '../../stores/gateway-store';

import { syncGatewayAfterConnectivityChange } from './gateway-connection-sync';

const REFRESH_MS = 60_000;

/**
 * Re-probe LAN vs tunnel when app is foregrounded and periodically while active.
 */
export function useGatewayConnectionWatch(enabled: boolean): void {
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  const lanUrl = useGatewayStore((s) => s.lanUrl);
  const refreshActiveBaseUrl = useGatewayStore((s) => s.refreshActiveBaseUrl);

  useEffect(() => {
    if (!enabled || !baseUrl) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      const prev = useGatewayStore.getState().activeBaseUrl;
      const next = await refreshActiveBaseUrl();
      if (prev && next && prev !== next) {
        syncGatewayAfterConnectivityChange();
      }
    };

    run();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') run();
    };

    const sub = AppState.addEventListener('change', onAppState);
    intervalId = setInterval(run, REFRESH_MS);

    return () => {
      sub.remove();
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled, baseUrl, lanUrl, refreshActiveBaseUrl]);
}
