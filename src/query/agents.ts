import { useQuery } from '@tanstack/react-query';

import { agentsResponseSchema } from '../config/schema';
import { apiFetch, formatApiHttpError } from '../api/client';
import { queryKeys } from './keys';
import { usePreferencesStore } from '../stores/preferences-store';

export type ChatAgentOption = { id: string; name?: string; description?: string };

export type ChatAgentsPayload = {
  defaultId: string;
  items: ChatAgentOption[];
};

export function resolveEffectiveDefaultAgentId(
  payload: ChatAgentsPayload | undefined,
  localOverride: string | null,
): string {
  const gatewayDefault = payload?.defaultId?.trim().toLowerCase() || 'main';
  const items = payload?.items ?? [];
  const override = localOverride?.trim().toLowerCase();
  if (override && items.some((a) => a.id === override)) return override;
  return gatewayDefault;
}

export async function setGatewayDefaultAgent(agentId: string): Promise<boolean> {
  const id = agentId.trim().toLowerCase();
  const body = JSON.stringify({ agentId: id });
  const attempts: Array<() => Promise<Response>> = [
    () =>
      apiFetch('/api/agents/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    () =>
      apiFetch(`/api/agents/${encodeURIComponent(id)}/default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    () =>
      apiFetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultId: id }),
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

/** Effective default agent id (local override when set, else gateway). */
export function useEffectiveDefaultAgentId(): string {
  const localOverride = usePreferencesStore((s) => s.defaultAgentId);
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchChatAgents,
  });
  return resolveEffectiveDefaultAgentId(agentsQuery.data, localOverride);
}

export async function fetchChatAgents(): Promise<ChatAgentsPayload> {
  const res = await apiFetch('/api/agents');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(formatApiHttpError(res.status, res.statusText, body.error?.message));
  }
  const data = await res.json();
  const parsed = agentsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { defaultId: 'main', items: [{ id: 'main' }] };
  }
  const { defaultId, agents } = parsed.data.payload;
  const items: ChatAgentOption[] = agents
    .filter((a) => a.id.trim())
    .map((a) => ({
      id: a.id.trim().toLowerCase(),
      name: a.name?.trim() || undefined,
      description: a.description?.trim() || undefined,
    }));
  if (items.length === 0) {
    return { defaultId: defaultId.trim().toLowerCase(), items: [{ id: 'main' }] };
  }
  return { defaultId: defaultId.trim().toLowerCase(), items };
}
