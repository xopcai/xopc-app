import { describe, expect, it, vi } from 'vitest';

import { deleteCachedLinkIndex, fetchAllNotesForLinkIndex, loadBacklinksForTitle, readCachedLinkIndex, writeCachedLinkIndex } from '../note-link-index';
import type { Note, NoteIndexEntry, NotesListResult } from '../notes';
import type { KeyValueStorage } from '../../storage/mmkv';

function entry(id: string): NoteIndexEntry {
  return {
    id,
    kind: 'thought',
    status: 'processed',
    createdAt: 1,
    updatedAt: 1,
  };
}

function note(id: string, title: string, markdown: string): Note {
  return {
    id,
    title,
    markdown,
    kind: 'thought',
    status: 'processed',
    createdAt: 1,
    updatedAt: 1,
    capturedVia: { channel: 'test' },
  };
}

function page(items: NoteIndexEntry[], offset: number, hasMore: boolean): NotesListResult {
  return { items, total: 3, limit: 100, offset, hasMore };
}

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => values.set(key, String(value)),
    delete: (key) => values.delete(key),
  };
}

describe('note-link-index query helpers', () => {
  it('loads all note pages, skips current note, and ignores failed detail fetches', async () => {
    const fetchNotesPage = vi.fn()
      .mockResolvedValueOnce(page([entry('a'), entry('current')], 0, true))
      .mockResolvedValueOnce(page([entry('b')], 100, false));
    const fetchNoteById = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('missing');
      return note(id, `Note ${id}`, '');
    });

    await expect(fetchAllNotesForLinkIndex({ fetchNotesPage, fetchNoteById }, 'current')).resolves.toEqual([
      note('a', 'Note a', ''),
    ]);
    expect(fetchNotesPage).toHaveBeenCalledTimes(2);
    expect(fetchNoteById).toHaveBeenCalledWith('a');
    expect(fetchNoteById).toHaveBeenCalledWith('b');
    expect(fetchNoteById).not.toHaveBeenCalledWith('current');
  });

  it('returns exact wiki backlinks for a title', async () => {
    const fetchNotesPage = vi.fn().mockResolvedValue(page([entry('a'), entry('b')], 0, false));
    const fetchNoteById = vi.fn(async (id: string) => (
      id === 'a'
        ? note('a', 'Source A', 'See [[Target Note]]')
        : note('b', 'Source B', 'Mentions Target Note without link')
    ));

    const links = await loadBacklinksForTitle({ fetchNotesPage, fetchNoteById }, 'Target Note');

    expect(links.map((link) => ({ sourceNoteId: link.sourceNoteId, sourceTitle: link.sourceTitle, target: link.target }))).toEqual([
      { sourceNoteId: 'a', sourceTitle: 'Source A', target: 'Target Note' },
    ]);
  });

  it('uses a fresh cached link index before fetching pages', async () => {
    const storage = memoryStorage();
    const index = {
      outgoingByNoteId: {},
      backlinksByTitle: {
        'target note': [{
          sourceNoteId: 'a',
          sourceTitle: 'Source A',
          target: 'Target Note',
          label: 'Target Note',
          range: { start: 0, end: 15 },
        }],
      },
    };
    writeCachedLinkIndex(storage, index, 1000);
    const fetchNotesPage = vi.fn();
    const fetchNoteById = vi.fn();

    const links = await loadBacklinksForTitle({ fetchNotesPage, fetchNoteById }, 'Target Note', undefined, {
      storage,
      now: 1100,
      maxAgeMs: 1000,
    });

    expect(links).toHaveLength(1);
    expect(fetchNotesPage).not.toHaveBeenCalled();
    expect(fetchNoteById).not.toHaveBeenCalled();
  });

  it('rebuilds and writes the cache when cached link index is stale', async () => {
    const storage = memoryStorage();
    writeCachedLinkIndex(storage, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1000);
    const fetchNotesPage = vi.fn().mockResolvedValue(page([entry('a')], 0, false));
    const fetchNoteById = vi.fn(async () => note('a', 'Source A', 'See [[Target Note]]'));

    const links = await loadBacklinksForTitle({ fetchNotesPage, fetchNoteById }, 'Target Note', undefined, {
      storage,
      now: 5000,
      maxAgeMs: 1000,
    });

    expect(links.map((link) => link.sourceNoteId)).toEqual(['a']);
    expect(readCachedLinkIndex(storage)?.builtAt).toBe(5000);
  });

  it('deletes the cached link index', () => {
    const storage = memoryStorage();
    writeCachedLinkIndex(storage, { outgoingByNoteId: {}, backlinksByTitle: {} }, 1000);

    deleteCachedLinkIndex(storage);

    expect(readCachedLinkIndex(storage)).toBeNull();
  });
});
