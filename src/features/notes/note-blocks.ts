import type { Note } from '../../query/notes';

export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'code'
  | 'divider'
  | 'aiSuggestion';

export interface BaseNoteBlock {
  id: string;
  type: NoteBlockType;
  createdAt: number;
  updatedAt: number;
}

export interface TextNoteBlock extends BaseNoteBlock {
  type: 'paragraph' | 'heading' | 'bulletList' | 'numberedList' | 'quote' | 'code' | 'aiSuggestion';
  text: string;
  level?: 1 | 2 | 3;
  indent?: number;
}

export interface TodoNoteBlock extends BaseNoteBlock {
  type: 'todo';
  text: string;
  checked: boolean;
}

export interface DividerNoteBlock extends BaseNoteBlock {
  type: 'divider';
}

export type NoteBlock = TextNoteBlock | TodoNoteBlock | DividerNoteBlock;

export type NotePatchOperation =
  | { type: 'replaceBlocks'; blocks: NoteBlock[] }
  | { type: 'insertBlocksAfter'; afterBlockId: string; blocks: NoteBlock[] }
  | { type: 'updateBlock'; blockId: string; patch: Partial<NoteBlock> }
  | { type: 'updateMetadata'; title?: string; tags?: string[]; status?: Note['status'] };

export interface NoteAiPatch {
  id: string;
  summary: string;
  operations: NotePatchOperation[];
}

export function createBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTextBlock(type: TextNoteBlock['type'], text = ''): TextNoteBlock {
  const now = Date.now();
  return {
    id: createBlockId(),
    type,
    text,
    createdAt: now,
    updatedAt: now,
    ...(type === 'heading' ? { level: 2 as const } : null),
    ...(type === 'bulletList' || type === 'numberedList' ? { indent: 0 } : null),
  };
}

export function createTodoBlock(text = ''): TodoNoteBlock {
  const now = Date.now();
  return {
    id: createBlockId(),
    type: 'todo',
    text,
    checked: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function noteTextToBlocks(text?: string): NoteBlock[] {
  const source = text?.trimEnd() ?? '';
  if (!source) return [createTextBlock('paragraph')];
  return source.split(/\n{2,}/).map((part) => createTextBlock('paragraph', part.trim()));
}

export function noteToBlocks(note?: Pick<Note, 'text' | 'blocks'> | null): NoteBlock[] {
  if (note?.blocks?.length) return note.blocks;
  return noteTextToBlocks(note?.text);
}

export function blocksToPlainText(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'divider') return '---';
      if (block.type === 'todo') return `${block.checked ? '[x]' : '[ ]'} ${block.text}`;
      return block.text;
    })
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
}

/** Serialize blocks to Markdown for sharing/export. */
export function blocksToMarkdown(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'divider') return '\n---\n';
      if (block.type === 'heading') {
        const prefix = '#'.repeat(block.level ?? 2);
        return `${prefix} ${block.text}`;
      }
      if (block.type === 'todo') return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
      if (block.type === 'bulletList') return `- ${block.text}`;
      if (block.type === 'numberedList') return `1. ${block.text}`;
      if (block.type === 'quote') return `> ${block.text}`;
      if (block.type === 'code') return `\`\`\`\n${block.text}\n\`\`\``;
      return block.text;
    })
    .filter((line) => line.trim().length > 0)
    .join('\n\n');
}

export function applyNotePatch(blocks: NoteBlock[], patch: NoteAiPatch): NoteBlock[] {
  return patch.operations.reduce((currentBlocks, operation) => {
    if (operation.type === 'replaceBlocks') return operation.blocks;
    if (operation.type === 'insertBlocksAfter') {
      const index = currentBlocks.findIndex((block) => block.id === operation.afterBlockId);
      if (index === -1) return [...currentBlocks, ...operation.blocks];
      return [
        ...currentBlocks.slice(0, index + 1),
        ...operation.blocks,
        ...currentBlocks.slice(index + 1),
      ];
    }
    if (operation.type === 'updateBlock') {
      return currentBlocks.map((block) => {
        if (block.id !== operation.blockId) return block;
        return { ...block, ...operation.patch, id: block.id, updatedAt: Date.now() } as NoteBlock;
      });
    }
    return currentBlocks;
  }, blocks);
}

export function normalizeBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.length ? blocks : [createTextBlock('paragraph')];
}
