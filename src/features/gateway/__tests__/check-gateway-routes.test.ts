import { describe, expect, it, vi, afterEach } from 'vitest';

import { probeGatewayRoutes } from '../check-gateway-routes';

vi.mock('../../../api/connection-strategy', () => ({
  probeGatewayHealth: vi.fn(),
}));

import { probeGatewayHealth } from '../../../api/connection-strategy';

describe('probeGatewayRoutes', () => {
  afterEach(() => {
    vi.mocked(probeGatewayHealth).mockReset();
  });

  it('marks LAN reachable and tunnel unreachable independently', async () => {
    vi.mocked(probeGatewayHealth).mockImplementation(async (url: string) =>
      url.includes('192.168'),
    );

    await expect(
      probeGatewayRoutes({
        tunnelUrl: 'https://abc.frp.xopc.ai',
        lanUrl: 'http://192.168.1.44:18790',
        token: 'tok',
      }),
    ).resolves.toEqual({
      lan: 'reachable',
      tunnel: 'unreachable',
    });
  });

  it('returns not_configured for LAN when lanUrl is missing', async () => {
    vi.mocked(probeGatewayHealth).mockResolvedValue(true);

    await expect(
      probeGatewayRoutes({
        tunnelUrl: 'https://abc.frp.xopc.ai',
        lanUrl: null,
        token: 'tok',
      }),
    ).resolves.toEqual({
      lan: 'not_configured',
      tunnel: 'reachable',
    });
  });
});
