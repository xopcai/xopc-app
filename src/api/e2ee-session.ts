import {
  buildDirectionKeys,
  bytesToBase64Url,
  base64UrlToBytes,
  type DirectionKeys,
} from '@xopcai/xopc-e2ee';

import { KEYS, storage } from '../storage/mmkv';
import { requiresE2eeTransport } from './e2ee-transport.js';

export { requiresE2eeTransport };

export type StoredE2eeSession = {
  sessionId: string;
  rootKey: string;
  fingerprint: string;
  reqSeq: number;
  resSeq: number;
  streamSeq: number;
  expiresAt: number;
};

export type ActiveE2eeSession = StoredE2eeSession & DirectionKeys;

function normalizeBaseUrlKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').toLowerCase();
}

function urlStorageKey(baseUrl: string): string {
  return `${KEYS.e2eeSessionPrefix}url.${normalizeBaseUrlKey(baseUrl)}`;
}

function idStorageKey(gatewayId: string): string {
  return `${KEYS.e2eeSessionPrefix}${gatewayId}`;
}

function parseStoredSession(raw: string | undefined): StoredE2eeSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredE2eeSession;
    if (!parsed.sessionId || !parsed.rootKey) return null;
    if (Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveE2eeSession(
  gatewayId: string | null,
  baseUrl: string,
  session: StoredE2eeSession,
): void {
  if (gatewayId) {
    storage.set(idStorageKey(gatewayId), JSON.stringify(session));
    storage.delete(urlStorageKey(baseUrl));
    return;
  }
  storage.set(urlStorageKey(baseUrl), JSON.stringify(session));
}

export function clearE2eeSession(gatewayId: string | null, baseUrl: string): void {
  if (gatewayId) storage.delete(idStorageKey(gatewayId));
  storage.delete(urlStorageKey(baseUrl));
}

export function readStoredE2eeSession(
  gatewayId: string | null,
  baseUrl: string,
): StoredE2eeSession | null {
  const lookupKeys: string[] = [];
  if (gatewayId) lookupKeys.push(idStorageKey(gatewayId));
  lookupKeys.push(urlStorageKey(baseUrl));

  for (const key of lookupKeys) {
    const session = parseStoredSession(storage.getString(key));
    if (!session) continue;
    if (Date.now() > session.expiresAt) {
      storage.delete(key);
      continue;
    }
    if (gatewayId && key !== idStorageKey(gatewayId)) {
      saveE2eeSession(gatewayId, baseUrl, session);
    }
    return session;
  }
  return null;
}

export async function loadActiveE2eeSession(
  gatewayId: string | null,
  baseUrl: string,
): Promise<ActiveE2eeSession | null> {
  const stored = readStoredE2eeSession(gatewayId, baseUrl);
  if (!stored) return null;
  const rootKey = base64UrlToBytes(stored.rootKey);
  const keys = await buildDirectionKeys(rootKey);
  return { ...stored, ...keys };
}

export function createStoredE2eeSession(params: {
  sessionId: string;
  rootKey: Uint8Array;
  fingerprint: string;
  expiresAt: string;
}): StoredE2eeSession {
  return {
    sessionId: params.sessionId,
    rootKey: bytesToBase64Url(params.rootKey),
    fingerprint: params.fingerprint,
    reqSeq: 0,
    resSeq: 0,
    streamSeq: 0,
    expiresAt: Date.parse(params.expiresAt),
  };
}

export function bumpE2eeRequestSeq(session: ActiveE2eeSession): number {
  session.reqSeq += 1;
  return session.reqSeq;
}

export function bumpE2eeResponseSeq(session: ActiveE2eeSession, seq: number): void {
  session.resSeq = Math.max(session.resSeq, seq);
}

export function bumpE2eeStreamSeq(session: ActiveE2eeSession, seq: number): void {
  session.streamSeq = Math.max(session.streamSeq, seq);
}

export function persistActiveE2eeSession(
  gatewayId: string | null,
  baseUrl: string,
  session: ActiveE2eeSession,
): void {
  saveE2eeSession(gatewayId, baseUrl, {
    sessionId: session.sessionId,
    rootKey: session.rootKey,
    fingerprint: session.fingerprint,
    reqSeq: session.reqSeq,
    resSeq: session.resSeq,
    streamSeq: session.streamSeq,
    expiresAt: session.expiresAt,
  });
}
