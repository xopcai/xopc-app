import { Platform } from 'react-native';

import { apiFetch } from '../api/client';
import { createTextBlock, type NoteAiPatch, type NoteBlock } from '../features/notes/note-blocks';

export type { NoteBlock, NoteAiPatch } from '../features/notes/note-blocks';

export type NoteKind = 'thought' | 'todo' | 'voice' | 'media' | 'bookmark' | 'mixed' | 'task';
export type NoteStatus = 'inbox' | 'processed' | 'archived' | 'trashed';

export interface NoteTaskMeta {
  done: boolean;
  dueAt?: number;
  priority?: 'high' | 'medium' | 'low';
  sourceSessionKey?: string;
  sourceNoteId?: string;
}

export interface NoteIndexEntry {
  id: string;
  title?: string;
  kind: NoteKind;
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
  snippet?: string;
  groupId?: string;
  lastOpenedAt?: number;
  taskDone?: boolean;
  taskDueAt?: number;
}

export interface NoteAttachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  fileName: string;
  size: number;
  relativePath: string;
  transcript?: string;
  duration?: number;
}

export interface Note {
  id: string;
  title?: string;
  kind: NoteKind;
  status: NoteStatus;
  text?: string;
  blocks?: NoteBlock[];
  attachments?: NoteAttachment[];
  createdAt: number;
  updatedAt: number;
  capturedVia: { channel: string; platform?: string };
  tags?: string[];
  pinned?: boolean;
  localVersion?: number;
  remoteVersion?: number;
  groupId?: string;
  lastOpenedAt?: number;
  taskMeta?: NoteTaskMeta;
}

export interface NotesListResult {
  items: NoteIndexEntry[];
  total: number;
}

export interface NotesListQuery {
  status?: NoteStatus;
  kind?: NoteKind;
  search?: string;
  limit?: number;
  offset?: number;
  groupId?: string;
  pendingTasksOnly?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'lastOpenedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface NoteAiEditRequest {
  instruction: string;
  blocks: NoteBlock[];
  selectedBlockIds?: string[];
}

export interface NoteAiEditResult {
  message: string;
  patch: NoteAiPatch;
}

export interface NoteSyncRequest {
  noteId: string;
  blocks: NoteBlock[];
  text?: string;
  localVersion: number;
  baseRemoteVersion?: number;
}

export interface NoteSyncResult {
  conflict: boolean;
  note: Note;
}

async function readError(res: Response): Promise<Error> {
  const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
  return new Error(data.error || data.message || `HTTP ${res.status}`);
}

export async function fetchNotes(query?: NotesListQuery): Promise<NotesListResult> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.kind) params.set('kind', query.kind);
  if (query?.search) params.set('search', query.search);
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.offset) params.set('offset', String(query.offset));
  if (query?.groupId) params.set('groupId', query.groupId);
  if (query?.pendingTasksOnly) params.set('pendingTasksOnly', 'true');
  params.set('sortBy', query?.sortBy ?? 'createdAt');
  params.set('sortOrder', query?.sortOrder ?? 'desc');
  const qs = params.toString();
  const res = await apiFetch(`/api/notes${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<NotesListResult>;
}

export async function quickCaptureNote(text: string): Promise<{ note: { id: string } }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes/quick-capture', {
    method: 'POST',
    body: JSON.stringify({ text, channel: 'app', platform }),
  });
  if (!res.ok) throw await readError(res);
  return readCreatedNote(res);
}

/** Create an empty note for the block editor (POST /api/notes, not quick-capture). */
export async function createBlankNote(): Promise<{ note: { id: string } }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'app',
      platform,
      blocks: [createTextBlock('paragraph')],
    }),
  });
  if (!res.ok) throw await readError(res);
  return readCreatedNote(res);
}

async function readCreatedNote(res: Response): Promise<{ note: { id: string } }> {
  const data = await res.json() as { note?: { id?: string } };
  const id = data.note?.id?.trim();
  if (!id) throw new Error('Create note: missing id');
  return { note: { id } };
}

export async function updateNote(id: string, patch: Record<string, unknown>): Promise<Note> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await readError(res);
  const result = await res.json() as { note: Note };
  return result.note;
}

export async function fetchNote(id: string): Promise<Note> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`);
  if (!res.ok) throw await readError(res);
  const result = await res.json() as { note: Note };
  return result.note;
}

export async function deleteNote(id: string): Promise<void> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw await readError(res);
}

export async function requestNoteAiEdit(id: string, request: NoteAiEditRequest): Promise<NoteAiEditResult> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}/ai/edit`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<NoteAiEditResult>;
}

export async function syncNote(request: NoteSyncRequest): Promise<NoteSyncResult> {
  const res = await apiFetch('/api/notes/sync', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<NoteSyncResult>;
}

// ── Task / Open / Move ─────────────────────────────────────────────

export async function createTask(
  title: string,
  options?: { dueAt?: number; priority?: 'high' | 'medium' | 'low'; sourceSessionKey?: string; sourceNoteId?: string; groupId?: string },
): Promise<{ note: Note }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes/task', {
    method: 'POST',
    body: JSON.stringify({ title, channel: 'app', platform, ...options }),
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}

export async function toggleTaskDone(noteId: string): Promise<{ note: Note }> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/toggle-done`, {
    method: 'POST',
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}

export async function recordNoteOpen(noteId: string): Promise<void> {
  await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/open`, { method: 'POST' });
}

export async function moveNoteToGroup(noteId: string, groupId: string | null): Promise<{ note: Note }> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
    method: 'POST',
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}
