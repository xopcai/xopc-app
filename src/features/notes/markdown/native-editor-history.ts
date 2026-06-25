import type { MarkdownRange } from './markdown-document';

export type NativeEditorSnapshot = {
  markdown: string;
  selection: MarkdownRange;
};

export type NativeEditorHistoryReason =
  | 'typing'
  | 'paste'
  | 'toolbar'
  | 'link'
  | 'image'
  | 'ai'
  | 'metadata';

type NativeEditorHistoryEntry = NativeEditorSnapshot & {
  reason: NativeEditorHistoryReason;
  at: number;
};

export type NativeEditorHistory = {
  past: NativeEditorHistoryEntry[];
  future: NativeEditorHistoryEntry[];
};

export function createNativeEditorHistory(): NativeEditorHistory {
  return { past: [], future: [] };
}

export function pushNativeEditorHistory(
  history: NativeEditorHistory,
  snapshot: NativeEditorSnapshot,
  options?: {
    reason?: NativeEditorHistoryReason;
    now?: number;
    mergeWindowMs?: number;
    maxDepth?: number;
  },
): NativeEditorHistory {
  const reason = options?.reason ?? 'toolbar';
  const now = options?.now ?? Date.now();
  const maxDepth = options?.maxDepth ?? 80;
  const mergeWindowMs = options?.mergeWindowMs ?? 900;
  const last = history.past[history.past.length - 1];
  if (last && last.markdown === snapshot.markdown && sameRange(last.selection, snapshot.selection)) return history;
  const entry: NativeEditorHistoryEntry = { ...snapshot, reason, at: now };
  if (last && reason === 'typing' && last.reason === 'typing' && now - last.at <= mergeWindowMs) {
    return {
      past: [...history.past.slice(0, -1), last],
      future: [],
    };
  }
  return {
    past: [...history.past, entry].slice(-maxDepth),
    future: [],
  };
}

export function undoNativeEditorHistory(
  history: NativeEditorHistory,
  current: NativeEditorSnapshot,
): { history: NativeEditorHistory; snapshot: NativeEditorSnapshot | null } {
  const snapshot = history.past[history.past.length - 1];
  if (!snapshot) return { history, snapshot: null };
  return {
    snapshot: stripEntry(snapshot),
    history: {
      past: history.past.slice(0, -1),
      future: [{ ...current, reason: 'toolbar', at: Date.now() }, ...history.future],
    },
  };
}

export function redoNativeEditorHistory(
  history: NativeEditorHistory,
  current: NativeEditorSnapshot,
): { history: NativeEditorHistory; snapshot: NativeEditorSnapshot | null } {
  const snapshot = history.future[0];
  if (!snapshot) return { history, snapshot: null };
  return {
    snapshot: stripEntry(snapshot),
    history: {
      past: [...history.past, { ...current, reason: 'toolbar', at: Date.now() }],
      future: history.future.slice(1),
    },
  };
}

function stripEntry(entry: NativeEditorHistoryEntry): NativeEditorSnapshot {
  return {
    markdown: entry.markdown,
    selection: entry.selection,
  };
}

function sameRange(a: MarkdownRange, b: MarkdownRange): boolean {
  return a.start === b.start && a.end === b.end;
}
