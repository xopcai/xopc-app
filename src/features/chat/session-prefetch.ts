/**
 * Optimistic new-chat session keys.
 *
 * Generates the canonical session key locally (instant UI). Registration with
 * `POST /api/sessions` is deferred until the user sends their first message.
 */
import {
  buildWebchatSessionKey,
  extractAgentIdFromWebchatSessionKey,
  extractChatIdFromWebchatSessionKey,
  generateNewChatId,
  normalizeAgentId,
} from '../../lib/session-key';
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
const optimisticMeta = new Map<string, { agentId: string; chatId: string }>();

function keyOf(agentId: string | undefined): string {
  return normalizeAgentId(agentId);
}

function dropExpired(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

function markOptimistic(sessionKey: string, agentId: string, chatId: string): void {
  optimisticKeys.add(sessionKey);
  optimisticMeta.set(sessionKey, { agentId, chatId });
}

export function isOptimisticSessionKey(sessionKey: string): boolean {
  return optimisticKeys.has(sessionKey);
}

function confirmOptimistic(sessionKey: string): void {
  optimisticKeys.delete(sessionKey);
  optimisticMeta.delete(sessionKey);
}

function resolveOptimisticMeta(sessionKey: string): { agentId: string; chatId: string } | null {
  const stored = optimisticMeta.get(sessionKey);
  if (stored) return stored;

  const chatId = extractChatIdFromWebchatSessionKey(sessionKey);
  if (!chatId) return null;
  const agentId = extractAgentIdFromWebchatSessionKey(sessionKey) || 'main';
  return { agentId, chatId };
}

function startRegistration(agentId: string, chatId: string, sessionKey: string): Promise<string> {
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
  markOptimistic(sessionKey, id, chatId);
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

/** Cache a local session key while the user is still on the home screen. */
export function prefetchNewChatSession(agentId?: string, _options?: SessionPrefetchOptions): void {
  const now = Date.now();
  dropExpired(now);
  const cacheKey = keyOf(agentId);
  if (cache.has(cacheKey)) return;
  cache.set(cacheKey, createOptimisticEntry(agentId));
}

/**
 * Return an optimistic session key synchronously — no network wait.
 * Server registration happens on first message via ensureOptimisticSessionRegistered.
 */
export function takeOptimisticSessionKey(agentId?: string): string {
  return takeCachedEntry(agentId).sessionKey;
}

export function getOptimisticRegisterPromise(sessionKey: string): Promise<string> | undefined {
  return registerPromises.get(sessionKey);
}

/** Register with the server before the first message send. */
export async function ensureOptimisticSessionRegistered(sessionKey: string): Promise<string> {
  const pending = registerPromises.get(sessionKey);
  if (pending) return pending;
  if (!isOptimisticSessionKey(sessionKey)) return sessionKey;

  const meta = resolveOptimisticMeta(sessionKey);
  if (!meta) return sessionKey;
  return startRegistration(meta.agentId, meta.chatId, sessionKey);
}


/** Test-only: wipe cache between cases. */
export function resetSessionPrefetchCacheForTests(): void {
  cache.clear();
  registerPromises.clear();
  optimisticKeys.clear();
  optimisticMeta.clear();
}
