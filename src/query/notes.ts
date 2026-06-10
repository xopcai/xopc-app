import { Platform } from 'react-native';

import { apiFetch } from '../api/client';
import { notesListResponseSchema } from '../config/schema';
import { normalizeNoteIndexEntry } from '../features/notes/note-title';

export type NotePatchOperation =
  | { type: 'replaceRange'; from: number; to: number; markdown: string }
  | { type: 'insertAt'; offset: number; markdown: string }
  | { type: 'replaceSection'; sectionId: string; markdown: string }
  | { type: 'appendSection'; heading: string; markdown: string }
  | { type: 'prependSection'; heading: string; markdown: string }
  | { type: 'updateFrontmatter'; patch: Record<string, unknown> }
  | { type: 'updateMetadata'; title?: string | null; tags?: string[]; status?: NoteStatus }
  // Deprecated editor-internal variants kept only so old block-editor modules typecheck while the app migrates.
  | { type: 'replaceBlocks'; blocks: NoteBlock[] }
  | { type: 'insertBlocksAfter'; afterBlockId: string; blocks: NoteBlock[] }
  | { type: 'updateBlock'; blockId: string; patch: Partial<NoteBlock> };

export interface NoteAiPatch {
  id: string;
  summary: string;
  operations: NotePatchOperation[];
}

export type NoteKind = 'thought' | 'todo' | 'voice' | 'media' | 'bookmark' | 'mixed' | 'task';
export type NoteStatus = 'inbox' | 'processed' | 'archived' | 'trashed';

export interface NoteTaskMeta {
  done: boolean;
  dueAt?: number;
  priority?: 'high' | 'medium' | 'low';
  sourceSessionKey?: string;
  sourceNoteId?: string;
}

export type NoteTextMarkType = 'bold' | 'italic' | 'code' | 'link';

export interface NoteTextMark {
  id: string;
  type: NoteTextMarkType;
  from: number;
  to: number;
  href?: string;
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

export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'callout'
  | 'toggle'
  | 'code'
  | 'divider'
  | 'image'
  | 'aiSuggestion';

interface BaseNoteBlock {
  id: string;
  type: NoteBlockType;
  parentId: string | null;
  childIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TextNoteBlock extends BaseNoteBlock {
  type: 'paragraph' | 'heading' | 'bulletList' | 'numberedList' | 'quote' | 'callout' | 'toggle' | 'code' | 'aiSuggestion';
  text: string;
  level?: 1 | 2 | 3;
  indent?: number;
  collapsed?: boolean;
  marks?: NoteTextMark[];
}

export interface TodoNoteBlock extends BaseNoteBlock {
  type: 'todo';
  text: string;
  checked: boolean;
  marks?: NoteTextMark[];
}

export interface DividerNoteBlock extends BaseNoteBlock {
  type: 'divider';
}

export interface ImageNoteBlock extends BaseNoteBlock {
  type: 'image';
  attachmentId: string;
  alt?: string;
  width?: number;
}

export type NoteBlock = TextNoteBlock | TodoNoteBlock | DividerNoteBlock | ImageNoteBlock;

export interface Note {
  id: string;
  title?: string;
  kind: NoteKind;
  status: NoteStatus;
  markdown?: string;
  /** Deprecated editor-internal fields. Do not send to gateway. */
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
  limit: number;
  offset: number;
  hasMore: boolean;
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
  markdown?: string;
  blocks?: NoteBlock[];
  context?: {
    type: 'selection' | 'section' | 'block' | 'note';
    range: { start: number; end: number };
    markdown: string;
    heading?: string;
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    sectionId?: string;
    blockType?: string;
  };
}

export interface NoteAiEditResult {
  message: string;
  patch: NoteAiPatch;
}

export interface NoteSyncRequest {
  noteId: string;
  markdown: string;
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
  const raw = await res.json();
  const parsed = notesListResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid notes list response');
  const limit = parsed.data.limit ?? query?.limit ?? 20;
  const offset = parsed.data.offset ?? query?.offset ?? 0;
  const items = (parsed.data.items as NoteIndexEntry[]).map(normalizeNoteIndexEntry);
  const hasMore = parsed.data.hasMore ?? offset + items.length < parsed.data.total;
  return { items, total: parsed.data.total, limit, offset, hasMore };
}

export async function quickCaptureNote(markdown: string): Promise<{ note: { id: string } }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes/quick-capture', {
    method: 'POST',
    body: JSON.stringify({ text: markdown, channel: 'app', platform }),
  });
  if (!res.ok) throw await readError(res);
  return readCreatedNote(res);
}

export type CaptureNoteAttachment = {
  mimeType: string;
  fileName: string;
  localUri?: string;
  data?: string;
  duration?: number;
};

export interface CaptureNoteInput {
  markdown?: string;
  text?: string;
  kind?: NoteKind;
  attachments?: CaptureNoteAttachment[];
}

async function appendCaptureAttachment(form: FormData, attachment: CaptureNoteAttachment): Promise<void> {
  if (attachment.localUri && Platform.OS !== 'web') {
    form.append('file', { uri: attachment.localUri, name: attachment.fileName, type: attachment.mimeType } as unknown as Blob);
  } else if (attachment.data) {
    const blob = await fetch(`data:${attachment.mimeType};base64,${attachment.data.replace(/\s/g, '')}`).then((res) => res.blob());
    form.append('file', blob, attachment.fileName);
  } else {
    throw new Error('Create note media: missing file content');
  }
  if (attachment.duration != null) form.append('duration', String(attachment.duration));
}

async function createNoteJson(input: CaptureNoteInput): Promise<{ note: { id: string } }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ markdown: (input.markdown ?? input.text)?.trim() || undefined, kind: input.kind, channel: 'app', platform }),
  });
  if (!res.ok) throw await readError(res);
  return readCreatedNote(res);
}

export async function captureNote(input: CaptureNoteInput): Promise<{ note: { id: string } }> {
  const trimmedMarkdown = (input.markdown ?? input.text)?.trim() ?? '';
  if (!input.attachments?.length) {
    if (!input.kind && trimmedMarkdown) return quickCaptureNote(trimmedMarkdown);
    return createNoteJson(input);
  }

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const [firstAttachment, ...restAttachments] = input.attachments;
  const form = new FormData();
  form.append('markdown', trimmedMarkdown);
  if (input.kind) form.append('kind', input.kind);
  form.append('channel', 'app');
  form.append('platform', platform);
  await appendCaptureAttachment(form, firstAttachment);

  const res = await apiFetch('/api/notes', { method: 'POST', body: form, timeoutMs: 30_000 });
  if (!res.ok) throw await readError(res);
  const { note } = await readCreatedNote(res);

  for (const attachment of restAttachments) {
    await uploadNoteMedia(note.id, {
      localUri: attachment.localUri,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      content: attachment.data,
      durationMillis: attachment.duration != null ? attachment.duration * 1000 : undefined,
    });
  }
  return { note };
}

export async function createBlankNote(): Promise<{ note: { id: string } }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ channel: 'app', platform, markdown: '' }),
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
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) throw await readError(res);
  const result = await res.json() as { note: Note };
  return result.note;
}

export async function uploadNoteMedia(
  noteId: string,
  input: { localUri?: string; name: string; mimeType: string; content?: string; durationMillis?: number },
): Promise<NoteAttachment> {
  const form = new FormData();
  if (input.localUri && Platform.OS !== 'web') {
    form.append('file', { uri: input.localUri, name: input.name, type: input.mimeType } as unknown as Blob);
  } else if (input.content) {
    const blob = await fetch(`data:${input.mimeType};base64,${input.content.replace(/\s/g, '')}`).then((res) => res.blob());
    form.append('file', blob, input.name);
  } else {
    throw new Error('Upload media: missing file content');
  }
  if (input.durationMillis != null) form.append('duration', String(Math.round(input.durationMillis / 1000)));

  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/media`, { method: 'POST', body: form, timeoutMs: 30_000 });
  if (!res.ok) throw await readError(res);
  const result = await res.json() as { attachment?: NoteAttachment };
  if (!result.attachment?.id) throw new Error('Upload media: invalid response');
  return result.attachment;
}

export async function fetchNote(id: string): Promise<Note> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`);
  if (!res.ok) throw await readError(res);
  const result = await res.json() as { note: Note };
  return result.note;
}

export async function deleteNote(id: string): Promise<void> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await readError(res);
}

export async function requestNoteAiEdit(id: string, request: NoteAiEditRequest): Promise<NoteAiEditResult> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(id)}/ai/edit`, { method: 'POST', body: JSON.stringify(request) });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<NoteAiEditResult>;
}

export async function syncNote(request: NoteSyncRequest): Promise<NoteSyncResult> {
  const res = await apiFetch('/api/notes/sync', { method: 'POST', body: JSON.stringify(request) });
  const data = await res.json().catch(() => ({})) as Partial<NoteSyncResult> & { error?: string; message?: string };
  if (res.status === 409 && data.note) return { conflict: true, note: data.note };
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  if (!data.note) throw new Error('Invalid note sync response');
  return { conflict: Boolean(data.conflict), note: data.note };
}

export async function createTask(
  title: string,
  options?: { dueAt?: number; priority?: 'high' | 'medium' | 'low'; sourceSessionKey?: string; sourceNoteId?: string; groupId?: string },
): Promise<{ note: Note }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await apiFetch('/api/notes/task', { method: 'POST', body: JSON.stringify({ title, channel: 'app', platform, ...options }) });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}

export async function toggleTaskDone(noteId: string): Promise<{ note: Note }> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/toggle-done`, { method: 'POST' });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}

export async function recordNoteOpen(noteId: string): Promise<Note | null> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/open`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({})) as { note?: Note };
  return data.note ?? null;
}

export async function moveNoteToGroup(noteId: string, groupId: string | null): Promise<{ note: Note }> {
  const res = await apiFetch(`/api/notes/${encodeURIComponent(noteId)}/move`, { method: 'POST', body: JSON.stringify({ groupId }) });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<{ note: Note }>;
}
