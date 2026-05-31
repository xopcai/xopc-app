/** Parsed fields from a QR payload (URL, JSON, or plain gateway URL). */
export type ParsedGatewayQr = {
  baseUrl?: string;
  lanUrl?: string;
  /** Legacy: permanent token embedded in QR (deprecated). */
  token?: string;
  /** One-time pairing secret from `ps` query param (Phase 3+). */
  pairingSecret?: string;
};

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function trimBase(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** Decode `baseUrl` query value (may be single- or double-encoded). */
function decodeLayeredURIComponent(enc: string): string {
  let s = enc.trim();
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s.trim();
}

function isMobileConnectPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/mobile-connect' || p.endsWith('/mobile-connect');
}

/**
 * Interpret QR / deep-link text for gateway onboarding.
 * Supports:
 * - `xopc://gateway/mobile-connect?baseUrl=…&lanUrl=…&ps=…` (preferred)
 * - legacy `…&token=…` deep links
 * - JSON `{"baseUrl","token"|"ps"}`, http(s) URLs with optional query params, plain URLs.
 */
export function parseGatewayQrPayload(raw: string): ParsedGatewayQr {
  const t = raw.trim();
  if (!t) return {};

  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const url =
        (typeof o.baseUrl === 'string' && o.baseUrl) ||
        (typeof o.url === 'string' && o.url) ||
        (typeof o.gatewayUrl === 'string' && o.gatewayUrl) ||
        '';
      const token =
        (typeof o.token === 'string' && o.token) ||
        (typeof o.bearerToken === 'string' && o.bearerToken) ||
        '';
      const pairingSecret =
        (typeof o.ps === 'string' && o.ps) ||
        (typeof o.pairingSecret === 'string' && o.pairingSecret) ||
        '';
      const out: ParsedGatewayQr = {};
      if (url.trim()) out.baseUrl = trimBase(url);
      if (token.trim()) out.token = token.trim();
      if (pairingSecret.trim()) out.pairingSecret = pairingSecret.trim();
      return out;
    } catch {
      return {};
    }
  }

  try {
    const u = new URL(t);
    const scheme = u.protocol.replace(/:$/, '').toLowerCase();
    if (
      (scheme === 'xopc' || scheme === 'xopc-mobile') &&
      u.hostname.toLowerCase() === 'gateway' &&
      isMobileConnectPath(u.pathname)
    ) {
      const encBase = u.searchParams.get('baseUrl') ?? '';
      const encLan = u.searchParams.get('lanUrl') ?? '';
      const pairingSecret = u.searchParams.get('ps') ?? u.searchParams.get('pairingSecret') ?? '';
      const token = u.searchParams.get('token') ?? u.searchParams.get('bearer') ?? '';
      const baseDecoded = decodeLayeredURIComponent(encBase);
      const lanDecoded = decodeLayeredURIComponent(encLan);
      const out: ParsedGatewayQr = {};
      if (baseDecoded && isHttpUrl(baseDecoded)) out.baseUrl = trimBase(baseDecoded);
      if (lanDecoded && isHttpUrl(lanDecoded)) out.lanUrl = trimBase(lanDecoded);
      if (pairingSecret.trim()) out.pairingSecret = pairingSecret.trim();
      else if (token) out.token = token.trim();
      if (out.baseUrl || out.lanUrl || out.token || out.pairingSecret) return out;
    }
  } catch {
    /* fall through */
  }

  try {
    const u = new URL(t);
    if (isHttpUrl(t)) {
      const pairingSecret = u.searchParams.get('ps') ?? u.searchParams.get('pairingSecret') ?? '';
      const token = u.searchParams.get('token') ?? u.searchParams.get('bearer') ?? '';
      u.search = '';
      u.hash = '';
      const baseUrl = trimBase(u.toString());
      const out: ParsedGatewayQr = { baseUrl };
      if (pairingSecret.trim()) out.pairingSecret = pairingSecret.trim();
      else if (token) out.token = token.trim();
      return out;
    }
  } catch {
    /* fall through */
  }

  if (isHttpUrl(t)) return { baseUrl: trimBase(t) };
  return {};
}

export function hasPairableGatewayQr(parsed: ParsedGatewayQr): boolean {
  if (parsed.pairingSecret?.trim() && parsed.baseUrl?.trim()) return true;
  return Boolean(parsed.baseUrl?.trim() || parsed.token?.trim() || parsed.lanUrl?.trim());
}
