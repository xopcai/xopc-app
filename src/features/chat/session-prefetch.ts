/**
 * In-process cache for pre-resolved new-chat session promises.
 *
 * Enables instant navigation: home prefetches `createSession` while the user
 * is still on the workspace screen; chat bootstrap consumes the in-flight result.
 */
import { useGatewayStore } from '../../stores/gateway-store';
import { createSession } from '../../query/sessions';

const TTL_MS = 5 * 60_000;

export type SessionPrefetchOptions = {
  forceNew?: boolean;
};

type Entry = {
  promise: Promise<string>;
  expiresAt: number;
};

const cache = new Map<string, Entry>();

function keyOf(agentId: string | undefined, forceNew: boolean): string {
  return `${agentId?.trim().toLowerCase() || '__default__'}:${forceNew ? 'new' : 'reuse'}`;
}

function dropExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

async function resolveSessionKey(agentId: string | undefined, forceNew: boolean): Promise<string> {
  await useGatewayStore.getState().refreshActiveBaseUrl();
  return createSession(agentId, forceNew ? { forceNew: true } : undefined);
}

/** Fire session creation in the background. Idempotent for the same agent + mode. */
export function prefetchNewChatSession(
  agentId?: string,
  options?: SessionPrefetchOptions,
): void {
  const forceNew = options?.forceNew ?? true;
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId, forceNew);
  if (cache.has(cacheKey)) return;
  const promise = resolveSessionKey(agentId, forceNew);
  promise.catch(() => {});
  cache.set(cacheKey, { promise, expiresAt: now + TTL_MS });
}

/** Return the prefetched promise, removing it from cache. Null on miss. */
export function consumePrefetchedSession(
  agentId?: string,
  options?: SessionPrefetchOptions,
): Promise<string> | null {
  const forceNew = options?.forceNew ?? true;
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId, forceNew);
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  cache.delete(cacheKey);
  return entry.promise;
}

/** Test-only: wipe cache between cases. */
export function resetSessionPrefetchCacheForTests(): void {
  cache.clear();
}
