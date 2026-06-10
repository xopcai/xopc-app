import { backlinksForTitle, buildMarkdownLinkIndex, type IndexedOutgoingLink, type MarkdownLinkIndex } from '../features/notes/markdown/markdown-link-index';
import type { KeyValueStorage } from '../storage/mmkv';

import type { Note, NoteIndexEntry, NotesListResult } from './notes';

const LINK_INDEX_PAGE_SIZE = 100;
const NOTE_LINK_INDEX_STORAGE_KEY = 'notes.linkIndex.v1';

export interface NoteLinkIndexFetchers {
  fetchNotesPage: (query: { limit: number; offset: number; sortBy: 'updatedAt'; sortOrder: 'desc' }) => Promise<NotesListResult>;
  fetchNoteById: (id: string) => Promise<Note>;
}

export interface CachedMarkdownLinkIndex {
  builtAt: number;
  index: MarkdownLinkIndex;
}

export function readCachedLinkIndex(storage: KeyValueStorage): CachedMarkdownLinkIndex | null {
  const raw = storage.getString(NOTE_LINK_INDEX_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedMarkdownLinkIndex;
    if (!parsed || typeof parsed.builtAt !== 'number' || !parsed.index?.backlinksByTitle || !parsed.index?.outgoingByNoteId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedLinkIndex(storage: KeyValueStorage, index: MarkdownLinkIndex, builtAt = Date.now()): void {
  storage.set(NOTE_LINK_INDEX_STORAGE_KEY, JSON.stringify({ builtAt, index } satisfies CachedMarkdownLinkIndex));
}

export function deleteCachedLinkIndex(storage: KeyValueStorage): void {
  storage.delete(NOTE_LINK_INDEX_STORAGE_KEY);
}

export async function fetchAllNotesForLinkIndex(
  fetchers: NoteLinkIndexFetchers,
  currentNoteId?: string,
): Promise<Note[]> {
  const entries: NoteIndexEntry[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchers.fetchNotesPage({
      limit: LINK_INDEX_PAGE_SIZE,
      offset,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    entries.push(...page.items);
    if (!page.hasMore) break;
    offset += page.limit;
  }

  const notes = await Promise.all(
    entries
      .filter((entry) => entry.id !== currentNoteId)
      .map((entry) => fetchers.fetchNoteById(entry.id).catch(() => null)),
  );
  return notes.filter((item): item is Note => item != null);
}

export async function loadBacklinksForTitle(
  fetchers: NoteLinkIndexFetchers,
  title: string,
  currentNoteId?: string,
  options: { storage?: KeyValueStorage; maxAgeMs?: number; now?: number } = {},
): Promise<IndexedOutgoingLink[]> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
  if (options.storage) {
    const cached = readCachedLinkIndex(options.storage);
    if (cached && now - cached.builtAt <= maxAgeMs) {
      return backlinksForTitle(cached.index, title).filter((link) => link.sourceNoteId !== currentNoteId);
    }
  }

  const notes = await fetchAllNotesForLinkIndex(fetchers, currentNoteId);
  const index = buildMarkdownLinkIndex(notes);
  if (options.storage) writeCachedLinkIndex(options.storage, index, now);
  return backlinksForTitle(index, title).filter((link) => link.sourceNoteId !== currentNoteId);
}
