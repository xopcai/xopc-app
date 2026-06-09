import { Platform } from 'react-native';

import { apiFetch } from '../api/client';
import type { NoteAiPatch, NoteBlock } from '../features/notes/note-blocks';

export type NoteKind = 'thought' | 'todo' | 'voice' | 'media' | 'bookmark' | 'mixed';
export type NoteStatus = 'inbox' | 'processed' | 'archived' | 'trashed';

export interface NoteIndexEntry {
  id: string;
  kind: NoteKind;
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
  snippet?: string;
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
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');
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
  return res.json() as Promise<{ note: { id: string } }>;
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
