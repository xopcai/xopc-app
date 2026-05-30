import { decryptEnvelope, encryptEnvelope } from '@xopcai/xopc-e2ee';

import { useGatewayStore } from '../stores/gateway-store';

import { renewE2eeSession } from './e2ee-handshake';
import {
  bumpE2eeRequestSeq,
  bumpE2eeResponseSeq,
  clearE2eeSession,
  loadActiveE2eeSession,
  persistActiveE2eeSession,
  requiresE2eeTransport,
  type ActiveE2eeSession,
} from './e2ee-session';

async function resolveE2eeSession(): Promise<ActiveE2eeSession | null> {
  const { activeGatewayId, activeBaseUrl, baseUrl } = useGatewayStore.getState();
  const routeUrl = activeBaseUrl || baseUrl;
  if (!requiresE2eeTransport(routeUrl)) return null;
  return loadActiveE2eeSession(activeGatewayId, baseUrl);
}

async function ensureE2eeSession(): Promise<ActiveE2eeSession> {
  const existing = await resolveE2eeSession();
  if (existing) return existing;

  const { token, baseUrl, activeGatewayId, activeBaseUrl } = useGatewayStore.getState();
  const origin = baseUrl || activeBaseUrl;
  if (!token.trim() || !origin.trim()) {
    throw new Error('E2EE session required for remote tunnel access');
  }
  await renewE2eeSession({
    origin,
    token,
    gatewayId: activeGatewayId,
    baseUrl: origin,
  });
  const session = await resolveE2eeSession();
  if (!session) throw new Error('E2EE session required for remote tunnel access');
  return session;
}

type RelayPayload = {
  ok?: boolean;
  status?: number;
  seq?: number;
  envelope?: Parameters<typeof decryptEnvelope>[1];
  error?: string;
  code?: string;
};

async function postE2eeRelay(
  session: ActiveE2eeSession,
  path: string,
  init: RequestInit | undefined,
): Promise<{ res: Response; payload: RelayPayload; session: ActiveE2eeSession }> {
  const { token, apiUrl, activeGatewayId, baseUrl } = useGatewayStore.getState();
  const method = (init?.method ?? 'GET').toUpperCase();
  const bodyText =
    init?.body == null
      ? ''
      : typeof init.body === 'string'
        ? init.body
        : JSON.stringify(init.body);

  const seq = bumpE2eeRequestSeq(session);
  const envelope = await encryptEnvelope(session.requestKey, seq, bodyText, { method, path });
  if (activeGatewayId || baseUrl) persistActiveE2eeSession(activeGatewayId, baseUrl, session);

  const res = await fetch(apiUrl('/api/e2ee/relay'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId: session.sessionId, seq, method, path, envelope }),
    signal: init?.signal,
  });

  const payload = (await res.json()) as RelayPayload;
  return { res, payload, session };
}

export async function e2eeRelayFetch(path: string, init?: RequestInit): Promise<Response> {
  let session = await ensureE2eeSession();

  let { payload } = await postE2eeRelay(session, path, init);

  if (
    !payload.envelope &&
    (payload.code === 'E2EE_SESSION' || payload.error?.includes('Invalid or expired E2EE session'))
  ) {
    const { token, baseUrl, activeGatewayId, activeBaseUrl } = useGatewayStore.getState();
    const origin = baseUrl || activeBaseUrl;
    clearE2eeSession(activeGatewayId, origin);
    await renewE2eeSession({ origin, token, gatewayId: activeGatewayId, baseUrl: origin });
    session = (await resolveE2eeSession()) ?? session;
    ({ payload } = await postE2eeRelay(session, path, init));
  }

  if (!payload.envelope) {
    throw new Error(payload.error?.trim() || 'E2EE relay failed');
  }

  if (typeof payload.seq === 'number') {
    bumpE2eeResponseSeq(session, payload.seq);
  }

  const plaintext = await decryptEnvelope(session.responseKey, payload.envelope);
  const status = payload.status ?? 200;
  const { activeGatewayId, baseUrl } = useGatewayStore.getState();
  if (activeGatewayId || baseUrl) persistActiveE2eeSession(activeGatewayId, baseUrl, session);

  return new Response(plaintext, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function shouldUseE2eeFetch(): Promise<boolean> {
  const { activeBaseUrl, baseUrl } = useGatewayStore.getState();
  return requiresE2eeTransport(activeBaseUrl || baseUrl);
}

export { ensureE2eeSession, resolveE2eeSession };
