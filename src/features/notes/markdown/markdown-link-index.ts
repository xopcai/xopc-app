import { extractMarkdownWikiLinks, type MarkdownWikiLink } from './markdown-document';

export interface LinkIndexNote {
  id: string;
  title?: string;
  markdown?: string;
}

export interface IndexedOutgoingLink extends MarkdownWikiLink {
  sourceNoteId: string;
  sourceTitle: string;
}

export interface MarkdownLinkIndex {
  outgoingByNoteId: Record<string, IndexedOutgoingLink[]>;
  backlinksByTitle: Record<string, IndexedOutgoingLink[]>;
}

export function normalizeWikiTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function buildMarkdownLinkIndex(notes: readonly LinkIndexNote[]): MarkdownLinkIndex {
  const outgoingByNoteId: MarkdownLinkIndex['outgoingByNoteId'] = {};
  const backlinksByTitle: MarkdownLinkIndex['backlinksByTitle'] = {};

  for (const note of notes) {
    const sourceTitle = note.title?.trim() || note.id;
    const links = extractMarkdownWikiLinks(note.markdown ?? '').map((link) => ({
      ...link,
      sourceNoteId: note.id,
      sourceTitle,
    }));
    outgoingByNoteId[note.id] = links;
    for (const link of links) {
      const key = normalizeWikiTitle(link.target);
      backlinksByTitle[key] = backlinksByTitle[key] ?? [];
      backlinksByTitle[key].push(link);
    }
  }

  return { outgoingByNoteId, backlinksByTitle };
}

export function backlinksForTitle(index: MarkdownLinkIndex, title: string): IndexedOutgoingLink[] {
  return index.backlinksByTitle[normalizeWikiTitle(title)] ?? [];
}
