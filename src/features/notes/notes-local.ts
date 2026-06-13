/**
 * Notes local-first editing — backed by the unified OfflineQueue.
 *
 * Each edit persists a local snapshot immediately (for instant UI) and
 * enqueues a sync operation. When connectivity returns, operations are
 * flushed in order with version-based conflict detection.
 */
import { createOfflineQueue, type OfflineQueue, type QueuedOperation } from '../../sync';
import { storage } from '../../storage/mmkv';
import { syncNote, updateNote, type Note, type NoteSyncResult } from '../../query/notes';

import { blocksToReadableText, type NoteBlock } from './note-blocks';
import { editorAttachmentToSync, type NoteEditorAttachment } from './editor/note-attachment.types';

// ── Local snapshot (instant read) ───────────────────────────

const LOCAL_NOTE_PREFIX = 'notes:local:item:';

export interface LocalNoteSnapshot extends Note {
  blocks: NoteBlock[];
  localVersion: number;
  syncState: 'synced' | 'pending' | 'failed';
  pendingAttachments?: NoteEditorAttachment[];
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

export function readLocalNote(noteId: string): LocalNoteSnapshot | null {
  return parseJson<LocalNoteSnapshot>(storage.getString(localNoteKey(noteId)));
}

export function writeLocalNote(note: LocalNoteSnapshot): void {
  storage.set(localNoteKey(note.id), JSON.stringify(note));
}

// ── Edit sync queue ─────────────────────────────────────────

interface EditSyncPayload {
  noteId: string;
  blocks: NoteBlock[];
  text: string;
  localVersion: number;
  baseRemoteVersion?: number;
  attachments?: NoteEditorAttachment[];
}

async function syncNoteEdit(payload: EditSyncPayload): Promise<NoteSyncResult> {
  const request = {
    noteId: payload.noteId,
    blocks: payload.blocks,
    text: payload.text,
    localVersion: payload.localVersion,
    baseRemoteVersion: payload.baseRemoteVersion,
  };
  const first = await syncNote(request);
  if (!first.conflict) return first;

  // Server bumped remoteVersion (e.g. recordNoteOpen) — retry once with fresh base.
  const retry = await syncNote({
    ...request,
    baseRemoteVersion: first.note.remoteVersion,
  });
  if (retry.conflict) {
    throw new Error('Note sync conflict');
  }
  return retry;
}

function enqueueNoteEdit(payload: EditSyncPayload): void {
  for (const op of editQueue.pending()) {
    if (op.payload.noteId === payload.noteId) {
      editQueue.remove(op.id);
    }
  }
  editQueue.enqueue(payload);
}

const editQueue: OfflineQueue<EditSyncPayload> = createOfflineQueue<EditSyncPayload>({
  namespace: 'notes:edit',
  processor: async (operation: QueuedOperation<EditSyncPayload>) => {
    const { noteId, blocks, text, localVersion, attachments } = operation.payload;
    const syncResult = await syncNoteEdit(operation.payload);
    let mergedNote = syncResult.note;
    if (attachments?.length) {
      mergedNote = await updateNote(noteId, {
        attachments: attachments.map(editorAttachmentToSync),
      });
    }
    const snapshot = readLocalNote(noteId);
    if (snapshot && snapshot.localVersion === localVersion) {
      writeLocalNote({
        ...snapshot,
        ...mergedNote,
        blocks,
        syncState: 'synced',
        pendingAttachments: undefined,
      });
    }
  },
  maxRetries: 8,
});

// ── Public API ──────────────────────────────────────────────

/** True when block body text matches the last local snapshot (ignore block id churn). */
export function noteBlocksContentEqual(a: NoteBlock[], b: NoteBlock[]): boolean {
  return blocksToReadableText(a) === blocksToReadableText(b);
}

/**
 * Save a local edit immediately and queue the sync operation.
 * Returns null when content is unchanged from the last synced snapshot.
 */
export function saveLocalNoteEdit(
  note: Note,
  blocks: NoteBlock[],
  attachments?: NoteEditorAttachment[],
): LocalNoteSnapshot | null {
  const previous = readLocalNote(note.id);
  const nextAttachmentCount = attachments?.length ?? previous?.pendingAttachments?.length ?? 0;
  const prevAttachmentCount = previous?.pendingAttachments?.length ?? 0;
  if (
    previous?.syncState === 'synced' &&
    noteBlocksContentEqual(blocks, previous.blocks) &&
    nextAttachmentCount === prevAttachmentCount
  ) {
    return previous;
  }

  const localVersion = (previous?.localVersion ?? 0) + 1;
  const baseRemoteVersion = previous?.remoteVersion ?? note.remoteVersion;
  const snapshot: LocalNoteSnapshot = {
    ...note,
    blocks,
    text: blocksToReadableText(blocks),
    updatedAt: Date.now(),
    localVersion,
    remoteVersion: baseRemoteVersion,
    syncState: 'pending',
    pendingAttachments: attachments ?? previous?.pendingAttachments,
  };
  writeLocalNote(snapshot);

  enqueueNoteEdit({
    noteId: note.id,
    blocks,
    text: snapshot.text ?? '',
    localVersion,
    baseRemoteVersion,
    attachments: snapshot.pendingAttachments,
  });

  return snapshot;
}

/**
 * Flush all pending note edit operations. Returns count flushed.
 * On failure, marks the affected note snapshot as 'failed'.
 */
export async function flushPendingNoteOperations(): Promise<number> {
  // We wrap the generic flush to also update snapshot syncState on failure.
  // The queue processor already handles success; here we handle the remaining
  // failed items after flush completes.
  const flushed = await editQueue.flush();

  // Mark remaining pending operations' notes as failed
  const remaining = editQueue.pending();
  for (const op of remaining) {
    if (op.retryCount > 0) {
      const snapshot = readLocalNote(op.payload.noteId);
      if (snapshot && snapshot.syncState !== 'failed') {
        writeLocalNote({ ...snapshot, syncState: 'failed' });
      }
    }
  }

  return flushed;
}

/** Number of pending edit sync operations. */
export function getPendingEditCount(): number {
  return editQueue.pendingCount();
}
