import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  notifyUnauthorizedIfNeeded: vi.fn(),
  formatApiHttpError: vi.fn(),
}));

vi.mock('../../../stores/gateway-store', () => ({
  useGatewayStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({
      refreshActiveBaseUrl: vi.fn().mockResolvedValue(undefined),
    })),
  }),
}));

vi.mock('../../../query/sessions', () => ({
  createSession: vi.fn(),
}));

import { createSession } from '../../../query/sessions';
import {
  consumePrefetchedSession,
  prefetchNewChatSession,
  resetSessionPrefetchCacheForTests,
} from '../session-prefetch';

const mockedCreate = vi.mocked(createSession);

beforeEach(() => {
  resetSessionPrefetchCacheForTests();
  mockedCreate.mockReset();
  mockedCreate.mockResolvedValue('agent:webchat:main:direct:chat_test');
});

afterEach(() => {
  resetSessionPrefetchCacheForTests();
});

describe('prefetchNewChatSession / consumePrefetchedSession', () => {
  it('returns null when nothing was prefetched', () => {
    expect(consumePrefetchedSession('main', { forceNew: true })).toBeNull();
  });

  it('returns the prefetched promise on consume', async () => {
    prefetchNewChatSession('main', { forceNew: true });
    const p = consumePrefetchedSession('main', { forceNew: true });
    expect(p).not.toBeNull();
    await expect(p).resolves.toBe('agent:webchat:main:direct:chat_test');
  });

  it('fires createSession exactly once on prefetch (idempotent)', async () => {
    prefetchNewChatSession('main', { forceNew: true });
    prefetchNewChatSession('main', { forceNew: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it('different agent keys cache independently', async () => {
    prefetchNewChatSession('main', { forceNew: true });
    prefetchNewChatSession('other', { forceNew: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(consumePrefetchedSession('main', { forceNew: true })).not.toBeNull();
    expect(consumePrefetchedSession('other', { forceNew: true })).not.toBeNull();
  });

  it('consume removes the entry — a second consume returns null', () => {
    prefetchNewChatSession('main', { forceNew: true });
    expect(consumePrefetchedSession('main', { forceNew: true })).not.toBeNull();
    expect(consumePrefetchedSession('main', { forceNew: true })).toBeNull();
  });

  it('swallows rejection of an unattached prefetch (no unhandled rejection)', async () => {
    mockedCreate.mockRejectedValue(new Error('server down'));
    prefetchNewChatSession('main', { forceNew: true });
    await Promise.resolve();
    await Promise.resolve();
    const p = consumePrefetchedSession('main', { forceNew: true });
    if (p) await expect(p).rejects.toThrow('server down');
  });
});
