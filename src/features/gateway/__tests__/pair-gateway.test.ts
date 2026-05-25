import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildPairExchangeOrigins,
  pairWithGateway,
  resolvePairExchangeOrigins,
} from '../pair-gateway';

describe('buildPairExchangeOrigins', () => {
  it('prefers LAN before tunnel URL', () => {
    expect(
      buildPairExchangeOrigins('https://abc.frp.xopc.ai', 'http://192.168.1.2:18790'),
    ).toEqual(['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops loopback entries outside dev builds', () => {
    expect(buildPairExchangeOrigins('http://127.0.0.1:28790', 'http://192.168.1.2:18790')).toEqual([
      'http://192.168.1.2:18790',
    ]);
  });

  it('keeps loopback entries in dev builds', () => {
    vi.stubGlobal('__DEV__', true);

    expect(buildPairExchangeOrigins('http://127.0.0.1:28790')).toEqual([
      'http://127.0.0.1:28790',
    ]);
  });
});

describe('resolvePairExchangeOrigins', () => {
  it('uses server connectUrls when provided', () => {
    expect(
      resolvePairExchangeOrigins(
        { baseUrl: 'https://abc.frp.xopc.ai', pairingSecret: 'ps' },
        ['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai'],
      ),
    ).toEqual(['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai']);
  });
});

describe('pairWithGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects loopback base URL before exchange outside dev builds', async () => {
    await expect(
      pairWithGateway({
        baseUrl: 'http://127.0.0.1:28790',
        pairingSecret: 'ps123',
      }),
    ).rejects.toThrow(/localhost|127\.0\.0\.1/i);
  });

  it('exchanges against loopback base URL in dev builds', async () => {
    vi.stubGlobal('__DEV__', true);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:28790/api/tunnel/exchange-token');
      return new Response(JSON.stringify({ token: 'dev-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pairWithGateway({
      baseUrl: 'http://127.0.0.1:28790',
      pairingSecret: 'ps123',
    });

    expect(result.token).toBe('dev-token');
    expect(result.baseUrl).toBe('http://127.0.0.1:28790');
  });

  it('exchanges pairing secret for gateway token (LAN first)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://192.168.1.2:18790/api/tunnel/exchange-token');
      return new Response(
        JSON.stringify({
          token: 'gateway-token',
          baseUrl: 'https://abc.frp.xopc.ai',
          lanUrl: 'http://192.168.1.2:18790',
          connectUrls: ['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pairWithGateway({
      baseUrl: 'https://abc.frp.xopc.ai',
      lanUrl: 'http://192.168.1.2:18790',
      pairingSecret: 'ps123',
    });

    expect(result.token).toBe('gateway-token');
    expect(result.baseUrl).toBe('https://abc.frp.xopc.ai');
    expect(result.lanUrl).toBe('http://192.168.1.2:18790');
    expect(result.connectUrls).toEqual(['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai']);
  });

  it('falls back to tunnel URL when LAN exchange fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('http://192.168.')) {
        return new Response(JSON.stringify({ error: 'network' }), { status: 503 });
      }
      return new Response(
        JSON.stringify({
          token: 'tok',
          baseUrl: 'https://abc.frp.xopc.ai',
          connectUrls: ['https://abc.frp.xopc.ai'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pairWithGateway({
      baseUrl: 'https://abc.frp.xopc.ai',
      lanUrl: 'http://192.168.1.2:18790',
      pairingSecret: 'ps123',
    });

    expect(result.token).toBe('tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
