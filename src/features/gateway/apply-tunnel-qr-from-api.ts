import { fetchTunnelQr } from '../../api/tunnel';
import { useGatewayStore } from '../../stores/gateway-store';
import { syncGatewayAfterConnectivityChange } from './gateway-connection-sync';
import { buildTunnelQrPatch } from './tunnel-qr-merge';

export { buildTunnelQrPatch, shouldUpdateBaseUrlFromPublicUrl } from './tunnel-qr-merge';
export type { ApplyTunnelQrPatch } from './tunnel-qr-merge';

export type SyncGatewayUrlsFromTunnelQrResult = {
  updated: boolean;
  lanUrlUpdated: boolean;
  baseUrlUpdated: boolean;
};

/**
 * Pull fresh lanUrl (and publicUrl when safe) from the gateway, persist, and re-probe route.
 */
export async function syncGatewayUrlsFromTunnelQr(): Promise<SyncGatewayUrlsFromTunnelQrResult> {
  const qr = await fetchTunnelQr();
  if (!qr) {
    return { updated: false, lanUrlUpdated: false, baseUrlUpdated: false };
  }

  const st = useGatewayStore.getState();
  const patch = buildTunnelQrPatch(qr, st.baseUrl);
  const prevLan = st.lanUrl;
  const prevBase = st.baseUrl;
  const prevActive = st.activeBaseUrl;

  const lanUrlUpdated = patch.lanUrl !== prevLan;
  if (lanUrlUpdated) {
    st.setLanUrl(patch.lanUrl);
  }

  let baseUrlUpdated = false;
  if (patch.baseUrl && patch.baseUrl !== prevBase) {
    st.setBaseUrl(patch.baseUrl);
    baseUrlUpdated = true;
  }

  if (lanUrlUpdated || baseUrlUpdated) {
    st.persist();
  }

  await st.refreshActiveBaseUrl();
  const activeChanged = useGatewayStore.getState().activeBaseUrl !== prevActive;
  if (lanUrlUpdated || baseUrlUpdated || activeChanged) {
    syncGatewayAfterConnectivityChange();
  }

  return {
    updated: lanUrlUpdated || baseUrlUpdated,
    lanUrlUpdated,
    baseUrlUpdated,
  };
}
