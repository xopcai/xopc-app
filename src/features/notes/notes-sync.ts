import { storage } from '../../storage/mmkv';
import { quickCaptureNote } from '../../query/notes';

const PENDING_PREFIX = 'notes:pending:';

interface PendingNote {
  id: string;
  text: string;
  createdAt: number;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function queueOfflineNote(text: string): string {
  const id = generateId();
  const entry: PendingNote = { id, text, createdAt: Date.now() };
  storage.set(`${PENDING_PREFIX}${id}`, JSON.stringify(entry));
  return id;
}

export function getPendingNotes(): PendingNote[] {
  const results: PendingNote[] = [];
  const prefix = PENDING_PREFIX;
  // MMKV doesn't support key enumeration in this abstraction,
  // so we maintain a list of pending IDs
  const idsRaw = storage.getString('notes:pendingIds');
  if (!idsRaw) return results;
  try {
    const ids = JSON.parse(idsRaw) as string[];
    for (const id of ids) {
      const raw = storage.getString(`${prefix}${id}`);
      if (raw) {
        results.push(JSON.parse(raw) as PendingNote);
      }
    }
  } catch {
    // corrupted — reset
  }
  return results.sort((a, b) => a.createdAt - b.createdAt);
}

export function getPendingNoteCount(): number {
  const idsRaw = storage.getString('notes:pendingIds');
  if (!idsRaw) return 0;
  try {
    return (JSON.parse(idsRaw) as string[]).length;
  } catch {
    return 0;
  }
}

function addPendingId(id: string): void {
  const idsRaw = storage.getString('notes:pendingIds');
  const ids: string[] = idsRaw ? (JSON.parse(idsRaw) as string[]) : [];
  ids.push(id);
  storage.set('notes:pendingIds', JSON.stringify(ids));
}

function removePendingId(id: string): void {
  const idsRaw = storage.getString('notes:pendingIds');
  if (!idsRaw) return;
  const ids = (JSON.parse(idsRaw) as string[]).filter((i) => i !== id);
  storage.set('notes:pendingIds', JSON.stringify(ids));
}

export function queueNote(text: string): string {
  const id = generateId();
  const entry: PendingNote = { id, text, createdAt: Date.now() };
  storage.set(`${PENDING_PREFIX}${id}`, JSON.stringify(entry));
  addPendingId(id);
  return id;
}

export async function flushPendingNotes(): Promise<number> {
  const pending = getPendingNotes();
  let flushed = 0;
  for (const note of pending) {
    try {
      await quickCaptureNote(note.text);
      storage.delete(`${PENDING_PREFIX}${note.id}`);
      removePendingId(note.id);
      flushed++;
    } catch {
      break;
    }
  }
  return flushed;
}
