import { pendingRunStorageKey, storage } from '../../storage/mmkv';

import { emitGatewayEvent, subscribeGatewayEvent } from './gateway-event-bus';

export const PENDING_AGENT_RUN_CHANGED = 'pending-agent-run-changed';

export function setPendingAgentRun(chatId: string, runId: string): void {
  const id = runId.trim();
  if (!id || !chatId) return;
  storage.set(pendingRunStorageKey(chatId), JSON.stringify({ runId: id }));
  emitGatewayEvent(PENDING_AGENT_RUN_CHANGED, { chatId });
}

export function clearPendingAgentRun(chatId: string): void {
  if (!chatId) return;
  try {
    storage.delete(pendingRunStorageKey(chatId));
    emitGatewayEvent(PENDING_AGENT_RUN_CHANGED, { chatId });
  } catch {
    /* ignore */
  }
}

export function hasPendingAgentRunForChat(chatId: string): boolean {
  try {
    const raw = storage.getString(pendingRunStorageKey(chatId));
    if (!raw) return false;
    const pr = JSON.parse(raw) as { runId?: unknown };
    return typeof pr.runId === 'string' && pr.runId.trim().length > 0;
  } catch {
    return false;
  }
}

export function readPendingAgentRunId(chatId: string): string | null {
  try {
    const raw = storage.getString(pendingRunStorageKey(chatId));
    if (!raw) return null;
    const pr = JSON.parse(raw) as { runId?: unknown };
    return typeof pr.runId === 'string' && pr.runId.trim() ? pr.runId.trim() : null;
  } catch {
    return null;
  }
}

export function subscribePendingAgentRunChanged(
  listener: (detail: { chatId?: string }) => void,
): () => void {
  return subscribeGatewayEvent(PENDING_AGENT_RUN_CHANGED, (detail) => {
    listener(detail as { chatId?: string });
  });
}
