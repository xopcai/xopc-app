import type { FollowUpSuggestionDisplay } from './follow-up-anchor';
import type { ToolUseSummary } from './follow-up-context';
import { FOLLOW_UP_SUGGESTION_IDS, type FollowUpSuggestionId } from './follow-up-suggestions.types';
import type { PendingFollowUp, PendingFollowUpAttachment } from './pending-follow-up.types';
import { storage } from '../../storage/mmkv';

const STORAGE_PREFIX = 'xopc.chat.followUpQueue:v1:';

const KNOWN_SUGGESTION_IDS = new Set<string>(FOLLOW_UP_SUGGESTION_IDS);

function coerceStoredSuggestionIds(raw: unknown): FollowUpSuggestionId[] {
  if (!Array.isArray(raw)) return [];
  const out: FollowUpSuggestionId[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && KNOWN_SUGGESTION_IDS.has(x)) {
      out.push(x as FollowUpSuggestionId);
    }
  }
  return out;
}

function parseSuggestionDisplays(raw: unknown): FollowUpSuggestionDisplay[] {
  if (!Array.isArray(raw)) return [];
  const out: FollowUpSuggestionDisplay[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue;
    const id = (row as { id?: unknown }).id;
    const label = (row as { label?: unknown }).label;
    if (typeof id !== 'string' || !KNOWN_SUGGESTION_IDS.has(id)) continue;
    if (typeof label !== 'string' || !label.trim()) continue;
    out.push({ id: id as FollowUpSuggestionId, label: label.trim() });
  }
  return out;
}

function parseToolUses(raw: unknown): ToolUseSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolUseSummary[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue;
    const name = (row as { name?: unknown }).name;
    const status = (row as { status?: unknown }).status;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (status !== 'running' && status !== 'done' && status !== 'error') continue;
    const item: ToolUseSummary = { name: name.trim(), status };
    const preview = (row as { resultPreview?: unknown }).resultPreview;
    if (typeof preview === 'string' && preview.trim()) {
      item.resultPreview = preview.trim().slice(0, 200);
    }
    out.push(item);
    if (out.length >= 24) break;
  }
  return out;
}

export type FollowUpQueueSnapshot = {
  pending: PendingFollowUp[];
  suggestions: FollowUpSuggestionId[];
  suggestionDisplays: FollowUpSuggestionDisplay[];
  editingId: string | null;
  recentPickedIds: FollowUpSuggestionId[];
  sessionToolUses: ToolUseSummary[];
};

function storageKey(sessionKey: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(sessionKey.trim())}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseAttachment(x: unknown): PendingFollowUpAttachment | null {
  if (!isRecord(x)) return null;
  const type = x.type;
  if (typeof type !== 'string' || !type.trim()) return null;
  const out: PendingFollowUpAttachment = { type: type.trim() };
  if (typeof x.mimeType === 'string') out.mimeType = x.mimeType;
  if (typeof x.name === 'string') out.name = x.name;
  if (typeof x.size === 'number' && Number.isFinite(x.size)) out.size = x.size;
  if (typeof x.workspaceRelativePath === 'string') out.workspaceRelativePath = x.workspaceRelativePath;
  if (typeof x.durationSeconds === 'number' && Number.isFinite(x.durationSeconds)) {
    out.durationSeconds = x.durationSeconds;
  }
  return out;
}

function parsePendingFollowUps(raw: unknown): PendingFollowUp[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingFollowUp[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const text = row.text;
    if (typeof id !== 'string' || !id.trim()) continue;
    if (typeof text !== 'string') continue;
    const item: PendingFollowUp = { id: id.trim(), text };
    if (typeof row.thinkingLevel === 'string' && row.thinkingLevel.trim()) {
      item.thinkingLevel = row.thinkingLevel.trim();
    }
    if (Array.isArray(row.attachments)) {
      const atts = row.attachments.map(parseAttachment).filter(Boolean) as PendingFollowUpAttachment[];
      if (atts.length) item.attachments = atts;
    }
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

function snapshotIsEmpty(snap: FollowUpQueueSnapshot): boolean {
  return (
    snap.pending.length === 0 &&
    snap.suggestions.length === 0 &&
    snap.suggestionDisplays.length === 0 &&
    snap.editingId == null &&
    snap.recentPickedIds.length === 0 &&
    snap.sessionToolUses.length === 0
  );
}

/**
 * Shape safe for persistence: never persist inline `data` (base64).
 * Rows may still carry `workspaceRelativePath` / metadata so session-backed files survive refresh.
 */
export function sanitizeFollowUpQueueSnapshot(snap: FollowUpQueueSnapshot): FollowUpQueueSnapshot {
  return {
    editingId: snap.editingId,
    suggestions: [...snap.suggestions],
    suggestionDisplays: snap.suggestionDisplays.map((d) => ({ ...d })),
    recentPickedIds: [...snap.recentPickedIds],
    sessionToolUses: snap.sessionToolUses.map((t) => ({ ...t })),
    pending: snap.pending.map((row) => ({
      ...row,
      attachments: row.attachments?.map((a) => {
        const { data: _d, ...rest } = a;
        return rest;
      }),
    })),
  };
}

export function readFollowUpQueueSnapshot(sessionKey: string): FollowUpQueueSnapshot | null {
  const sk = sessionKey?.trim();
  if (!sk) return null;
  try {
    const raw = storage.getString(storageKey(sk));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const pending = parsePendingFollowUps(parsed.pending);
    const suggestions = coerceStoredSuggestionIds(parsed.suggestions);
    const suggestionDisplays = parseSuggestionDisplays(parsed.suggestionDisplays);
    const recentPickedIds = coerceStoredSuggestionIds(parsed.recentPickedIds);
    const sessionToolUses = parseToolUses(parsed.sessionToolUses);
    const editingId =
      parsed.editingId === null
        ? null
        : typeof parsed.editingId === 'string' && parsed.editingId.trim()
          ? parsed.editingId.trim()
          : null;

    const snap: FollowUpQueueSnapshot = {
      pending,
      suggestions,
      suggestionDisplays:
        suggestionDisplays.length > 0
          ? suggestionDisplays
          : suggestions.map((id) => ({ id, label: id })),
      editingId,
      recentPickedIds,
      sessionToolUses,
    };
    if (snapshotIsEmpty(snap)) return null;
    return snap;
  } catch {
    return null;
  }
}

export function writeFollowUpQueueSnapshot(sessionKey: string, snap: FollowUpQueueSnapshot): void {
  const sk = sessionKey?.trim();
  if (!sk) return;
  const sanitized = sanitizeFollowUpQueueSnapshot(snap);
  if (snapshotIsEmpty(sanitized)) {
    clearFollowUpQueueSnapshot(sk);
    return;
  }
  try {
    storage.set(storageKey(sk), JSON.stringify({ v: 2, ...sanitized }));
  } catch {
    /* ignore quota */
  }
}

export function clearFollowUpQueueSnapshot(sessionKey: string): void {
  const sk = sessionKey?.trim();
  if (!sk) return;
  try {
    storage.delete(storageKey(sk));
  } catch {
    /* ignore */
  }
}
