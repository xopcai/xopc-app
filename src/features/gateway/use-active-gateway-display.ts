import { useGatewayStore } from '../../stores/gateway-store';

import { resolveActiveGatewayDisplay, type ActiveGatewayDisplay } from './active-gateway-display';

export type { ActiveGatewayDisplay };
export { resolveActiveGatewayDisplay } from './active-gateway-display';

export function useActiveGatewayDisplay(): ActiveGatewayDisplay {
  const profile = useGatewayStore((s) => s.getActiveProfile());
  const baseUrl = useGatewayStore((s) => s.baseUrl);
  return resolveActiveGatewayDisplay(profile, baseUrl);
}
