import { useMemo } from 'react';

import { useGatewayConfigured } from '../../query/sessions';

import {
  type GatewayRouteReachability,
  type RouteReachabilityStatus,
} from './check-gateway-routes';
import { useGatewayRouteReachability } from './use-gateway-route-reachability';

function isRouteDown(status: RouteReachabilityStatus): boolean {
  return status === 'unreachable';
}

/** True when probing finished and no configured route (LAN / FRP) is reachable. */
export function isGatewayFullyUnreachable(
  reachability: GatewayRouteReachability,
  checking: boolean,
): boolean {
  if (checking) return false;
  if (reachability.lan.status === 'checking' || reachability.tunnel.status === 'checking') {
    return false;
  }
  const lanDown =
    reachability.lan.status === 'not_configured' || isRouteDown(reachability.lan.status);
  const tunnelDown = isRouteDown(reachability.tunnel.status);
  const anyReachable =
    reachability.lan.status === 'reachable' || reachability.tunnel.status === 'reachable';
  if (anyReachable) return false;

  const hasLan = reachability.lan.status !== 'not_configured';
  if (hasLan) return lanDown && tunnelDown;
  return tunnelDown;
}

export function useGatewayFullyUnreachable(): {
  fullyUnreachable: boolean;
  checking: boolean;
} {
  const configured = useGatewayConfigured();
  const { reachability, checking } = useGatewayRouteReachability(configured);

  const fullyUnreachable = useMemo(
    () => configured && isGatewayFullyUnreachable(reachability, checking),
    [configured, reachability, checking],
  );

  return { fullyUnreachable, checking };
}
