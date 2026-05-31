/** True when the gateway URL uses broker tunnel HTTPS (requires app-layer E2EE). */
export function requiresE2eeTransport(baseUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(baseUrl);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.frp.xopc.ai') || hostname === 'frp.xopc.ai';
  } catch {
    return false;
  }
}
