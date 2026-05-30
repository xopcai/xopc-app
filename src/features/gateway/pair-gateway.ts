import { shouldRejectLoopbackGatewayBaseUrl } from '../../stores/gateway-types';
import type { ParsedGatewayQr } from './parse-gateway-qr';

export type PairGatewayInput = {
  baseUrl: string;
  lanUrl?: string | null;
  pairingSecret: string;
};

export type PairGatewayResult = {
  token: string;
  baseUrl: string;
  lanUrl: string | null;
  connectUrls?: string[];
};

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function hostnameIsFrpTunnel(origin: string): boolean {
  try {
    return /\.frp\.xopc\.ai$/i.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Origins to try for POST /api/tunnel/exchange-token.
 * Prefer the tunnel/HTTPS URL first so pairing works when the phone is not on LAN
 * (the secret is always issued by the gateway behind the FRP tunnel).
 */
export function buildPairExchangeOrigins(baseUrl: string, lanUrl?: string | null): string[] {
  const tunnel = normalizeOrigin(baseUrl);
  const lan = lanUrl?.trim() ? normalizeOrigin(lanUrl) : '';
  const out: string[] = [];
  const tunnelIsFrp = hostnameIsFrpTunnel(tunnel);

  if (tunnel && !shouldRejectLoopbackGatewayBaseUrl(tunnel)) {
    if (tunnelIsFrp || !lan) out.push(tunnel);
  }
  if (lan && !shouldRejectLoopbackGatewayBaseUrl(lan) && lan !== tunnel) out.push(lan);
  if (tunnel && !shouldRejectLoopbackGatewayBaseUrl(tunnel) && !out.includes(tunnel)) {
    out.push(tunnel);
  }
  return out;
}

export function resolvePairExchangeOrigins(
  input: PairGatewayInput,
  connectUrls?: string[] | null,
): string[] {
  const fromServer = (connectUrls ?? [])
    .map((url) => normalizeOrigin(url))
    .filter((url) => url && !shouldRejectLoopbackGatewayBaseUrl(url));
  if (fromServer.length > 0) {
    return [...new Set(fromServer)];
  }
  return buildPairExchangeOrigins(input.baseUrl, input.lanUrl);
}

function resolveStoredUrlsFromExchange(
  data: { baseUrl?: string | null; lanUrl?: string | null; connectUrls?: string[] | null },
  input: PairGatewayInput,
): { baseUrl: string; lanUrl: string | null; connectUrls: string[] } {
  const connectUrls = resolvePairExchangeOrigins(input, data.connectUrls);
  const resolvedBase = data.baseUrl?.trim()
    ? normalizeOrigin(data.baseUrl)
    : connectUrls.find((url) => url.startsWith('https://')) ??
      connectUrls[connectUrls.length - 1] ??
      normalizeOrigin(input.baseUrl);
  const resolvedLan =
    (data.lanUrl?.trim() ? normalizeOrigin(data.lanUrl) : null) ??
    connectUrls.find((url) => url.startsWith('http://')) ??
    (input.lanUrl?.trim() ? normalizeOrigin(input.lanUrl) : null);

  return {
    baseUrl: resolvedBase,
    lanUrl: resolvedLan,
    connectUrls,
  };
}

let inflightPair: { key: string; promise: Promise<PairGatewayResult> } | null = null;

async function pairWithGatewayOnce(input: PairGatewayInput): Promise<PairGatewayResult> {
  const pairingSecret = input.pairingSecret.trim();
  if (!pairingSecret) throw new Error('Pairing secret is required');

  if (shouldRejectLoopbackGatewayBaseUrl(input.baseUrl)) {
    throw new Error(
      '127.0.0.1 and localhost only work on the gateway computer. Scan the QR from the desktop console or enter a LAN IP.',
    );
  }

  const candidates = buildPairExchangeOrigins(input.baseUrl, input.lanUrl);
  if (candidates.length === 0) throw new Error('Gateway base URL is required for pairing');

  let lastError = 'Pairing failed';

  for (const origin of candidates) {
    try {
      const res = await fetch(`${origin}/api/tunnel/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingSecret }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        lastError = body.error?.trim() || `Pairing failed (${res.status})`;
        continue;
      }

      const data = (await res.json()) as {
        token?: string;
        baseUrl?: string | null;
        lanUrl?: string | null;
        connectUrls?: string[] | null;
      };

      const token = data.token?.trim();
      if (!token) {
        lastError = 'Gateway did not return a token';
        continue;
      }

      const resolved = resolveStoredUrlsFromExchange(data, input);

      return {
        token,
        baseUrl: resolved.baseUrl,
        lanUrl: resolved.lanUrl,
        connectUrls: resolved.connectUrls,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError);
}

/** Deduplicate parallel pairing attempts for the same QR scan. */
export async function pairWithGateway(input: PairGatewayInput): Promise<PairGatewayResult> {
  const key = input.pairingSecret.trim();
  if (!key) throw new Error('Pairing secret is required');
  if (inflightPair?.key === key) return inflightPair.promise;
  const promise = pairWithGatewayOnce(input);
  inflightPair = { key, promise };
  try {
    return await promise;
  } finally {
    if (inflightPair?.key === key) inflightPair = null;
  }
}

export type ResolvedGatewayCredentials = {
  baseUrl: string;
  lanUrl: string | null;
  token: string;
};

/**
 * Resolve store-ready credentials from parsed QR — exchanges `ps` when present.
 */
export async function resolveGatewayCredentialsFromQr(
  parsed: ParsedGatewayQr,
): Promise<ResolvedGatewayCredentials | null> {
  if (parsed.pairingSecret?.trim() && parsed.baseUrl?.trim()) {
    if (shouldRejectLoopbackGatewayBaseUrl(parsed.baseUrl)) {
      throw new Error(
        'This QR points at localhost, which your phone cannot reach. Enable LAN pairing or remote access on the desktop gateway and scan again.',
      );
    }
    return pairWithGateway({
      baseUrl: parsed.baseUrl,
      lanUrl: parsed.lanUrl,
      pairingSecret: parsed.pairingSecret,
    });
  }

  return null;
}
