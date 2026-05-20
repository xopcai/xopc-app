/**
 * Prefer LAN gateway when reachable; otherwise use tunnel (public) base URL.
 */
export async function resolvePreferredBaseUrl(
  tunnelUrl: string,
  lanUrl: string | undefined,
): Promise<string> {
  if (!lanUrl?.trim()) return tunnelUrl;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${lanUrl.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return lanUrl.replace(/\/+$/, '');
  } catch {
    /* LAN unreachable — use tunnel */
  }
  return tunnelUrl.replace(/\/+$/, '');
}
