/**
 * Prefer LAN gateway when reachable; otherwise use tunnel (public) base URL.
 */
import { ensureGatewayUrlScheme } from '../stores/gateway-types';

export type ResolvePreferredBaseUrlOptions = {
  token?: string;
  timeoutMs?: number;
};

export type GatewayRouteProbeReason =
  | 'timeout'
  | 'network_error'
  | 'invalid_url'
  | 'http_error';

export type GatewayRouteProbeResult = {
  reachable: boolean;
  reason?: GatewayRouteProbeReason;
  httpStatus?: number;
  /** Raw fetch error message when available (for diagnostics). */
  errorMessage?: string;
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

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    const msg = error.message.toLowerCase();
    if (msg.includes('abort')) return true;
  }
  return false;
}

export async function probeGatewayRouteReachability(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<GatewayRouteProbeResult> {
  if (!baseUrl.trim()) {
    return { reachable: false, reason: 'invalid_url' };
  }

  let fetchUrl: string;
  try {
    fetchUrl = gatewayHealthUrl(baseUrl);
    // Validate URL shape early so we can surface invalid_url instead of a generic network error.
    void new URL(fetchUrl);
  } catch {
    return { reachable: false, reason: 'invalid_url' };
  }

  const timeoutMs = options?.timeoutMs ?? 5_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: buildHealthHeaders(options?.token),
    });
    clearTimeout(timeout);
    void res.body?.cancel?.();
    return { reachable: true };
  } catch (error) {
    if (isAbortError(error)) {
      return { reachable: false, reason: 'timeout' };
    }
    const errorMessage = error instanceof Error ? error.message.trim() : String(error).trim();
    return {
      reachable: false,
      reason: 'network_error',
      errorMessage: errorMessage || undefined,
    };
  }
}

/** True when the gateway responds on /health with 2xx (used for route selection). */
export async function probeGatewayHealth(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<boolean> {
  if (!baseUrl.trim()) return false;

  let fetchUrl: string;
  try {
    fetchUrl = gatewayHealthUrl(baseUrl);
    void new URL(fetchUrl);
  } catch {
    return false;
  }

  const timeoutMs = options?.timeoutMs ?? 5_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: buildHealthHeaders(options?.token),
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** @deprecated Use probeGatewayRouteReachability for status + failure reason. */
export async function probeGatewayRouteReachable(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<boolean> {
  return (await probeGatewayRouteReachability(baseUrl, options)).reachable;
}

export async function resolvePreferredBaseUrl(
  tunnelUrl: string,
  lanUrl: string | undefined,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<string> {
  const tunnel = tunnelUrl.trim()
    ? ensureGatewayUrlScheme(tunnelUrl.trim().replace(/\/+$/, ''))
    : '';
  const lan = lanUrl?.trim()
    ? ensureGatewayUrlScheme(lanUrl.trim().replace(/\/+$/, ''))
    : '';

  if (!tunnel && !lan) return '';
  if (!tunnel) return lan;

  if (!lan) return tunnel;

  const lanReachable = await probeGatewayHealth(lanUrl!, options);
  if (lanReachable) return lan;
  return tunnel;
}
