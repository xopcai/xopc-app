/** Notes local-first editing — Markdown is canonical. */
import { createOfflineQueue, type OfflineQueue, type QueuedOperation } from '../../sync';
import { storage } from '../../storage/mmkv';
import { updateNote, type Note, type NoteStatus } from '../../query/notes';
import {
  commitLocalNoteAttachmentUploads,
  deleteLocalNoteAttachments,
  prepareLocalNoteAttachmentUploadsForMarkdown,
  type PreparedLocalNoteAttachmentUpload,
} from './notes-local-attachments';

const LOCAL_NOTE_PREFIX = 'notes:local:item:';
const EDIT_SYNC_DEBOUNCE_MS = 400;

export interface LocalNoteSnapshot extends Note {
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

function deleteLocalNoteSnapshot(noteId: string): void {
  storage.delete(localNoteKey(noteId));
}

interface EditSyncPayload {
  noteId: string;
  markdown: string;
  localVersion: number;
  title?: string;
  clearTitle?: boolean;
  tags?: string[];
  status?: NoteStatus;
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
    const { noteId, markdown, localVersion, title, clearTitle, tags, status } = operation.payload;
    const metadataPatch = noteMetadataPatch({ title, clearTitle, tags, status });
    const preparedAttachments = await prepareLocalNoteAttachmentUploadsForMarkdown(noteId, markdown);
    const syncMarkdown = preparedAttachments.markdown;
    let updatedNote: Note;
    try {
      updatedNote = await updateNote(noteId, { markdown: syncMarkdown, ...metadataPatch });
      assertUploadedAttachmentsCommitted(updatedNote, preparedAttachments.uploads);
    } catch (error) {
      if (isNoteNotFoundError(error)) {
        discardLocalNoteState(noteId);
        return;
      }
      throw error;
    }
    commitLocalNoteAttachmentUploads(preparedAttachments.uploads);
    const snapshot = readLocalNote(noteId);
    if (snapshot && snapshot.localVersion === localVersion) {
      writeLocalNote({
        ...snapshot,
        ...updatedNote,
        title: clearTitle ? undefined : title ?? updatedNote.title ?? snapshot.title,
        tags: tags ?? updatedNote.tags ?? snapshot.tags,
        status: status ?? updatedNote.status ?? snapshot.status,
        markdown: syncMarkdown,
        text: syncMarkdown,
        syncState: 'synced',
      });
    }
  },
  maxRetries: 8,
});

export function discardPendingNoteEdits(noteId: string): void {
  for (const op of editQueue.pending()) {
    if (op.payload.noteId === noteId) {
      editQueue.remove(op.id);
    }
  }
  for (const op of editQueue.deadLetters()) {
    if (op.payload.noteId === noteId) {
      editQueue.removeDeadLetter(op.id);
    }
  }
}

export function discardLocalNoteState(noteId: string): void {
  deleteLocalNoteSnapshot(noteId);
  deleteLocalNoteAttachments(noteId);
  discardPendingNoteEdits(noteId);
}

export const deleteLocalNote = discardLocalNoteState;

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
    remoteVersion: previous?.remoteVersion ?? note.remoteVersion,
    syncState: 'pending',
  };
  writeLocalNote(snapshot);

  enqueueNoteEdit({
    noteId: note.id,
    markdown: input.markdown,
    title: nextTitle,
    clearTitle,
    tags: input.tags,
    status: input.status,
    localVersion,
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

function isNoteNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: number; code?: string };
  return candidate.status === 404 || candidate.code === 'note_not_found';
}

function assertUploadedAttachmentsCommitted(
  updatedNote: Note,
  uploads: PreparedLocalNoteAttachmentUpload[],
): void {
  if (!uploads.length) return;
  const remoteMarkdown = updatedNote.markdown ?? updatedNote.text ?? '';
  const attachmentIds = new Set((updatedNote.attachments ?? []).map((attachment) => attachment.id));
  const missing = uploads.filter((upload) => (
    !attachmentIds.has(upload.attachment.id) || !remoteMarkdown.includes(upload.canonicalRef)
  ));
  if (missing.length) {
    throw new Error('Note attachment sync incomplete');
  }
}
