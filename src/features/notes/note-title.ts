import type { Note, NoteIndexEntry } from '../../query/notes';

import { blocksToPlainText, noteToBlocks, type NoteBlock } from './note-blocks';

const DEFAULT_LIST_TITLE_MAX = 48;
const DEFAULT_LIST_SNIPPET_MAX = 160;

function truncateText(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const chars = Array.from(normalized);
  if (chars.length <= maxLen) return normalized;
  return `${chars.slice(0, maxLen).join('')}…`;
}

/** Plain body text for list/search rows; prefers index snippet, then cached blocks/text. */
export function resolvePlainTextFromEntry(
  entry: Pick<NoteIndexEntry, 'snippet'>,
  cachedNote?: Pick<Note, 'text' | 'blocks'> | null,
): string {
  const snippet = entry.snippet?.trim();
  if (snippet) return snippet;

  if (cachedNote) {
    const fromBlocks = blocksToPlainText(noteToBlocks(cachedNote)).trim();
    if (fromBlocks) return fromBlocks;
    const text = cachedNote.text?.trim();
    if (text) return text;
  }

  return '';
}

export function deriveNoteTitle(
  blocks: NoteBlock[],
  maxLen = 10,
  fallback = 'Untitled',
): string {
  const plain = blocksToPlainText(blocks).replace(/\s+/g, ' ').trim();
  if (!plain) return fallback;
  return Array.from(plain).slice(0, maxLen).join('');
}

export function resolveDisplayTitle(
  note: Pick<Note, 'title' | 'text' | 'blocks'> | undefined,
  blocks: NoteBlock[],
  fallback: string,
  maxLen = 10,
): string {
  const explicitTitle = note?.title?.trim();
  if (explicitTitle) return explicitTitle;
  return deriveNoteTitle(blocks, maxLen, fallback);
}

/** Title for list/index rows; falls back to cached note blocks when the index is stale. */
export function resolveNoteListTitle(
  entry: Pick<NoteIndexEntry, 'title' | 'snippet'>,
  fallback: string,
  cachedNote?: Pick<Note, 'title' | 'text' | 'blocks'> | null,
  maxLen = 10,
): string {
  const explicitTitle = entry.title?.trim();
  if (explicitTitle) return explicitTitle;

  if (cachedNote) {
    const cachedTitle = cachedNote.title?.trim();
    if (cachedTitle) return cachedTitle;
    const derived = deriveNoteTitle(noteToBlocks(cachedNote), maxLen, '');
    if (derived) return derived;
  }

  const plain = resolvePlainTextFromEntry(entry, cachedNote);
  if (plain) return truncateText(plain, maxLen);

  return fallback;
}

export function resolveNoteListSnippet(
  entry: Pick<NoteIndexEntry, 'snippet'>,
  cachedNote?: Pick<Note, 'text' | 'blocks'> | null,
  maxLen = DEFAULT_LIST_SNIPPET_MAX,
): string {
  return truncateText(resolvePlainTextFromEntry(entry, cachedNote), maxLen);
}

export interface NoteListPreview {
  title: string;
  subtitle: string | null;
}

/** Title + optional subtitle for note list cards. */
export function resolveNoteListPreview(
  entry: Pick<NoteIndexEntry, 'title' | 'snippet'>,
  options: {
    untitled: string;
    cachedNote?: Pick<Note, 'title' | 'text' | 'blocks'> | null;
    titleMaxLen?: number;
    snippetMaxLen?: number;
  },
): NoteListPreview {
  const titleMaxLen = options.titleMaxLen ?? DEFAULT_LIST_TITLE_MAX;
  const snippetMaxLen = options.snippetMaxLen ?? DEFAULT_LIST_SNIPPET_MAX;
  const cached = options.cachedNote;

  const explicitTitle = entry.title?.trim() || cached?.title?.trim() || '';
  const plain = resolvePlainTextFromEntry(entry, cached);

  if (explicitTitle) {
    const subtitle = plain && plain !== explicitTitle
      ? truncateText(plain, snippetMaxLen)
      : null;
    return { title: explicitTitle, subtitle };
  }

  if (plain) {
    return {
      title: truncateText(plain, titleMaxLen),
      subtitle: null,
    };
  }

  return { title: options.untitled, subtitle: null };
}

/** Derive list snippet from index fields when the API omits it (common for block notes). */
export function normalizeNoteIndexEntry(
  raw: NoteIndexEntry & { text?: string; blocks?: NoteBlock[] },
): NoteIndexEntry {
  if (raw.snippet?.trim()) return raw;
  const plain =
    raw.text?.trim() ||
    (raw.blocks?.length ? blocksToPlainText(raw.blocks).trim() : '');
  if (!plain) return raw;
  const { text: _text, blocks: _blocks, ...entry } = raw;
  return { ...entry, snippet: plain.slice(0, 200) };
}

export function countNoteCharacters(blocks: NoteBlock[]): number {
  return Array.from(blocksToPlainText(blocks)).length;
}
