import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePreferredBaseUrl } from '../connection-strategy';

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
