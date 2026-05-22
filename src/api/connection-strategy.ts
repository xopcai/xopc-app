/**
 * Prefer LAN gateway when reachable; otherwise use tunnel (public) base URL.
 */
import { ensureGatewayUrlScheme } from '../stores/gateway-types';

export type ResolvePreferredBaseUrlOptions = {
  token?: string;
  timeoutMs?: number;
};

function gatewayHealthUrl(baseUrl: string): string {
  return `${ensureGatewayUrlScheme(baseUrl)}/health`;
}

function buildHealthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const trimmed = token?.trim();
  if (trimmed) headers.Authorization = `Bearer ${trimmed}`;
  return headers;
}

/** True when the gateway responds on /health with 2xx (used for route selection). */
export async function probeGatewayHealth(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<boolean> {
  if (!baseUrl.trim()) return false;

  const timeoutMs = options?.timeoutMs ?? 5_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(gatewayHealthUrl(baseUrl), {
      signal: controller.signal,
      headers: buildHealthHeaders(options?.token),
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * True when any HTTP response is received (network reachable).
 * Unlike probeGatewayHealth, auth failures (401) still count as reachable.
 */
export async function probeGatewayRouteReachable(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<boolean> {
  if (!baseUrl.trim()) return false;

  const timeoutMs = options?.timeoutMs ?? 5_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(gatewayHealthUrl(baseUrl), {
      signal: controller.signal,
      headers: buildHealthHeaders(options?.token),
    });
    clearTimeout(timeout);
    void res.body?.cancel?.();
    return true;
  } catch {
    return false;
  }
}

export async function resolvePreferredBaseUrl(
  tunnelUrl: string,
  lanUrl: string | undefined,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<string> {
  const normalizedTunnel = tunnelUrl.replace(/\/+$/, '');
  if (!lanUrl?.trim()) return normalizedTunnel;

  const lanReachable = await probeGatewayHealth(lanUrl, options);
  if (lanReachable) return ensureGatewayUrlScheme(lanUrl).replace(/\/+$/, '');
  return normalizedTunnel;
}
