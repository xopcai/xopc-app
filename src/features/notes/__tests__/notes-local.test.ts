import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../../query/notes';
import { readCachedLinkIndex, writeCachedLinkIndex } from '../../../query/note-link-index';

const memory = new Map<string, string>();
const updateNoteMock = vi.hoisted(() => vi.fn());

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
}));

import {
  discardLocalNoteState,
  flushPendingNoteOperations,
  getPendingEditCount,
  saveLocalMarkdownNoteEdit,
  scheduleNoteEditSync,
  writeLocalNote,
} from '../notes-local';

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
  });

  it('stores markdown edits as pending snapshots and operations', () => {
    writeCachedLinkIndex({
      getString: (key) => memory.get(key),
      set: (key, value) => memory.set(key, String(value)),
      delete: (key) => memory.delete(key),
    }, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1);

    const snapshot = saveLocalMarkdownNoteEdit(createNote(), { markdown: '本地编辑' });

    expect(snapshot).toMatchObject({
      id: 'note-1',
      markdown: '本地编辑',
      text: '本地编辑',
      localVersion: 1,
      syncState: 'pending',
    });
    expect(readCachedLinkIndex({
      getString: (key) => memory.get(key),
      set: (key, value) => memory.set(key, String(value)),
      delete: (key) => memory.delete(key),
    })).toBeNull();
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
    const testStorage = {
      getString: (key: string) => memory.get(key),
      set: (key: string, value: string | number | boolean) => memory.set(key, String(value)),
      delete: (key: string) => memory.delete(key),
    };
    writeCachedLinkIndex(testStorage, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1);
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
    expect(readCachedLinkIndex(testStorage)).toBeNull();

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
    saveLocalMarkdownNoteEdit(createNote(), { markdown: '# Draft' });

    expect(getPendingEditCount()).toBe(1);

    discardLocalNoteState('note-1');

    expect(getPendingEditCount()).toBe(0);
    expect(memory.get('notes:local:item:note-1')).toBeUndefined();
  });
});
