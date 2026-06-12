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
  prefetchNewChatSession,
  resetSessionPrefetchCacheForTests,
  takeOptimisticSessionKey,
  ensureOptimisticSessionRegistered,
} from '../session-prefetch';

const mockedCreate = vi.mocked(createSession);

async function flushRegistration(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  resetSessionPrefetchCacheForTests();
  mockedCreate.mockReset();
  mockedCreate.mockImplementation(async (agentId, options) => {
    const id = (agentId ?? 'main').trim().toLowerCase() || 'main';
    const chatId = options?.chatId ?? 'chat_fallback';
    return `agent:${id}:webchat:default:direct:${chatId}`;
  });
});

afterEach(() => {
  resetSessionPrefetchCacheForTests();
});

describe('optimistic session prefetch', () => {
  it('takeOptimisticSessionKey returns immediately without awaiting POST', async () => {
    const key = takeOptimisticSessionKey('main');
    expect(key).toMatch(/^agent:main:webchat:default:direct:chat_\d+_[a-z0-9]+$/);
    await flushRegistration();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it('prefetch then take reuses the same prefetched key', async () => {
    prefetchNewChatSession('main', { forceNew: true });
    await flushRegistration();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const key1 = takeOptimisticSessionKey('main');
    const key2 = takeOptimisticSessionKey('main');
    expect(key2).not.toBe(key1);
    await flushRegistration();
    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });

  it('ensureOptimisticSessionRegistered resolves after background POST', async () => {
    const key = takeOptimisticSessionKey('main');
    await expect(ensureOptimisticSessionRegistered(key)).resolves.toBe(key);
  });

  it('different agents cache independently', async () => {
    prefetchNewChatSession('main', { forceNew: true });
    prefetchNewChatSession('other', { forceNew: true });
    await flushRegistration();
    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });
});
