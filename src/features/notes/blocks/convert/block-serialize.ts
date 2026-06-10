import type { Note, NoteAttachment, NoteBlock } from '../../../../query/notes';

import {
  documentFromBlocks,
  documentToBlocks,
  type BlockDocument,
} from '../core/block-document';

export type BlockSerializeOptions = {
  noteId?: string;
  attachments?: NoteAttachment[];
  resolveAttachmentUrl?: (relativePath: string) => string;
};

function resolveAttachmentSrc(
  noteId: string | undefined,
  attachmentId: string,
  attachments: NoteAttachment[] | undefined,
  resolveAttachmentUrl: BlockSerializeOptions['resolveAttachmentUrl'],
): string {
  if (!noteId || !resolveAttachmentUrl) return '';
  const match = attachments?.find((item) => item.id === attachmentId);
  if (!match?.relativePath) return '';
  return resolveAttachmentUrl(match.relativePath);
}

function markedTextToMarkdown(block: Extract<NoteBlock, { text: string }>): string {
  const marks = (block.marks ?? [])
    .filter((mark) => mark.to > mark.from && mark.from >= 0 && mark.to <= block.text.length)
    .sort((a, b) => b.from - a.from || a.to - b.to);
  let text = block.text;
  for (const mark of marks) {
    const value = text.slice(mark.from, mark.to);
    let next = value;
    if (mark.type === 'bold') next = `**${value}**`;
    if (mark.type === 'italic') next = `_${value}_`;
    if (mark.type === 'code') next = `\`${value}\``;
    if (mark.type === 'link') next = `[${value}](${mark.href ?? ''})`;
    text = `${text.slice(0, mark.from)}${next}${text.slice(mark.to)}`;
  }
  return text;
}

function blockToMarkdownLine(block: NoteBlock, listIndex?: number): string {
  switch (block.type) {
    case 'divider':
      return '---';
    case 'image':
      return block.alt?.trim() ? `![${block.alt.trim()}](${block.attachmentId})` : '';
    case 'heading': {
      const level = block.level ?? 2;
      const prefix = '#'.repeat(Math.min(Math.max(level, 1), 6));
      return `${prefix} ${markedTextToMarkdown(block).trim()}`;
    }
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${markedTextToMarkdown(block).trim()}`;
    case 'bulletList':
      return `- ${markedTextToMarkdown(block).trim()}`;
    case 'numberedList':
      return `${listIndex ?? 1}. ${markedTextToMarkdown(block).trim()}`;
    case 'quote':
      return `> ${markedTextToMarkdown(block).trim()}`;
    case 'callout':
      return `> ${markedTextToMarkdown(block).trim()}`;
    case 'toggle':
      return `<details><summary>${markedTextToMarkdown(block).trim()}</summary></details>`;
    case 'code':
      return `\`\`\`\n${block.text}\n\`\`\``;
    default:
      return 'text' in block ? markedTextToMarkdown(block).trim() : '';
  }
}

export function blocksToPlainText(blocks: NoteBlock[]): string {
  let numbered = 0;
  return blocks
    .map((block) => {
      if (block.type === 'numberedList') {
        numbered += 1;
        return blockToMarkdownLine(block, numbered);
      }
      numbered = 0;
      return blockToMarkdownLine(block);
    })
    .filter((line) => line.length > 0)
    .join('\n\n');
}

export function documentToPlainText(doc: BlockDocument): string {
  return blocksToPlainText(documentToBlocks(doc));
}

export function blocksToMarkdown(
  blocks: NoteBlock[],
  options?: BlockSerializeOptions,
): string {
  let numbered = 0;
  return blocks
    .map((block) => {
      if (block.type === 'image') {
        const src = resolveAttachmentSrc(
          options?.noteId,
          block.attachmentId,
          options?.attachments,
          options?.resolveAttachmentUrl,
        );
        const alt = block.alt?.trim() || 'image';
        return src ? `![${alt}](${src})` : blockToMarkdownLine(block);
      }
      if (block.type === 'numberedList') {
        numbered += 1;
        return blockToMarkdownLine(block, numbered);
      }
      numbered = 0;
      return blockToMarkdownLine(block);
    })
    .filter((line) => line.length > 0)
    .join('\n\n');
}

export function documentToMarkdown(doc: BlockDocument, options?: BlockSerializeOptions): string {
  return blocksToMarkdown(documentToBlocks(doc), options);
}

export function blocksAreEmpty(blocks: NoteBlock[]): boolean {
  if (blocks.some((block) => block.type === 'image' || block.type === 'divider')) {
    return blocks.every((block) => {
      if (block.type === 'image' || block.type === 'divider') return false;
      return !('text' in block) || block.text.trim().length === 0;
    });
  }
  return blocksToPlainText(blocks).trim().length === 0;
}

export function documentIsEmpty(doc: BlockDocument): boolean {
  return blocksAreEmpty(documentToBlocks(doc));
}

export function noteToDocument(note: Pick<Note, 'blocks'>): BlockDocument {
  if (!note.blocks?.length) {
    return documentFromBlocks([]);
  }
  return documentFromBlocks(note.blocks);
}

export type BlockImageRef = {
  attachmentId: string;
  alt?: string;
};

export function collectBlockImages(blocks: NoteBlock[]): BlockImageRef[] {
  return blocks
    .filter((block): block is Extract<NoteBlock, { type: 'image' }> => block.type === 'image')
    .map((block) => ({ attachmentId: block.attachmentId, alt: block.alt }));
}

export function collectDocumentImages(doc: BlockDocument): BlockImageRef[] {
  return collectBlockImages(documentToBlocks(doc));
}

export function blocksEqual(a: NoteBlock[], b: NoteBlock[]): boolean {
  return JSON.stringify(a.map(stripUpdatedAt)) === JSON.stringify(b.map(stripUpdatedAt));
}

export function documentEqual(a: BlockDocument, b: BlockDocument): boolean {
  return blocksEqual(documentToBlocks(a), documentToBlocks(b));
}

function stripUpdatedAt(block: NoteBlock): Omit<NoteBlock, 'updatedAt'> & { updatedAt?: number } {
  const { updatedAt, ...rest } = block;
  void updatedAt;
  return rest;
}

export {
  createEmptyDocument,
  documentFromBlocks,
  documentToBlocks,
  emptyParagraphBlock,
} from '../core/block-document';
