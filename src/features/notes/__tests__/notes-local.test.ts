import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyDocument,
  documentFromBlocks,
  documentToBlocks,
  emptyParagraphBlock,
} from '../blocks/convert/block-serialize';
import type { Note, NoteBlock } from '../../../query/notes';
import { readCachedLinkIndex, writeCachedLinkIndex } from '../../../query/note-link-index';

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
  applyNoteServerVersion,
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  saveLocalMarkdownNoteEdit,
  scheduleNoteEditSync,
  writeLocalNote,
} from '../notes-local';

function createNote(overrides: Partial<Note> = {}): Note {
  const blocks = overrides.blocks ?? [emptyParagraphBlock()];
  return {
    id: 'note-1',
    kind: 'thought',
    status: 'inbox',
    blocks,
    text: '',
    createdAt: 1,
    updatedAt: 1,
    capturedVia: { channel: 'app' },
    remoteVersion: 2,
    ...overrides,
  };
}

function paragraphBlocks(text: string): NoteBlock[] {
  return [{
    id: 'block_1',
    type: 'paragraph',
    text,
    parentId: null,
    childIds: [],
    createdAt: 1,
    updatedAt: 1,
  }];
}

describe('notes-local', () => {
  beforeEach(() => {
    memory.clear();
    syncNoteMock.mockReset();
    updateNoteMock.mockReset();
  });

  it('stores local edits as pending snapshots and operations', () => {
    writeCachedLinkIndex({
      getString: (key) => memory.get(key),
      set: (key, value) => memory.set(key, String(value)),
      delete: (key) => memory.delete(key),
    }, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1);
    const document = documentFromBlocks(paragraphBlocks('本地编辑'));

    const snapshot = saveLocalNoteEdit(createNote(), document);

    expect(snapshot).toMatchObject({
      id: 'note-1',
      text: '本地编辑',
      localVersion: 1,
      syncState: 'pending',
    });
    expect(readLocalNote('note-1')?.document?.rootIds).toHaveLength(1);
    expect(readCachedLinkIndex({
      getString: (key) => memory.get(key),
      set: (key, value) => memory.set(key, String(value)),
      delete: (key) => memory.delete(key),
    })).toBeNull();
  });

  it('skips write when document is unchanged and synced', () => {
    const document = documentFromBlocks(paragraphBlocks('same'));
    const note = createNote({ blocks: documentToBlocks(document) });
    writeLocalNote({
      ...note,
      document,
      localVersion: 1,
      syncState: 'synced',
    });

    const snapshot = saveLocalNoteEdit(note, document);
    expect(snapshot?.localVersion).toBe(1);
  });

  it('flushes pending sync operations', async () => {
    syncNoteMock.mockResolvedValue({
      conflict: false,
      note: createNote({ text: 'synced', blocks: paragraphBlocks('synced') }),
    });

    const document = documentFromBlocks(paragraphBlocks('pending sync'));
    saveLocalNoteEdit(createNote(), document);
    scheduleNoteEditSync();

    const flushed = await flushPendingNoteOperations();
    expect(flushed).toBeGreaterThanOrEqual(0);
    expect(syncNoteMock).toHaveBeenCalled();
  });

  it('applies server version to local snapshot', () => {
    const document = createEmptyDocument();
    writeLocalNote({
      ...createNote(),
      document,
      localVersion: 1,
      syncState: 'synced',
      remoteVersion: 1,
    });

    const next = applyNoteServerVersion('note-1', { remoteVersion: 5 });
    expect(next?.remoteVersion).toBe(5);
  });

  it('stores markdown edits as pending snapshots and operations', async () => {
    const testStorage = {
      getString: (key: string) => memory.get(key),
      set: (key: string, value: string | number | boolean) => memory.set(key, String(value)),
      delete: (key: string) => memory.delete(key),
    };
    writeCachedLinkIndex(testStorage, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1);
    syncNoteMock.mockResolvedValue({
      conflict: false,
      note: createNote({ markdown: '# Synced', title: 'Synced' }),
    });
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
    expect(readLocalNote('note-1')?.document).toBeUndefined();
    expect(readCachedLinkIndex(testStorage)).toBeNull();

    await flushPendingNoteOperations();
    expect(syncNoteMock).toHaveBeenCalledWith({
      noteId: 'note-1',
      markdown: '# Local',
      localVersion: 1,
      baseRemoteVersion: 2,
    });
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', { title: 'Local', tags: ['ai'], status: 'processed' });
  });

  it('syncs cleared markdown note titles as explicit metadata updates', async () => {
    syncNoteMock.mockResolvedValue({
      conflict: false,
      note: createNote({ markdown: '# Local', title: 'Old' }),
    });
    updateNoteMock.mockResolvedValue(createNote({ markdown: '# Local', title: undefined }));

    const snapshot = saveLocalMarkdownNoteEdit(createNote({ markdown: '# Old', title: 'Old' }), {
      markdown: '# Local',
      title: undefined,
    });

    expect(snapshot.title).toBeUndefined();

    await flushPendingNoteOperations();
    expect(updateNoteMock).toHaveBeenCalledWith('note-1', { title: null });
  });

  it('dedupes pending markdown edits for the same note', async () => {
    syncNoteMock.mockResolvedValue({
      conflict: false,
      note: createNote({ markdown: '# Final' }),
    });

    const note = createNote({ markdown: '# Old' });
    saveLocalMarkdownNoteEdit(note, { markdown: '# First' });
    saveLocalMarkdownNoteEdit(note, { markdown: '# Final' });

    await flushPendingNoteOperations();

    expect(syncNoteMock).toHaveBeenCalledTimes(1);
    expect(syncNoteMock).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '# Final',
      localVersion: 2,
    }));
  });
});
