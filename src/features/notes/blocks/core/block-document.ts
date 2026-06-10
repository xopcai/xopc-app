import type { NoteBlock } from '../../../../query/notes';

import { createBlockId } from '../convert/block-id';

export interface BlockDocument {
  rootIds: string[];
  blocks: Record<string, NoteBlock>;
  version: number;
}

export function normalizeBlock(block: NoteBlock): NoteBlock {
  return {
    ...block,
    parentId: block.parentId ?? null,
    childIds: block.childIds ?? [],
  };
}

export function stampBlock(block: Partial<NoteBlock> & Pick<NoteBlock, 'type'>): NoteBlock {
  const now = Date.now();
  return normalizeBlock({
    id: block.id ?? createBlockId(),
    parentId: block.parentId ?? null,
    childIds: block.childIds ?? [],
    createdAt: block.createdAt ?? now,
    updatedAt: block.updatedAt ?? now,
    ...block,
  } as NoteBlock);
}

export function emptyParagraphBlock(): NoteBlock {
  return stampBlock({ type: 'paragraph', text: '' });
}

export function createEmptyDocument(): BlockDocument {
  const block = emptyParagraphBlock();
  return {
    rootIds: [block.id],
    blocks: { [block.id]: block },
    version: 0,
  };
}

export function documentFromBlocks(blocks: NoteBlock[]): BlockDocument {
  if (!blocks.length) return createEmptyDocument();

  const normalized = blocks.map(normalizeBlock);
  const record: Record<string, NoteBlock> = {};
  for (const block of normalized) {
    record[block.id] = block;
  }

  const referencedChildren = new Set<string>();
  for (const block of normalized) {
    for (const childId of block.childIds) {
      referencedChildren.add(childId);
    }
  }

  const rootIds = normalized
    .filter((block) => block.parentId == null && !referencedChildren.has(block.id))
    .map((block) => block.id);

  const orderedRootIds = rootIds.length
    ? rootIds
    : normalized.filter((block) => block.parentId == null).map((block) => block.id);

  return {
    rootIds: orderedRootIds.length ? orderedRootIds : [normalized[0].id],
    blocks: record,
    version: 0,
  };
}

export function documentToBlocks(doc: BlockDocument): NoteBlock[] {
  const out: NoteBlock[] = [];
  const visit = (blockId: string) => {
    const block = doc.blocks[blockId];
    if (!block) return;
    out.push(block);
    for (const childId of block.childIds) {
      visit(childId);
    }
  };
  for (const rootId of doc.rootIds) {
    visit(rootId);
  }
  return out;
}

export function flattenBlockIds(doc: BlockDocument): string[] {
  const out: string[] = [];
  const visit = (blockId: string) => {
    if (!doc.blocks[blockId]) return;
    out.push(blockId);
    for (const childId of doc.blocks[blockId].childIds) {
      visit(childId);
    }
  };
  for (const rootId of doc.rootIds) {
    visit(rootId);
  }
  return out;
}

export function getBlockIndex(doc: BlockDocument, blockId: string): number {
  return flattenBlockIds(doc).indexOf(blockId);
}

export function getBlockDepth(doc: BlockDocument, blockId: string): number {
  let depth = 0;
  let current = doc.blocks[blockId];
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    depth += 1;
    current = doc.blocks[current.parentId];
  }
  return depth;
}

export function touchBlock(block: NoteBlock, patch: Partial<NoteBlock>): NoteBlock {
  return normalizeBlock({
    ...block,
    ...patch,
    updatedAt: Date.now(),
  } as NoteBlock);
}

export function documentStableStringify(doc: BlockDocument): string {
  const blocks = documentToBlocks(doc).map((block) => ({
    ...block,
    updatedAt: undefined,
  }));
  return JSON.stringify({ rootIds: doc.rootIds, blocks });
}

export function documentEqual(a: BlockDocument, b: BlockDocument): boolean {
  return documentStableStringify(a) === documentStableStringify(b);
}

export function bumpDocumentVersion(doc: BlockDocument): BlockDocument {
  return { ...doc, version: doc.version + 1 };
}
