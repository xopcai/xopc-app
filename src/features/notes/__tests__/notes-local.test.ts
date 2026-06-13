import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../../query/notes';
import type { NoteBlock } from '../note-blocks';

const memory = new Map<string, string>();
const syncNoteMock = vi.hoisted(() => vi.fn());
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
  syncNote: syncNoteMock,
  updateNote: updateNoteMock,
}));

import {
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  writeLocalNote,
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
    updateNoteMock.mockReset();
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

  it('flushes pending attachments and clears pendingAttachments on success', async () => {
    const blocks = [paragraph('block-1', '带附件')];
    const attachment = {
      id: 'att-1',
      type: 'image' as const,
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 1200,
      content: 'YmFzZTY0',
      localUri: 'file:///photo.jpg',
    };
    saveLocalNoteEdit(createNote(), blocks, [attachment]);
    syncNoteMock.mockResolvedValueOnce({
      conflict: false,
      note: createNote({ text: '带附件', blocks, localVersion: 1, remoteVersion: 3 }),
    });
    updateNoteMock.mockResolvedValueOnce(
      createNote({
        text: '带附件',
        blocks,
        localVersion: 1,
        remoteVersion: 4,
        attachments: [{
          id: 'att-1',
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          size: 1200,
          relativePath: 'inbound/n/photo.jpg',
        }],
      }),
    );

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(1);
    expect(updateNoteMock).toHaveBeenCalled();
    const snapshot = readLocalNote('note-1');
    expect(snapshot).toMatchObject({
      syncState: 'synced',
      remoteVersion: 4,
    });
    expect(snapshot?.pendingAttachments).toBeUndefined();
  });

  it('retries sync once when the server reports a version conflict', async () => {
    const blocks = [paragraph('block-1', '冲突后同步')];
    saveLocalNoteEdit(createNote(), blocks);
    syncNoteMock
      .mockResolvedValueOnce({
        conflict: true,
        note: createNote({ text: '服务端', blocks, localVersion: 0, remoteVersion: 3 }),
      })
      .mockResolvedValueOnce({
        conflict: false,
        note: createNote({ text: '冲突后同步', blocks, localVersion: 1, remoteVersion: 4 }),
      });

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(1);
    expect(syncNoteMock).toHaveBeenCalledTimes(2);
    expect(syncNoteMock.mock.calls[1]?.[0]).toMatchObject({ baseRemoteVersion: 3 });
    expect(readLocalNote('note-1')).toMatchObject({
      text: '冲突后同步',
      remoteVersion: 4,
      syncState: 'synced',
    });
  });

  it('coalesces rapid saves into one pending sync operation', async () => {
    saveLocalNoteEdit(createNote(), [paragraph('block-1', '第一版')]);
    saveLocalNoteEdit(createNote(), [paragraph('block-1', '最终版')]);
    syncNoteMock.mockResolvedValueOnce({
      conflict: false,
      note: createNote({ text: '最终版', localVersion: 2, remoteVersion: 3 }),
    });

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(1);
    expect(syncNoteMock).toHaveBeenCalledTimes(1);
    expect(syncNoteMock.mock.calls[0]?.[0]).toMatchObject({
      text: '最终版',
      localVersion: 2,
      baseRemoteVersion: 2,
    });
  });

  it('skips enqueue when content matches the synced snapshot', () => {
    const blocks = [paragraph('block-1', '已同步')];
    writeLocalNote({
      ...createNote(),
      blocks,
      text: '已同步',
      localVersion: 0,
      syncState: 'synced',
    });

    const snapshot = saveLocalNoteEdit(createNote(), blocks);

    expect(snapshot).toMatchObject({ syncState: 'synced', localVersion: 0 });
  });

  it('keeps failed operations pending and marks snapshot failed', async () => {
    saveLocalNoteEdit(createNote(), [paragraph('block-1', '失败内容')]);
    syncNoteMock.mockRejectedValueOnce(new Error('network'));

    const flushed = await flushPendingNoteOperations();

    expect(flushed).toBe(0);
    expect(readLocalNote('note-1')).toMatchObject({ syncState: 'failed' });
  });
});
