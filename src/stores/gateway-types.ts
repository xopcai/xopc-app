export type GatewayProfile = {
  id: string;
  name: string;
  baseUrl: string;
  lanUrl: string | null;
  token: string;
  updatedAt: number;
};

export type GatewayProfileInput = {
  name?: string;
  baseUrl: string;
  lanUrl?: string | null;
  token?: string;
};

export function normalizeGatewayBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function gatewayProfileNameFromUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function createGatewayProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildGatewayProfile(input: GatewayProfileInput, id?: string): GatewayProfile {
  const baseUrl = normalizeGatewayBaseUrl(input.baseUrl);
  return {
    id: id ?? createGatewayProfileId(),
    name: input.name?.trim() || gatewayProfileNameFromUrl(baseUrl),
    baseUrl,
    lanUrl: input.lanUrl?.trim() ? normalizeGatewayBaseUrl(input.lanUrl) : null,
    token: (input.token ?? '').trim(),
    updatedAt: Date.now(),
  };
}
