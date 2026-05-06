/** Parsed fields from a QR payload (URL, JSON, or plain gateway URL). */
export type ParsedGatewayQr = {
  baseUrl?: string;
  token?: string;
  thinking?: string;
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
 * - `xopc://gateway/mobile-connect?baseUrl=<encoded>&token=…` (desktop console QR)
 * - JSON `{"baseUrl","token","thinking"}`, http(s) URLs with optional query params, plain URLs.
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
      const thinking = typeof o.thinking === 'string' ? o.thinking : '';
      const out: ParsedGatewayQr = {};
      if (url.trim()) out.baseUrl = trimBase(url);
      if (token.trim()) out.token = token.trim();
      if (thinking.trim()) out.thinking = thinking.trim();
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
      const token = u.searchParams.get('token') ?? u.searchParams.get('bearer') ?? '';
      const thinking = u.searchParams.get('thinking') ?? '';
      const baseDecoded = decodeLayeredURIComponent(encBase);
      const out: ParsedGatewayQr = {};
      if (baseDecoded && isHttpUrl(baseDecoded)) out.baseUrl = trimBase(baseDecoded);
      if (token) out.token = token.trim();
      if (thinking) out.thinking = thinking.trim();
      if (out.baseUrl || out.token) return out;
    }
  } catch {
    /* fall through */
  }

  try {
    const u = new URL(t);
    if (isHttpUrl(t)) {
      const token = u.searchParams.get('token') ?? u.searchParams.get('bearer') ?? '';
      const thinking = u.searchParams.get('thinking') ?? '';
      u.search = '';
      u.hash = '';
      const baseUrl = trimBase(u.toString());
      const out: ParsedGatewayQr = { baseUrl };
      if (token) out.token = token.trim();
      if (thinking) out.thinking = thinking.trim();
      return out;
    }
  } catch {
    /* fall through */
  }

  if (isHttpUrl(t)) return { baseUrl: trimBase(t) };
  return {};
}
