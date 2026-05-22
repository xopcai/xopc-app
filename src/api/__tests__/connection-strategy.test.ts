import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  probeGatewayHealth,
  probeGatewayRouteReachability,
  probeGatewayRouteReachable,
  resolvePreferredBaseUrl,
} from '../connection-strategy';

describe('probeGatewayRouteReachability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns reachable when server responds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, body: { cancel: () => {} } })));

    await expect(probeGatewayRouteReachability('192.168.1.44:18790')).resolves.toEqual({
      reachable: true,
    });
  });

  it('returns timeout reason on abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }));

    await expect(probeGatewayRouteReachability('http://192.168.1.44:18790')).resolves.toEqual({
      reachable: false,
      reason: 'timeout',
    });
  });

  it('returns network_error with message when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network request failed');
    }));

    await expect(probeGatewayRouteReachability('http://192.168.1.44:18790')).resolves.toEqual({
      reachable: false,
      reason: 'network_error',
      errorMessage: 'Network request failed',
    });
  });

  it('adds http scheme for private LAN host without scheme', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, body: { cancel: () => {} } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      probeGatewayRouteReachability('192.168.1.44:18790', { token: 'secret' }),
    ).resolves.toEqual({ reachable: true });
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.44:18790/health', {
      signal: expect.any(AbortSignal),
      headers: { Authorization: 'Bearer secret' },
    });
  });
});

describe('probeGatewayHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when health responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    await expect(probeGatewayHealth('http://192.168.1.44:18790', { token: 'secret' })).resolves.toBe(
      true,
    );
  });

  it('returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network');
    }));

    await expect(probeGatewayHealth('http://192.168.1.44:18790')).resolves.toBe(false);
  });
});

describe('probeGatewayRouteReachable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns boolean reachable flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: { cancel: () => {} } })));

    await expect(probeGatewayRouteReachable('192.168.1.44:18790')).resolves.toBe(true);
  });
});

describe('resolvePreferredBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns tunnel URL when lanUrl is missing', async () => {
    await expect(resolvePreferredBaseUrl('https://gw.frp.example.com/', undefined)).resolves.toBe(
      'https://gw.frp.example.com',
    );
  });

  it('prefers LAN when health check succeeds', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolvePreferredBaseUrl('https://gw.frp.example.com', 'http://192.168.1.44:18790', {
        token: 'secret',
      }),
    ).resolves.toBe('http://192.168.1.44:18790');

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.44:18790/health', {
      signal: expect.any(AbortSignal),
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('falls back to tunnel when LAN health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    await expect(
      resolvePreferredBaseUrl('https://gw.frp.example.com', 'http://192.168.1.44:18790'),
    ).resolves.toBe('https://gw.frp.example.com');
  });
});
