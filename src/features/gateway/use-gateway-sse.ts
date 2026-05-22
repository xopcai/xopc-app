import { useEffect, useRef } from 'react';

import { useGatewayConfigured } from '../../query/sessions';
import { useGatewayStore } from '../../stores/gateway-store';
import { resolveEffectiveGatewayBaseUrl } from '../../stores/gateway-types';

import { GatewaySseConnection } from './gateway-sse-connection';

let sharedConnection: GatewaySseConnection | null = null;

/**
 * Keeps a single SSE connection to `GET /api/events` while the app is configured (web parity).
 */
export function useGatewaySse(): void {
  const configured = useGatewayConfigured();
  const token = useGatewayStore((s) => s.token);
  const connRef = useRef<GatewaySseConnection | null>(null);
  const gatewayEndpoint = useGatewayStore((s) =>
    resolveEffectiveGatewayBaseUrl({
      activeBaseUrl: s.activeBaseUrl,
      baseUrl: s.baseUrl,
      lanUrl: s.lanUrl,
    }),
  );

  useEffect(() => {
    if (!configured || !token || !gatewayEndpoint) {
      connRef.current?.disconnect();
      connRef.current = null;
      sharedConnection = null;
      return;
    }

    const conn = new GatewaySseConnection({
      onConnected: () => {},
      onReconnecting: () => {},
      onDisconnected: () => {},
      onError: () => {},
    });
    connRef.current = conn;
    sharedConnection = conn;
    conn.connect();

    return () => {
      conn.disconnect();
      if (sharedConnection === conn) sharedConnection = null;
      connRef.current = null;
    };
  }, [configured, token, gatewayEndpoint]);
}

export function getSharedGatewaySseConnection(): GatewaySseConnection | null {
  return sharedConnection;
}
