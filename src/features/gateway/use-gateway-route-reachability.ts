import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useGatewayStore } from '../../stores/gateway-store';

import {
  probeAndApplyPreferredRoute,
  type GatewayRouteReachability,
  type RouteReachabilityInfo,
} from './check-gateway-routes';

const ROUTE_RECHECK_COOLDOWN_MS = 20_000;

function initialReachability(lanUrl: string | null, enabled: boolean, baseUrl: string): GatewayRouteReachability {
  return {
    lan: { status: lanUrl ? 'checking' : 'not_configured' },
    tunnel: { status: enabled && baseUrl.trim() ? 'checking' : 'unreachable' },
  };
}

function unreachableInfo(reason?: RouteReachabilityInfo['reason']): RouteReachabilityInfo {
  return { status: 'unreachable', reason };
}

export type GatewayRouteRecheckOptions = {
  /** Bypass the cooldown (explicit user retry from chat, etc.). */
  force?: boolean;
};

export function useGatewayRouteReachability(enabled: boolean): {
  reachability: GatewayRouteReachability;
  checking: boolean;
  recheck: (opts?: GatewayRouteRecheckOptions) => Promise<void>;
} {
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  const lanUrl = useGatewayStore((s) => s.lanUrl);
  const token = useGatewayStore((s) => s.token);

  const [reachability, setReachability] = useState<GatewayRouteReachability>(() =>
    initialReachability(lanUrl, enabled, baseUrl),
  );
  const [checking, setChecking] = useState(false);
  const lastRecheckAtRef = useRef(0);

  const recheck = useCallback(async (opts?: GatewayRouteRecheckOptions) => {
    if (!enabled || !baseUrl.trim()) {
      setReachability({
        lan: lanUrl ? unreachableInfo() : { status: 'not_configured' },
        tunnel: unreachableInfo(),
      });
      return;
    }

    const now = Date.now();
    if (!opts?.force && now - lastRecheckAtRef.current < ROUTE_RECHECK_COOLDOWN_MS) return;
    lastRecheckAtRef.current = now;

    setChecking(true);
    setReachability(initialReachability(lanUrl, enabled, baseUrl));

    try {
      const { reachability: next } = await probeAndApplyPreferredRoute();
      setReachability(next);
    } finally {
      setChecking(false);
    }
  }, [baseUrl, enabled, lanUrl, token]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void recheck();
    }, [enabled, recheck]),
  );

  return { reachability, checking, recheck };
}
