import type { Note, NoteIndexEntry } from '../../query/notes';

export type NoteTagFilter = 'all' | string;

export const NOTE_TAG_PALETTE = [
  { bg: '#FDE68A', fg: '#92400E' },
  { bg: '#BFDBFE', fg: '#1E40AF' },
  { bg: '#BBF7D0', fg: '#166534' },
  { bg: '#FBCFE8', fg: '#9D174D' },
  { bg: '#DDD6FE', fg: '#5B21B6' },
  { bg: '#FECACA', fg: '#991B1B' },
] as const;

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isValidTagName(raw: string): boolean {
  const name = normalizeTagName(raw);
  return name.length > 0 && name.length <= 24;
}

export function getNoteTags(note: Pick<Note | NoteIndexEntry, 'tags'>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of note.tags ?? []) {
    const tag = normalizeTagName(raw);
    if (!isValidTagName(tag) || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function getNotePrimaryTag(note: Pick<Note | NoteIndexEntry, 'tags'>): string | null {
  return getNoteTags(note)[0] ?? null;
}

export function noteHasTag(note: Pick<NoteIndexEntry, 'tags'>, tag: string): boolean {
  return getNoteTags(note).includes(tag);
}

export function noteMatchesTagFilter(
  note: Pick<NoteIndexEntry, 'tags'>,
  filter: NoteTagFilter,
): boolean {
  if (filter === 'all') return true;
  return noteHasTag(note, filter);
}

export function getTagPaletteIndex(tag: string, tags: readonly string[]): number {
  const index = tags.indexOf(tag);
  return index >= 0 ? index : 0;
}

export function getTagColors(tag: string | null, tags: readonly string[]) {
  if (!tag) return NOTE_TAG_PALETTE[0];
  const index = getTagPaletteIndex(tag, tags);
  return NOTE_TAG_PALETTE[index % NOTE_TAG_PALETTE.length];
}

export function collectTagsFromNotes(notes: readonly Pick<NoteIndexEntry, 'tags'>[]): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const note of notes) {
    for (const tag of getNoteTags(note)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      collected.push(tag);
    }
  }
  return collected;
}

export function mergeTagLists(...lists: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const tag = normalizeTagName(raw);
      if (!isValidTagName(tag) || seen.has(tag)) continue;
      seen.add(tag);
      merged.push(tag);
    }
  }
  return merged;
}
