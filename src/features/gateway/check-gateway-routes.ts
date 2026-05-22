import { probeGatewayHealth } from '../../api/connection-strategy';
import { useGatewayStore } from '../../stores/gateway-store';

import { syncGatewayAfterConnectivityChange } from './gateway-connection-sync';

export type RouteReachabilityStatus =
  | 'checking'
  | 'reachable'
  | 'unreachable'
  | 'not_configured';

export type GatewayRouteReachability = {
  lan: RouteReachabilityStatus;
  tunnel: RouteReachabilityStatus;
};

export async function probeGatewayRoutes(input: {
  tunnelUrl: string;
  lanUrl: string | null;
  token: string;
}): Promise<Pick<GatewayRouteReachability, 'lan' | 'tunnel'>> {
  const probeOpts = { token: input.token };
  const tunnelUrl = input.tunnelUrl.trim();
  const lanUrl = input.lanUrl?.trim() ?? '';

  const [lanOk, tunnelOk] = await Promise.all([
    lanUrl ? probeGatewayHealth(lanUrl, probeOpts) : Promise.resolve(null),
    tunnelUrl ? probeGatewayHealth(tunnelUrl, probeOpts) : Promise.resolve(false),
  ]);

  return {
    lan: !lanUrl
      ? 'not_configured'
      : lanOk
        ? 'reachable'
        : 'unreachable',
    tunnel: tunnelOk ? 'reachable' : 'unreachable',
  };
}

/** Probe LAN and tunnel reachability, then apply LAN-first active route. */
export async function probeAndApplyPreferredRoute(): Promise<{
  reachability: Pick<GatewayRouteReachability, 'lan' | 'tunnel'>;
  routeChanged: boolean;
}> {
  const st = useGatewayStore.getState();
  const reachability = await probeGatewayRoutes({
    tunnelUrl: st.baseUrl,
    lanUrl: st.lanUrl,
    token: st.token,
  });

  const prevActive = st.activeBaseUrl;
  const preferredUrl = await st.refreshActiveBaseUrl();
  const routeChanged = Boolean(prevActive && preferredUrl && prevActive !== preferredUrl);
  if (routeChanged) {
    syncGatewayAfterConnectivityChange();
  }

  return { reachability, routeChanged };
}

export function reachabilityStatusLabel(
  status: RouteReachabilityStatus,
  labels: {
    reachable: string;
    unreachable: string;
    checking: string;
  },
): string {
  switch (status) {
    case 'reachable':
      return labels.reachable;
    case 'unreachable':
      return labels.unreachable;
    case 'checking':
      return labels.checking;
    case 'not_configured':
      return '';
  }
}

export function reachabilityStatusColor(status: RouteReachabilityStatus, muted: string): string {
  switch (status) {
    case 'reachable':
      return '#34C759';
    case 'unreachable':
      return '#FF3B30';
    case 'checking':
      return muted;
    case 'not_configured':
      return muted;
  }
}
