import { queryKeys } from '../../query/keys';
import { queryClient } from '../../query/query-client';
import { useGatewayStore } from '../../stores/gateway-store';

import { getSharedGatewaySseConnection } from './use-gateway-sse';

/** Invalidate REST caches and reopen SSE after the active gateway URL changes or comes back online. */
export function syncGatewayAfterConnectivityChange(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
  getSharedGatewaySseConnection()?.reconnect();
}

/** Persisted gateway settings changed — refresh active URL and reconnect immediately (no app restart). */
export async function syncAfterGatewaySettingsSave(): Promise<void> {
  await useGatewayStore.getState().refreshActiveBaseUrl();
  syncGatewayAfterConnectivityChange();
}
