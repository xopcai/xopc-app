import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../../query/notes';

const memory = new Map<string, string>();
const updateNoteMock = vi.hoisted(() => vi.fn());
const uploadNoteMediaMock = vi.hoisted(() => vi.fn());

vi.mock('../../../storage/mmkv', () => ({
  storage: {
    getString: (key: string) => memory.get(key),
    set: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    delete: (key: string) => {
      memory.delete(key);
    },
  },
}));

vi.mock('../../../query/notes', () => ({
  updateNote: updateNoteMock,
  uploadNoteMedia: uploadNoteMediaMock,
}));

import {
  discardLocalNoteState,
  flushPendingNoteOperations,
  getPendingEditCount,
  saveLocalMarkdownNoteEdit,
  scheduleNoteEditSync,
  writeLocalNote,
} from '../notes-local';
import {
  createLocalNoteAttachment,
  parseLocalNoteAttachmentRef,
  readLocalNoteAttachment,
} from '../notes-local-attachments';

function createNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    kind: 'thought',
    status: 'inbox',
    markdown: '',
    text: '',
    createdAt: 1,
    updatedAt: 1,
    capturedVia: { channel: 'app' },
    remoteVersion: 2,
    ...overrides,
  };
}

describe('notes-local', () => {
  beforeEach(() => {
    memory.clear();
    updateNoteMock.mockReset();
    uploadNoteMediaMock.mockReset();
  });

  it('stores markdown edits as pending snapshots and operations', () => {
    const snapshot = saveLocalMarkdownNoteEdit(createNote(), { markdown: '本地编辑' });

    expect(snapshot).toMatchObject({
      id: 'note-1',
      markdown: '本地编辑',
      text: '本地编辑',
      localVersion: 1,
      syncState: 'pending',
    });
  });

  it('skips write when markdown is unchanged and synced', () => {
    const note = createNote({ markdown: 'same' });
    writeLocalNote({
      ...note,
      localVersion: 1,
      syncState: 'synced',
    });

    const snapshot = saveLocalMarkdownNoteEdit(note, { markdown: 'same' });
    expect(snapshot?.localVersion).toBe(1);
  });

  it('flushes pending sync operations', async () => {
    updateNoteMock.mockResolvedValue(createNote({ markdown: 'synced', text: 'synced' }));

    saveLocalMarkdownNoteEdit(createNote(), { markdown: 'pending sync' });
    scheduleNoteEditSync();

    const flushed = await flushPendingNoteOperations();
    expect(flushed).toBeGreaterThanOrEqual(0);
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', { markdown: 'pending sync' });
  });

  it('stores markdown edits as pending snapshots and operations', async () => {
    updateNoteMock.mockResolvedValue(createNote({ markdown: '# Local', title: 'Local' }));

    const snapshot = saveLocalMarkdownNoteEdit(createNote({ markdown: '# Old', title: 'Old' }), {
      markdown: '# Local',
      title: 'Local',
      tags: ['ai'],
      status: 'processed',
    });

    expect(snapshot).toMatchObject({
      id: 'note-1',
      title: 'Local',
      tags: ['ai'],
      status: 'processed',
      markdown: '# Local',
      text: '# Local',
      localVersion: 1,
      syncState: 'pending',
    });

    await flushPendingNoteOperations();
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', {
      markdown: '# Local',
      title: 'Local',
      tags: ['ai'],
      status: 'processed',
    });
  });

  it('syncs cleared markdown note titles as explicit metadata updates', async () => {
    updateNoteMock.mockResolvedValue(createNote({ markdown: '# Local', title: undefined }));

    const snapshot = saveLocalMarkdownNoteEdit(createNote({ markdown: '# Old', title: 'Old' }), {
      markdown: '# Local',
      title: undefined,
    });

    expect(snapshot.title).toBeUndefined();

    await flushPendingNoteOperations();
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', { markdown: '# Local', title: null });
  });

  it('dedupes pending markdown edits for the same note', async () => {
    updateNoteMock.mockResolvedValue(createNote({ markdown: '# Final' }));

    const note = createNote({ markdown: '# Old' });
    saveLocalMarkdownNoteEdit(note, { markdown: '# First' });
    saveLocalMarkdownNoteEdit(note, { markdown: '# Final' });

    await flushPendingNoteOperations();

    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', expect.objectContaining({
      markdown: '# Final',
    }));
  });

  it('uploads local attachments before syncing markdown and replaces local refs', async () => {
    uploadNoteMediaMock.mockResolvedValue({
      id: 'remote-img',
      type: 'image',
      mimeType: 'image/png',
      fileName: 'local.png',
      size: 3,
      relativePath: 'inbound/n/local.png',
    });
    updateNoteMock.mockResolvedValue(createNote({
      markdown: '![local](xopc-attachment://notes/note-1/remote-img)',
      attachments: [{
        id: 'remote-img',
        type: 'image',
        mimeType: 'image/png',
        fileName: 'local.png',
        size: 3,
        relativePath: 'inbound/n/local.png',
      }],
    }));

    const local = createLocalNoteAttachment('note-1', {
      type: 'image',
      name: 'local.png',
      mimeType: 'image/png',
      size: 3,
      content: 'YWJj',
    });
    const parsed = parseLocalNoteAttachmentRef(local.src);
    expect(parsed).not.toBeNull();

    saveLocalMarkdownNoteEdit(createNote(), { markdown: `![local](${local.src})` });
    await flushPendingNoteOperations();

    expect(uploadNoteMediaMock).toHaveBeenCalledWith('note-1', {
      localUri: undefined,
      name: 'local.png',
      mimeType: 'image/png',
      content: 'YWJj',
    });
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', {
      markdown: '![local](xopc-attachment://notes/note-1/remote-img)',
    });
    expect(readLocalNoteAttachment('note-1', parsed!.attachmentId)).toBeNull();
  });

  it('keeps local attachments when the gateway update does not commit uploaded media', async () => {
    uploadNoteMediaMock.mockResolvedValue({
      id: 'remote-img',
      type: 'image',
      mimeType: 'image/png',
      fileName: 'local.png',
      size: 3,
      relativePath: 'inbound/n/local.png',
    });
    updateNoteMock.mockResolvedValue(createNote({
      markdown: '![local](xopc-attachment://notes/note-1/remote-img)',
      attachments: [],
    }));

    const local = createLocalNoteAttachment('note-1', {
      type: 'image',
      name: 'local.png',
      mimeType: 'image/png',
      size: 3,
      content: 'YWJj',
    });
    const parsed = parseLocalNoteAttachmentRef(local.src);
    expect(parsed).not.toBeNull();

    saveLocalMarkdownNoteEdit(createNote(), { markdown: `![local](${local.src})` });
    await flushPendingNoteOperations();

    expect(updateNoteMock).toHaveBeenCalledWith('note-1', {
      markdown: '![local](xopc-attachment://notes/note-1/remote-img)',
    });
    expect(readLocalNoteAttachment('note-1', parsed!.attachmentId)).not.toBeNull();
    expect(getPendingEditCount()).toBe(1);
  });

  it('drops stale pending edits when the server reports the note is missing', async () => {
    const missing = new Error('Note not found') as Error & { status: number; code: string };
    missing.status = 404;
    missing.code = 'note_not_found';
    updateNoteMock.mockRejectedValue(missing);

    saveLocalMarkdownNoteEdit(createNote(), { markdown: '# Deleted elsewhere' });

    expect(getPendingEditCount()).toBe(1);

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(1);
    expect(getPendingEditCount()).toBe(0);
    expect(memory.get('notes:local:item:note-1')).toBeUndefined();
    expect(memory.get('notes:edit:ids')).toBe('[]');
  });

  it('discards local note state and queued edits together', () => {
    const local = createLocalNoteAttachment('note-1', {
      type: 'image',
      name: 'draft.png',
      mimeType: 'image/png',
      size: 3,
      content: 'YWJj',
    });
    const parsed = parseLocalNoteAttachmentRef(local.src);
    expect(parsed).not.toBeNull();
    saveLocalMarkdownNoteEdit(createNote(), { markdown: '# Draft' });

    expect(getPendingEditCount()).toBe(1);

    discardLocalNoteState('note-1');

    expect(getPendingEditCount()).toBe(0);
    expect(memory.get('notes:local:item:note-1')).toBeUndefined();
    expect(readLocalNoteAttachment('note-1', parsed!.attachmentId)).toBeNull();
  });
});
