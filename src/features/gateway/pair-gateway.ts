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
};

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** Prefer LAN for exchange when listed (same order as connection-strategy). */
export function buildPairExchangeOrigins(baseUrl: string, lanUrl?: string | null): string[] {
  const tunnel = normalizeOrigin(baseUrl);
  const lan = lanUrl?.trim() ? normalizeOrigin(lanUrl) : '';
  const out: string[] = [];
  if (lan) out.push(lan);
  if (tunnel && tunnel !== lan) out.push(tunnel);
  return out;
}

export async function pairWithGateway(input: PairGatewayInput): Promise<PairGatewayResult> {
  const pairingSecret = input.pairingSecret.trim();
  if (!pairingSecret) throw new Error('Pairing secret is required');

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
      };

      const token = data.token?.trim();
      if (!token) {
        lastError = 'Gateway did not return a token';
        continue;
      }

      const resolvedBase = data.baseUrl?.trim()
        ? normalizeOrigin(data.baseUrl)
        : normalizeOrigin(input.baseUrl);
      const resolvedLan = data.lanUrl?.trim()
        ? normalizeOrigin(data.lanUrl)
        : input.lanUrl?.trim()
          ? normalizeOrigin(input.lanUrl)
          : null;

      return { token, baseUrl: resolvedBase, lanUrl: resolvedLan };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError);
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
    return pairWithGateway({
      baseUrl: parsed.baseUrl,
      lanUrl: parsed.lanUrl,
      pairingSecret: parsed.pairingSecret,
    });
  }

  if (!parsed.baseUrl?.trim() && !parsed.token?.trim()) return null;

  return {
    baseUrl: parsed.baseUrl?.trim() ? normalizeOrigin(parsed.baseUrl) : '',
    lanUrl: parsed.lanUrl?.trim() ? normalizeOrigin(parsed.lanUrl) : null,
    token: parsed.token?.trim() ?? '',
  };
}
