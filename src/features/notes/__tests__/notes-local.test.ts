import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../../query/notes';
import type { NoteBlock } from '../note-blocks';

const memory = new Map<string, string>();
const syncNoteMock = vi.hoisted(() => vi.fn());

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
  syncNote: syncNoteMock,
}));

import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
} from '../notes-local';

function createNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    kind: 'thought',
    status: 'inbox',
    text: '旧内容',
    createdAt: 1,
    updatedAt: 1,
    capturedVia: { channel: 'app' },
    remoteVersion: 2,
    ...overrides,
  };
}

function paragraph(id: string, text: string): NoteBlock {
  return {
    id,
    type: 'paragraph',
    text,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('notes-local', () => {
  beforeEach(() => {
    memory.clear();
    syncNoteMock.mockReset();
  });

  it('stores local edits as pending snapshots and operations', () => {
    const blocks = [paragraph('block-1', '本地编辑')];

    const snapshot = saveLocalNoteEdit(createNote(), blocks);

    expect(snapshot).toMatchObject({
      id: 'note-1',
      text: '本地编辑',
      localVersion: 1,
      syncState: 'pending',
    });
    expect(readLocalNote('note-1')).toMatchObject({ text: '本地编辑', syncState: 'pending' });
  });

  it('flushes pending operations through syncNote and marks snapshot synced', async () => {
    const blocks = [paragraph('block-1', '同步内容')];
    saveLocalNoteEdit(createNote(), blocks);
    syncNoteMock.mockResolvedValueOnce({
      conflict: false,
      note: createNote({ text: '同步内容', blocks, localVersion: 1, remoteVersion: 3 }),
    });

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(1);
    expect(syncNoteMock).toHaveBeenCalledWith({
      noteId: 'note-1',
      blocks,
      text: '同步内容',
      localVersion: 1,
      baseRemoteVersion: 2,
    });
    expect(readLocalNote('note-1')).toMatchObject({
      text: '同步内容',
      remoteVersion: 3,
      syncState: 'synced',
    });
  });

  it('keeps failed operations pending and marks snapshot failed', async () => {
    saveLocalNoteEdit(createNote(), [paragraph('block-1', '失败内容')]);
    syncNoteMock.mockRejectedValueOnce(new Error('network'));

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(0);
    expect(readLocalNote('note-1')).toMatchObject({ syncState: 'failed' });
  });
});
