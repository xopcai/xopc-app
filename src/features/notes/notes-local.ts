/**
 * Notes local-first editing — Markdown is canonical; block documents are editor-internal only.
 */
import { createOfflineQueue, type OfflineQueue, type QueuedOperation } from '../../sync';
import { storage } from '../../storage/mmkv';
import { deleteCachedLinkIndex } from '../../query/note-link-index';
import { syncNote, updateNote, type Note, type NoteBlock, type NoteStatus, type NoteSyncResult } from '../../query/notes';

import type { BlockDocument } from './blocks/core/block-document';
import { documentEqual, documentToBlocks, documentToPlainText } from './blocks/convert/block-serialize';

const LOCAL_NOTE_PREFIX = 'notes:local:item:';
const EDIT_SYNC_DEBOUNCE_MS = 400;

export interface LocalNoteSnapshot extends Note {
  document?: BlockDocument;
  localVersion: number;
  syncState: 'synced' | 'pending' | 'failed';
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

interface EditSyncPayload {
  noteId: string;
  blocks?: NoteBlock[];
  markdown: string;
  localVersion: number;
  baseRemoteVersion?: number;
  title?: string;
  clearTitle?: boolean;
  tags?: string[];
  status?: NoteStatus;
}

function resolveBaseRemoteVersion(noteId: string, fallback?: number): number | undefined {
  const snapshot = readLocalNote(noteId);
  const candidates = [fallback, snapshot?.remoteVersion].filter(
    (value): value is number => typeof value === 'number',
  );
  if (candidates.length === 0) return undefined;
  return Math.max(...candidates);
}

export function applyNoteServerVersion(
  noteId: string,
  server: Pick<Note, 'remoteVersion' | 'lastOpenedAt'>,
): LocalNoteSnapshot | null {
  const snapshot = readLocalNote(noteId);
  if (!snapshot || server.remoteVersion == null) return snapshot;
  if (
    snapshot.remoteVersion === server.remoteVersion &&
    snapshot.lastOpenedAt === server.lastOpenedAt
  ) {
    return snapshot;
  }
  const next: LocalNoteSnapshot = {
    ...snapshot,
    remoteVersion: server.remoteVersion,
    lastOpenedAt: server.lastOpenedAt ?? snapshot.lastOpenedAt,
  };
  writeLocalNote(next);
  return next;
}

async function syncNoteEdit(payload: EditSyncPayload): Promise<NoteSyncResult> {
  const request = {
    noteId: payload.noteId,
    markdown: payload.markdown,
    localVersion: payload.localVersion,
    baseRemoteVersion: resolveBaseRemoteVersion(payload.noteId, payload.baseRemoteVersion),
  };
  const first = await syncNote(request);
  if (!first.conflict) return first;

  if (first.note.remoteVersion != null) {
    applyNoteServerVersion(payload.noteId, first.note);
  }

  const retry = await syncNote({
    ...request,
    baseRemoteVersion: first.note.remoteVersion ?? request.baseRemoteVersion,
  });
  if (retry.conflict) {
    throw new Error('Note sync conflict');
  }
  return retry;
}

let editSyncTimer: ReturnType<typeof setTimeout> | null = null;
let editSyncFlushInFlight: Promise<number> | null = null;

export function scheduleNoteEditSync(): void {
  if (editSyncTimer) clearTimeout(editSyncTimer);
  editSyncTimer = setTimeout(() => {
    editSyncTimer = null;
    if (editSyncFlushInFlight) return;
    editSyncFlushInFlight = flushPendingNoteOperations()
      .catch((error) => {
        if (__DEV__) {
          console.warn('[notes-local] background sync failed', error);
        }
        return 0;
      })
      .finally(() => {
        editSyncFlushInFlight = null;
      });
  }, EDIT_SYNC_DEBOUNCE_MS);
}

function enqueueNoteEdit(payload: EditSyncPayload): void {
  for (const op of editQueue.pending()) {
    if (op.payload.noteId === payload.noteId) {
      editQueue.remove(op.id);
    }
  }
  editQueue.enqueue(payload);
  scheduleNoteEditSync();
}

const editQueue: OfflineQueue<EditSyncPayload> = createOfflineQueue<EditSyncPayload>({
  namespace: 'notes:edit',
  processor: async (operation: QueuedOperation<EditSyncPayload>) => {
    const { noteId, blocks, markdown, localVersion, title, clearTitle, tags, status } = operation.payload;
    const syncResult = await syncNoteEdit(operation.payload);
    const metadataPatch = noteMetadataPatch({ title, clearTitle, tags, status });
    const updatedNote = Object.keys(metadataPatch).length > 0
      ? await updateNote(noteId, metadataPatch)
      : syncResult.note;
    const snapshot = readLocalNote(noteId);
    if (snapshot && snapshot.localVersion === localVersion) {
      writeLocalNote({
        ...snapshot,
        ...syncResult.note,
        ...updatedNote,
        title: title ?? updatedNote.title ?? syncResult.note.title ?? snapshot.title,
        tags: tags ?? updatedNote.tags ?? syncResult.note.tags ?? snapshot.tags,
        status: status ?? updatedNote.status ?? syncResult.note.status ?? snapshot.status,
        markdown,
        ...(blocks ? { blocks } : {}),
        text: markdown,
        syncState: 'synced',
      });
    }
  },
  maxRetries: 8,
});

export function saveLocalNoteEdit(
  note: Note,
  document: BlockDocument,
): LocalNoteSnapshot | null {
  const previous = readLocalNote(note.id);
  const blocks = documentToBlocks(document);
  if (
    previous?.syncState === 'synced' &&
    previous.document &&
    documentEqual(document, previous.document)
  ) {
    return previous;
  }

  const localVersion = (previous?.localVersion ?? 0) + 1;
  const baseRemoteVersion = resolveBaseRemoteVersion(
    note.id,
    previous?.remoteVersion ?? note.remoteVersion,
  );
  const plainText = documentToPlainText(document);
  const snapshot: LocalNoteSnapshot = {
    ...note,
    document,
    blocks,
    markdown: plainText,
    text: plainText,
    updatedAt: Date.now(),
    localVersion,
    remoteVersion: baseRemoteVersion,
    syncState: 'pending',
  };
  writeLocalNote(snapshot);
  deleteCachedLinkIndex(storage);

  enqueueNoteEdit({
    noteId: note.id,
    blocks,
    markdown: plainText,
    localVersion,
    baseRemoteVersion,
  });

  return snapshot;
}

export function saveLocalMarkdownNoteEdit(
  note: Note,
  input: { markdown: string; title?: string; tags?: string[]; status?: NoteStatus },
): LocalNoteSnapshot {
  const previous = readLocalNote(note.id);
  const nextTitle = input.title?.trim() || undefined;
  const nextTags = input.tags ?? previous?.tags ?? note.tags;
  const nextStatus = input.status ?? previous?.status ?? note.status;
  const previousMarkdown = previous?.markdown ?? note.markdown ?? note.text ?? '';
  const previousTitle = previous?.title ?? note.title;
  const titleProvided = Object.prototype.hasOwnProperty.call(input, 'title');
  const clearTitle = titleProvided && nextTitle === undefined && previousTitle !== undefined;

  if (
    previous?.syncState === 'synced' &&
    input.markdown === previousMarkdown &&
    nextTitle === previousTitle &&
    tagsEqual(nextTags, previous.tags ?? note.tags) &&
    nextStatus === (previous.status ?? note.status)
  ) {
    return previous;
  }

  const localVersion = (previous?.localVersion ?? note.localVersion ?? 0) + 1;
  const baseRemoteVersion = resolveBaseRemoteVersion(
    note.id,
    previous?.remoteVersion ?? note.remoteVersion,
  );
  const snapshot: LocalNoteSnapshot = {
    ...note,
    ...previous,
    title: nextTitle,
    tags: nextTags,
    status: nextStatus,
    markdown: input.markdown,
    text: input.markdown,
    updatedAt: Date.now(),
    localVersion,
    remoteVersion: baseRemoteVersion,
    syncState: 'pending',
  };
  writeLocalNote(snapshot);
  deleteCachedLinkIndex(storage);

  enqueueNoteEdit({
    noteId: note.id,
    markdown: input.markdown,
    title: nextTitle,
    clearTitle,
    tags: input.tags,
    status: input.status,
    localVersion,
    baseRemoteVersion,
  });

  return snapshot;
}

export async function flushPendingNoteOperations(): Promise<number> {
  const flushed = await editQueue.flush();

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

export function getPendingEditCount(): number {
  return editQueue.pendingCount();
}

function noteMetadataPatch(input: { title?: string; clearTitle?: boolean; tags?: string[]; status?: NoteStatus }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.clearTitle) patch.title = null;
  else if (input.title !== undefined) patch.title = input.title;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.status !== undefined) patch.status = input.status;
  return patch;
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}
