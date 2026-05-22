/**
 * Prefer LAN gateway when reachable; otherwise use tunnel (public) base URL.
 */
export type ResolvePreferredBaseUrlOptions = {
  token?: string;
  timeoutMs?: number;
};

export async function probeGatewayHealth(
  baseUrl: string,
  options?: ResolvePreferredBaseUrlOptions,
): Promise<boolean> {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) return false;

  const timeoutMs = options?.timeoutMs ?? 5_000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {};
    const token = options?.token?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${normalized}/health`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);
    return res.ok;
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
  if (lanReachable) return lanUrl.replace(/\/+$/, '');
  return normalizedTunnel;
}
