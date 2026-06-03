import { useGatewayStore } from '../stores/gateway-store';
import { apiFetch, formatApiHttpError } from '../api/client';
import {
  readCachedSessions,
  writeCachedSessions,
} from '../features/gateway/sessions-cache';
import { sessionListItemSchema, sessionsListResponseSchema } from '../config/schema';

// ── Types ────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'pinned' | 'archived';

export type SessionListItem = {
  key: string;
  name?: string;
  messageCount: number;
  updatedAt: string;
  sourceChannel?: string;
  status?: SessionStatus;
};

export type SessionMessage = {
  role: string;
  content: unknown;
  timestamp?: string;
};

export type SessionDetail = {
  key: string;
  messages: SessionMessage[];
  name?: string;
  status?: SessionStatus;
};

export type SessionMessagePage = {
  session: SessionDetail;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    before?: string;
    nextBeforeCursor?: string;
  };
};

// ── Helpers ──────────────────────────────────────────────────────

function throwApiError(res: Response, body: unknown): never {
  const b = body as { error?: { message?: string } } | null;
  throw new Error(formatApiHttpError(res.status, res.statusText, b?.error?.message));
}

async function parseErrorBody(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function encKey(key: string): string {
  return encodeURIComponent(key);
}

// ── List / Detail / Create ───────────────────────────────────────

export async function fetchSessionsList(): Promise<SessionListItem[]> {
  const res = await apiFetch(
    '/api/sessions?limit=80&channel=webchat&sortBy=updatedAt&sortOrder=desc',
  );
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
  const raw = await res.json();
  const parsed = sessionsListResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid sessions response');
  const items: SessionListItem[] = [];
  for (const row of parsed.data.items) {
    const one = sessionListItemSchema.safeParse(row);
    if (one.success) items.push(one.data);
  }
  // Persist for instant first-paint on the next cold start.
  writeCachedSessions(useGatewayStore.getState().activeGatewayId, items);
  return items;
}

/** Last-known session list for the active profile; used as react-query
 * `placeholderData` so the drawer renders instantly while the live request
 * fans out behind the scenes. */
export function readPlaceholderSessions(): SessionListItem[] | null {
  return readCachedSessions(useGatewayStore.getState().activeGatewayId);
}

export async function fetchSession(key: string): Promise<SessionDetail | null> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}`);
  if (res.status === 404) return null;
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
  const data = (await res.json()) as { session?: SessionDetail };
  return data.session ?? null;
}

export async function fetchSessionMessagePage(
  key: string,
  options?: { limit?: number; before?: string },
): Promise<SessionMessagePage | null> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? 50));
  const before = options?.before?.trim();
  if (before) {
    params.set('before', before);
  }

  const res = await apiFetch(`/api/sessions/${encKey(key)}/history?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
  return (await res.json()) as SessionMessagePage;
}

export async function createSession(
  agentId?: string,
  options?: { forceNew?: boolean },
): Promise<string> {
  const body: Record<string, unknown> = { channel: 'webchat' };
  if (agentId?.trim()) body.agentId = agentId.trim().toLowerCase();
  if (options?.forceNew) {
    body.chat_id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const res = await apiFetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
  const data = (await res.json()) as { session?: { key?: string } };
  const key = data.session?.key;
  if (typeof key !== 'string' || !key.trim()) throw new Error('Create session: missing key');
  return key.trim();
}

// ── Session actions ──────────────────────────────────────────────

export async function deleteSession(key: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}`, { method: 'DELETE' });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

export async function renameSession(key: string, name: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

export async function archiveSession(key: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}/archive`, { method: 'POST' });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

export async function unarchiveSession(key: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}/unarchive`, { method: 'POST' });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

export async function pinSession(key: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}/pin`, { method: 'POST' });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

export async function unpinSession(key: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encKey(key)}/unpin`, { method: 'POST' });
  if (!res.ok) throwApiError(res, await parseErrorBody(res));
}

// ── Hook ─────────────────────────────────────────────────────────

export function useGatewayConfigured(): boolean {
  return useGatewayStore((s) => Boolean(s.baseUrl.trim()));
}
