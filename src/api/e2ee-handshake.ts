import {
  base64UrlToBytes,
  bytesToBase64Url,
  deriveSessionRootKey,
  generateX25519KeyPair,
  hmacSha256,
} from '@xopcai/xopc-e2ee';

import {
  clearE2eeSession,
  createStoredE2eeSession,
  saveE2eeSession,
  type StoredE2eeSession,
} from './e2ee-session';

function randomSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64Url(bytes);
}

async function fetchGatewayE2eeStatus(origin: string): Promise<{ gatewayPub: string; fingerprint: string }> {
  const res = await fetch(`${origin.replace(/\/+$/, '')}/api/e2ee/status`);
  if (!res.ok) {
    throw new Error(`E2EE status failed (${res.status})`);
  }
  const data = (await res.json()) as { gatewayPub?: string; fingerprint?: string };
  const gatewayPub = data.gatewayPub?.trim();
  const fingerprint = data.fingerprint?.trim();
  if (!gatewayPub || !fingerprint) {
    throw new Error('Gateway E2EE status missing public key');
  }
  return { gatewayPub, fingerprint };
}

export async function performE2eeHandshake(params: {
  origin: string;
  token: string;
  pairingSecret?: string;
  gatewayPub: string;
  fingerprint: string;
  gatewayId?: string | null;
  baseUrl: string;
}): Promise<StoredE2eeSession> {
  const device = await generateX25519KeyPair();
  const sessionId = randomSessionId();
  const pairingSecret = params.pairingSecret?.trim() || undefined;
  const res = await fetch(`${params.origin.replace(/\/+$/, '')}/api/e2ee/handshake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      sessionId,
      devicePub: bytesToBase64Url(device.publicKey),
      ...(pairingSecret ? { pairingSecret } : {}),
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error?.trim() || `E2EE handshake failed (${res.status})`);
  }

  const data = (await res.json()) as {
    ok?: boolean;
    serverConfirm?: string;
    expiresAt?: string;
    fingerprint?: string;
  };

  if (!data.ok || !data.serverConfirm || !data.expiresAt) {
    throw new Error('Gateway returned an invalid E2EE handshake response');
  }

  const rootKey = await deriveSessionRootKey({
    privateKey: device.privateKey,
    peerPublicKey: base64UrlToBytes(params.gatewayPub),
    sessionId,
    pairingSecret,
  });

  const expectedConfirm = await hmacSha256(rootKey, 'xopc-e2ee-server-confirm');
  if (expectedConfirm !== data.serverConfirm) {
    throw new Error('E2EE handshake confirmation failed');
  }

  const stored = createStoredE2eeSession({
    sessionId,
    rootKey,
    fingerprint: data.fingerprint?.trim() || params.fingerprint,
    expiresAt: data.expiresAt,
  });
  saveE2eeSession(params.gatewayId ?? null, params.baseUrl, stored);
  return stored;
}

/** Re-establish E2EE after gateway restart (Bearer token only; no pairing secret). */
export async function renewE2eeSession(params: {
  origin: string;
  token: string;
  gatewayId?: string | null;
  baseUrl: string;
}): Promise<StoredE2eeSession> {
  clearE2eeSession(params.gatewayId ?? null, params.baseUrl);
  const meta = await fetchGatewayE2eeStatus(params.origin);
  return performE2eeHandshake({
    origin: params.origin,
    token: params.token,
    gatewayPub: meta.gatewayPub,
    fingerprint: meta.fingerprint,
    gatewayId: params.gatewayId,
    baseUrl: params.baseUrl,
  });
}
