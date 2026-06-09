import { storage } from '../../storage/mmkv';
import { syncNote, type Note } from '../../query/notes';

import { blocksToPlainText, type NoteBlock } from './note-blocks';

const LOCAL_NOTE_PREFIX = 'notes:local:item:';
const PENDING_OP_IDS_KEY = 'notes:local:pendingOpIds';
const PENDING_OP_PREFIX = 'notes:local:op:';

export interface LocalNoteSnapshot extends Note {
  blocks: NoteBlock[];
  localVersion: number;
  syncState: 'synced' | 'pending' | 'failed';
}

interface PendingNoteOperation {
  id: string;
  noteId: string;
  blocks: NoteBlock[];
  text: string;
  localVersion: number;
  baseRemoteVersion?: number;
  createdAt: number;
  retryCount: number;
}

function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function localNoteKey(noteId: string): string {
  return `${LOCAL_NOTE_PREFIX}${noteId}`;
}

function opKey(opId: string): string {
  return `${PENDING_OP_PREFIX}${opId}`;
}

function createOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readPendingOperationIds(): string[] {
  return parseJson<string[]>(storage.getString(PENDING_OP_IDS_KEY)) ?? [];
}

function writePendingOperationIds(ids: string[]): void {
  storage.set(PENDING_OP_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function readLocalNote(noteId: string): LocalNoteSnapshot | null {
  return parseJson<LocalNoteSnapshot>(storage.getString(localNoteKey(noteId)));
}

export function writeLocalNote(note: LocalNoteSnapshot): void {
  storage.set(localNoteKey(note.id), JSON.stringify(note));
}

export function saveLocalNoteEdit(note: Note, blocks: NoteBlock[]): LocalNoteSnapshot {
  const previous = readLocalNote(note.id);
  const localVersion = (previous?.localVersion ?? 0) + 1;
  const snapshot: LocalNoteSnapshot = {
    ...note,
    blocks,
    text: blocksToPlainText(blocks),
    updatedAt: Date.now(),
    localVersion,
    syncState: 'pending',
  };
  writeLocalNote(snapshot);

  const operation: PendingNoteOperation = {
    id: createOperationId(),
    noteId: note.id,
    blocks,
    text: snapshot.text ?? '',
    localVersion,
    baseRemoteVersion: note.remoteVersion,
    createdAt: Date.now(),
    retryCount: 0,
  };
  storage.set(opKey(operation.id), JSON.stringify(operation));
  writePendingOperationIds([...readPendingOperationIds(), operation.id]);
  return snapshot;
}

export async function flushPendingNoteOperations(): Promise<number> {
  const operationIds = readPendingOperationIds();
  let flushed = 0;
  const remainingIds: string[] = [];

  for (const operationId of operationIds) {
    const operation = parseJson<PendingNoteOperation>(storage.getString(opKey(operationId)));
    if (!operation) continue;
    try {
      const syncResult = await syncNote({
        noteId: operation.noteId,
        blocks: operation.blocks,
        text: operation.text,
        localVersion: operation.localVersion,
        baseRemoteVersion: operation.baseRemoteVersion,
      });
      const snapshot = readLocalNote(operation.noteId);
      if (snapshot && snapshot.localVersion === operation.localVersion) {
        writeLocalNote({ ...snapshot, ...syncResult.note, blocks: operation.blocks, syncState: 'synced' });
      }
      storage.delete(opKey(operationId));
      flushed++;
    } catch {
      remainingIds.push(operationId);
      const snapshot = readLocalNote(operation.noteId);
      if (snapshot) writeLocalNote({ ...snapshot, syncState: 'failed' });
    }
  }

  writePendingOperationIds(remainingIds);
  return flushed;
}
