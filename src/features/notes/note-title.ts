import { blocksToPlainText, type NoteBlock } from './note-blocks';

export function deriveNoteTitle(
  blocks: NoteBlock[],
  maxLen = 10,
  fallback = 'Untitled',
): string {
  const plain = blocksToPlainText(blocks).replace(/\s+/g, ' ').trim();
  if (!plain) return fallback;
  return Array.from(plain).slice(0, maxLen).join('');
}

export function countNoteCharacters(blocks: NoteBlock[]): number {
  return Array.from(blocksToPlainText(blocks)).length;
}
