import {
  probeGatewayRouteReachability,
  type GatewayRouteProbeReason,
} from '../../api/connection-strategy';
import { useGatewayStore } from '../../stores/gateway-store';

import { syncGatewayAfterConnectivityChange } from './gateway-connection-sync';

export type RouteReachabilityStatus =
  | 'checking'
  | 'reachable'
  | 'unreachable'
  | 'not_configured';

export type RouteReachabilityInfo = {
  status: RouteReachabilityStatus;
  reason?: GatewayRouteProbeReason;
  httpStatus?: number;
  detail?: string;
};

export type GatewayRouteReachability = {
  lan: RouteReachabilityInfo;
  tunnel: RouteReachabilityInfo;
};

function probeToReachability(
  probe: Awaited<ReturnType<typeof probeGatewayRouteReachability>>,
): RouteReachabilityInfo {
  if (probe.reachable) {
    return { status: 'reachable' };
  }
  return {
    status: 'unreachable',
    reason: probe.reason,
    httpStatus: probe.httpStatus,
    detail: probe.errorMessage,
  };
}

export async function probeGatewayRoutes(input: {
  tunnelUrl: string;
  lanUrl: string | null;
  token: string;
}): Promise<GatewayRouteReachability> {
  const probeOpts = { token: input.token };
  const tunnelUrl = input.tunnelUrl.trim();
  const lanUrl = input.lanUrl?.trim() ?? '';

  const [lanProbe, tunnelProbe] = await Promise.all([
    lanUrl ? probeGatewayRouteReachability(lanUrl, probeOpts) : Promise.resolve(null),
    tunnelUrl ? probeGatewayRouteReachability(tunnelUrl, probeOpts) : Promise.resolve(null),
  ]);

  return {
    lan: !lanUrl
      ? { status: 'not_configured' }
      : probeToReachability(lanProbe!),
    tunnel: !tunnelUrl
      ? { status: 'unreachable', reason: 'invalid_url' }
      : probeToReachability(tunnelProbe!),
  };
}

/** Probe LAN and tunnel reachability, then apply LAN-first active route. */
export async function probeAndApplyPreferredRoute(): Promise<{
  reachability: GatewayRouteReachability;
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
    syncGatewayAfterConnectivityChange({ immediate: true });
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

export function formatReachabilityReason(
  info: RouteReachabilityInfo,
  labels: {
    timeout: string;
    networkError: string;
    networkErrorWithDetail: string;
    invalidUrl: string;
    httpError: string;
  },
): string {
  if (info.status !== 'unreachable' || !info.reason) return '';

  switch (info.reason) {
    case 'timeout':
      return labels.timeout;
    case 'invalid_url':
      return labels.invalidUrl;
    case 'http_error':
      return labels.httpError.replace('{{status}}', String(info.httpStatus ?? '?'));
    case 'network_error':
      if (info.detail) {
        return labels.networkErrorWithDetail.replace('{{detail}}', info.detail);
      }
      return labels.networkError;
  }
}
