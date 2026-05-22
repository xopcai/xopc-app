import { z } from 'zod';

import { apiFetch, formatApiHttpError } from '../api/client';

export type ChatModelOption = {
  id: string;
  name?: string;
  description?: string;
};

export type ChatModelsPayload = {
  defaultId: string;
  items: ChatModelOption[];
};

const modelRowSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

function normalizeModelRow(raw: unknown): ChatModelOption | null {
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string'
    ? row.id
    : typeof row.ref === 'string'
      ? row.ref
      : typeof row.modelRef === 'string'
        ? row.modelRef
        : '';
  if (!id.trim()) return null;
  const parsed = modelRowSchema.safeParse({ ...row, id: id.trim() });
  if (!parsed.success) return { id: id.trim() };
  return parsed.data;
}

function parseModelsPayload(raw: unknown): ChatModelsPayload | null {
  if (raw == null || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const payload = root.payload && typeof root.payload === 'object'
    ? (root.payload as Record<string, unknown>)
    : root;

  const listRaw = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(root.data)
        ? root.data
        : null;

  if (!listRaw) return null;

  const items: ChatModelOption[] = [];
  for (const row of listRaw) {
    const one = normalizeModelRow(row);
    if (one) items.push(one);
  }
  if (!items.length) return null;

  const defaultRaw = payload.defaultId ?? payload.defaultModelId ?? payload.defaultModelRef;
  const defaultId = typeof defaultRaw === 'string' && defaultRaw.trim()
    ? defaultRaw.trim()
    : items[0].id;

  return { defaultId, items };
}

export function resolveEffectiveModelId(
  payload: ChatModelsPayload | undefined,
  localOverride: string | null,
): string {
  const gatewayDefault = payload?.defaultId?.trim() || payload?.items[0]?.id || '';
  const items = payload?.items ?? [];
  const override = localOverride?.trim();
  if (override && items.some((m) => m.id === override)) return override;
  return gatewayDefault;
}

export async function fetchChatModels(agentId?: string): Promise<ChatModelsPayload> {
  const agentQ = agentId?.trim()
    ? `?agentId=${encodeURIComponent(agentId.trim().toLowerCase())}`
    : '';
  const paths = [`/api/models${agentQ}`, `/api/agent/models${agentQ}`];

  let lastError: Error | null = null;
  for (const path of paths) {
    const res = await apiFetch(path);
    if (res.status === 404 || res.status === 405 || res.status === 501) continue;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      lastError = new Error(formatApiHttpError(res.status, res.statusText, body.error?.message));
      continue;
    }
    const raw = await res.json().catch(() => null);
    const parsed = parseModelsPayload(raw);
    if (parsed) return parsed;
  }

  if (lastError) throw lastError;
  return { defaultId: '', items: [] };
}

export async function setSessionModelRef(sessionKey: string, modelRef: string): Promise<boolean> {
  const body = JSON.stringify({ modelRef: modelRef.trim() });
  const key = encodeURIComponent(sessionKey);
  const attempts: Array<() => Promise<Response>> = [
    () =>
      apiFetch(`/api/sessions/${key}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    () =>
      apiFetch(`/api/sessions/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
  ];

  for (const attempt of attempts) {
    const res = await attempt();
    if (res.ok) return true;
    if (res.status !== 404 && res.status !== 405 && res.status !== 501) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(formatApiHttpError(res.status, res.statusText, errBody.error?.message));
    }
  }
  return false;
}
