import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import { useGatewayStore } from '../../stores/gateway-store';

import {
  probeAndApplyPreferredRoute,
  type GatewayRouteReachability,
} from './check-gateway-routes';

export function useGatewayRouteReachability(enabled: boolean): {
  reachability: GatewayRouteReachability;
  checking: boolean;
  recheck: () => Promise<void>;
} {
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  const lanUrl = useGatewayStore((s) => s.lanUrl);
  const token = useGatewayStore((s) => s.token);

  const [reachability, setReachability] = useState<GatewayRouteReachability>(() => ({
    lan: lanUrl ? 'checking' : 'not_configured',
    tunnel: enabled && baseUrl.trim() ? 'checking' : 'unreachable',
  }));
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    if (!enabled || !baseUrl.trim()) {
      setReachability({
        lan: lanUrl ? 'unreachable' : 'not_configured',
        tunnel: 'unreachable',
      });
      return;
    }

    setChecking(true);
    setReachability({
      lan: lanUrl ? 'checking' : 'not_configured',
      tunnel: 'checking',
    });

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
