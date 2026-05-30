import { afterEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();

vi.mock('../../storage/mmkv', () => ({
  KEYS: { e2eeSessionPrefix: 'gateway.e2ee.' },
  storage: {
    getString: (key: string) => mem.get(key),
    set: (key: string, value: string) => {
      mem.set(key, value);
    },
    delete: (key: string) => {
      mem.delete(key);
    },
  },
}));

import { createStoredE2eeSession, readStoredE2eeSession, saveE2eeSession } from '../e2ee-session';

describe('e2ee-session storage', () => {
  afterEach(() => {
    mem.clear();
  });

  it('finds session saved by URL after gateway profile is created', () => {
    const baseUrl = 'https://abc.frp.xopc.ai';
    const session = createStoredE2eeSession({
      sessionId: 'sess',
      rootKey: new Uint8Array(32).fill(7),
      fingerprint: 'fp',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    saveE2eeSession(null, baseUrl, session);

    const loaded = readStoredE2eeSession('profile-1', baseUrl);
    expect(loaded?.sessionId).toBe('sess');
    expect(mem.get('gateway.e2ee.profile-1')).toBeTruthy();
    expect(mem.get('gateway.e2ee.url.https://abc.frp.xopc.ai')).toBeUndefined();
  });
});
