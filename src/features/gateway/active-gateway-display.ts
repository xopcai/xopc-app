import { gatewayProfileNameFromUrl, type GatewayProfile } from '../../stores/gateway-types';

export type ActiveGatewayDisplay = {
  name: string;
  configured: boolean;
  profileId: string | null;
};

export function resolveActiveGatewayDisplay(
  profile: GatewayProfile | null,
  baseUrl: string,
): ActiveGatewayDisplay {
  const configured = Boolean(baseUrl.trim());
  const name =
    profile?.name?.trim() ||
    (profile?.baseUrl ? gatewayProfileNameFromUrl(profile.baseUrl) : '');
  return { name, configured, profileId: profile?.id ?? null };
}
