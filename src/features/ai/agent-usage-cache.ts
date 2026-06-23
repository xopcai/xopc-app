import { storage } from '../../storage/mmkv';

type AgentUsageMap = Record<string, number>;

const STORAGE_PREFIX = 'agents.recentUsage:';
const MAX_RECENT_AGENTS = 50;

function storageKey(gatewayId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${gatewayId?.trim() || 'default'}`;
}

function parseUsage(raw: string | undefined): AgentUsageMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const entries = Object.entries(parsed as Record<string, unknown>).flatMap(([id, value]) => {
      const normalizedId = id.trim().toLowerCase();
      if (!normalizedId || typeof value !== 'number' || !Number.isFinite(value)) return [];
      return [[normalizedId, value] as const];
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function pruneUsage(usage: AgentUsageMap): AgentUsageMap {
  return Object.fromEntries(
    Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_RECENT_AGENTS),
  );
}

export function readAgentUsage(gatewayId: string | null | undefined): AgentUsageMap {
  return parseUsage(storage.getString(storageKey(gatewayId)));
}

export function touchAgentUsage(
  gatewayId: string | null | undefined,
  agentId: string,
): AgentUsageMap {
  const id = agentId.trim().toLowerCase();
  if (!id) return readAgentUsage(gatewayId);
  const next = pruneUsage({ ...readAgentUsage(gatewayId), [id]: Date.now() });
  storage.set(storageKey(gatewayId), JSON.stringify(next));
  return next;
}
