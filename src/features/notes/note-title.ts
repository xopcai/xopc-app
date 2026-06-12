import type { Note, NoteIndexEntry } from '../../query/notes';

import { blocksToPlainText, noteToBlocks, type NoteBlock } from './note-blocks';

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

  const snippet = entry.snippet?.trim();
  if (snippet) return snippet;

  return fallback;
}

export function countNoteCharacters(blocks: NoteBlock[]): number {
  return Array.from(blocksToPlainText(blocks)).length;
}
