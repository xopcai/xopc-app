/**
 * Optimistic new-chat session keys.
 *
 * Generates the canonical session key locally (instant UI), then registers
 * with `POST /api/sessions` in the background via `chat_id`.
 */
import { buildWebchatSessionKey, generateNewChatId, normalizeAgentId } from '../../lib/session-key';
import { useGatewayStore } from '../../stores/gateway-store';
import { createSession } from '../../query/sessions';

const TTL_MS = 5 * 60_000;

export type SessionPrefetchOptions = {
  forceNew?: boolean;
};

type OptimisticEntry = {
  sessionKey: string;
  chatId: string;
  expiresAt: number;
};

const cache = new Map<string, OptimisticEntry>();
const registerPromises = new Map<string, Promise<string>>();
const optimisticKeys = new Set<string>();

function keyOf(agentId: string | undefined): string {
  return normalizeAgentId(agentId);
}

function dropExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

function markOptimistic(sessionKey: string): void {
  optimisticKeys.add(sessionKey);
}

export function isOptimisticSessionKey(sessionKey: string): boolean {
  return optimisticKeys.has(sessionKey);
}

function confirmOptimistic(sessionKey: string): void {
  optimisticKeys.delete(sessionKey);
}

function startRegistration(agentId: string, chatId: string, sessionKey: string): Promise<string> {
  markOptimistic(sessionKey);
  const existing = registerPromises.get(sessionKey);
  if (existing) return existing;

  const promise = (async () => {
    await useGatewayStore.getState().refreshActiveBaseUrl();
    const key = await createSession(agentId, { chatId });
    confirmOptimistic(sessionKey);
    return key;
  })();
  promise.catch(() => {});
  registerPromises.set(sessionKey, promise);
  return promise;
}

function createOptimisticEntry(agentId: string | undefined): OptimisticEntry {
  const id = keyOf(agentId);
  const chatId = generateNewChatId();
  const sessionKey = buildWebchatSessionKey(id, chatId);
  startRegistration(id, chatId, sessionKey);
  return {
    sessionKey,
    chatId,
    expiresAt: Date.now() + TTL_MS,
  };
}

function takeCachedEntry(agentId: string | undefined): OptimisticEntry {
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId);
  const entry = cache.get(cacheKey) ?? createOptimisticEntry(agentId);
  cache.delete(cacheKey);
  return entry;
}

/** Pre-register a new chat session while the user is still on the home screen. */
export function prefetchNewChatSession(agentId?: string, _options?: SessionPrefetchOptions): void {
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId);
  if (cache.has(cacheKey)) return;
  cache.set(cacheKey, createOptimisticEntry(agentId));
}

/**
 * Return an optimistic session key synchronously — no network wait.
 * Background registration starts immediately if not already prefetched.
 */
export function takeOptimisticSessionKey(agentId?: string): string {
  return takeCachedEntry(agentId).sessionKey;
}

export function getOptimisticRegisterPromise(sessionKey: string): Promise<string> | undefined {
  return registerPromises.get(sessionKey);
}

/** Await background registration (e.g. before first message send). */
export async function ensureOptimisticSessionRegistered(sessionKey: string): Promise<string> {
  const pending = registerPromises.get(sessionKey);
  if (pending) return pending;
  return sessionKey;
}

/** Legacy async resolver — prefer takeOptimisticSessionKey. */
export async function resolveNewChatSessionKey(agentId?: string): Promise<string> {
  const sessionKey = takeOptimisticSessionKey(agentId);
  await ensureOptimisticSessionRegistered(sessionKey).catch(() => sessionKey);
  return sessionKey;
}

/** @deprecated Prefer takeOptimisticSessionKey. */
export function consumePrefetchedSession(
  agentId?: string,
  _options?: SessionPrefetchOptions,
): Promise<string> | null {
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId);
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  cache.delete(cacheKey);
  return registerPromises.get(entry.sessionKey) ?? null;
}

/** Test-only: wipe cache between cases. */
export function resetSessionPrefetchCacheForTests(): void {
  cache.clear();
  registerPromises.clear();
  optimisticKeys.clear();
}
