import { describe, expect, it, vi, afterEach } from 'vitest';

import { formatReachabilityReason, probeGatewayRoutes } from '../check-gateway-routes';

vi.mock('../../../api/connection-strategy', () => ({
  probeGatewayRouteReachability: vi.fn(),
}));

vi.mock('../../../stores/gateway-store', () => ({
  useGatewayStore: {
    getState: vi.fn(() => ({
      activeBaseUrl: '',
      baseUrl: '',
      lanUrl: null,
      refreshActiveBaseUrl: vi.fn(async () => ''),
      token: '',
    })),
  },
}));

vi.mock('../gateway-connection-sync', () => ({
  syncGatewayAfterConnectivityChange: vi.fn(),
}));

import { probeGatewayRouteReachability } from '../../../api/connection-strategy';

const labels = {
  timeout: 'timeout-msg',
  networkError: 'network-msg',
  networkErrorWithDetail: 'network-detail: {{detail}}',
  invalidUrl: 'invalid-url-msg',
  httpError: 'http {{status}}',
};

describe('probeGatewayRoutes', () => {
  afterEach(() => {
    vi.mocked(probeGatewayRouteReachability).mockReset();
  });

  it('marks LAN reachable and tunnel unreachable independently', async () => {
    vi.mocked(probeGatewayRouteReachability).mockImplementation(async (url: string) =>
      url.includes('192.168')
        ? { reachable: true }
        : { reachable: false, reason: 'network_error', errorMessage: 'Network request failed' },
    );

    await expect(
      probeGatewayRoutes({
        tunnelUrl: 'https://abc.frp.xopc.ai',
        lanUrl: 'http://192.168.1.44:18790',
        token: 'tok',
      }),
    ).resolves.toEqual({
      lan: { status: 'reachable' },
      tunnel: {
        status: 'unreachable',
        reason: 'network_error',
        detail: 'Network request failed',
      },
    });
  });

  it('returns not_configured for LAN when lanUrl is missing', async () => {
    vi.mocked(probeGatewayRouteReachability).mockResolvedValue({ reachable: true });

    await expect(
      probeGatewayRoutes({
        tunnelUrl: 'https://abc.frp.xopc.ai',
        lanUrl: null,
        token: 'tok',
      }),
    ).resolves.toEqual({
      lan: { status: 'not_configured' },
      tunnel: { status: 'reachable' },
    });
  });
});

describe('formatReachabilityReason', () => {
  it('formats network error detail', () => {
    expect(
      formatReachabilityReason(
        { status: 'unreachable', reason: 'network_error', detail: 'Network request failed' },
        labels,
      ),
    ).toBe('network-detail: Network request failed');
  });

  it('returns empty string for reachable routes', () => {
    expect(formatReachabilityReason({ status: 'reachable' }, labels)).toBe('');
  });
});
