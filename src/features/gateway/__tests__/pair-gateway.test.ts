import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPairExchangeOrigins, pairWithGateway } from '../pair-gateway';

describe('buildPairExchangeOrigins', () => {
  it('prefers LAN before tunnel URL', () => {
    expect(
      buildPairExchangeOrigins('https://abc.frp.xopc.ai', 'http://192.168.1.2:18790'),
    ).toEqual(['http://192.168.1.2:18790', 'https://abc.frp.xopc.ai']);
  });
});

describe('pairWithGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges pairing secret for gateway token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://abc.frp.xopc.ai/api/tunnel/exchange-token');
      return new Response(
        JSON.stringify({
          token: 'gateway-token',
          baseUrl: 'https://abc.frp.xopc.ai',
          lanUrl: 'http://192.168.1.2:18790',
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
  });

  it('falls back to tunnel URL when LAN exchange fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('http://192.168.')) {
        return new Response(JSON.stringify({ error: 'network' }), { status: 503 });
      }
      return new Response(JSON.stringify({ token: 'tok', baseUrl: 'https://abc.frp.xopc.ai' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
