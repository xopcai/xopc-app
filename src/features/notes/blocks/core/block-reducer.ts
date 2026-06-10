import type { NoteAiPatch, NoteBlock, NoteBlockType, NoteTextMark } from '../../../../query/notes';

import type { BlockCommand, BlockTransaction } from './block-command';
import {
  bumpDocumentVersion,
  documentFromBlocks,
  documentToBlocks,
  emptyParagraphBlock,
  stampBlock,
  touchBlock,
  type BlockDocument,
} from './block-document';

function findParentList(doc: BlockDocument, blockId: string): string[] | null {
  const block = doc.blocks[blockId];
  if (!block) return null;
  if (block.parentId == null) return doc.rootIds;
  const parent = doc.blocks[block.parentId];
  return parent?.childIds ?? null;
}

function removeBlockFromTree(doc: BlockDocument, blockId: string): BlockDocument {
  const block = doc.blocks[blockId];
  if (!block) return doc;

  const nextBlocks = { ...doc.blocks };
  delete nextBlocks[blockId];

  let nextRootIds = doc.rootIds;
  if (block.parentId == null) {
    nextRootIds = doc.rootIds.filter((id) => id !== blockId);
  } else {
    const parent = nextBlocks[block.parentId];
    if (parent) {
      nextBlocks[block.parentId] = touchBlock(parent, {
        childIds: parent.childIds.filter((id) => id !== blockId),
      });
    }
  }

  return { ...doc, rootIds: nextRootIds, blocks: nextBlocks };
}

function insertBlockInDocument(
  doc: BlockDocument,
  afterBlockId: string,
  block: NoteBlock,
): BlockDocument {
  const anchor = doc.blocks[afterBlockId];
  if (!anchor) return doc;
  const list = findParentList(doc, afterBlockId);
  if (!list) return doc;

  const nextList = insertIntoList(list, afterBlockId, block.id);
  let nextDoc: BlockDocument = {
    ...doc,
    blocks: { ...doc.blocks, [block.id]: block },
  };

  if (anchor.parentId == null) {
    nextDoc = { ...nextDoc, rootIds: nextList };
  } else {
    const parent = nextDoc.blocks[anchor.parentId];
    if (parent) {
      nextDoc.blocks[anchor.parentId] = touchBlock(parent, { childIds: nextList });
    }
  }

  return bumpDocumentVersion(nextDoc);
}

function insertIntoList(
  list: string[],
  afterBlockId: string,
  blockId: string,
): string[] {
  const index = list.indexOf(afterBlockId);
  if (index < 0) return [...list, blockId];
  const next = [...list];
  next.splice(index + 1, 0, blockId);
  return next;
}

function clampMarks(marks: NoteTextMark[] | undefined, textLength: number): NoteTextMark[] | undefined {
  const next = (marks ?? [])
    .map((mark) => ({
      ...mark,
      from: Math.max(0, Math.min(mark.from, textLength)),
      to: Math.max(0, Math.min(mark.to, textLength)),
    }))
    .filter((mark) => mark.to > mark.from);
  return next.length ? next : undefined;
}

function createMarkId(): string {
  return `mark_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toggleTextMarkInBlock(
  marks: NoteTextMark[] | undefined,
  mark: Omit<NoteTextMark, 'id'>,
): NoteTextMark[] | undefined {
  const from = Math.max(0, Math.min(mark.from, mark.to));
  const to = Math.max(0, Math.max(mark.from, mark.to));
  if (to <= from) return marks;

  const existing = marks ?? [];
  const matchIndex = existing.findIndex((item) =>
    item.type === mark.type &&
    item.from === from &&
    item.to === to &&
    (item.href ?? '') === (mark.href ?? '')
  );
  const next = matchIndex >= 0
    ? existing.filter((_, index) => index !== matchIndex)
    : [...existing, { ...mark, id: createMarkId(), from, to }];
  return next.length ? next : undefined;
}

function splitMarks(
  marks: NoteTextMark[] | undefined,
  offset: number,
): { before?: NoteTextMark[]; after?: NoteTextMark[] } {
  const before: NoteTextMark[] = [];
  const after: NoteTextMark[] = [];
  for (const mark of marks ?? []) {
    if (mark.to <= offset) {
      before.push(mark);
      continue;
    }
    if (mark.from >= offset) {
      after.push({ ...mark, id: createMarkId(), from: mark.from - offset, to: mark.to - offset });
      continue;
    }
    before.push({ ...mark, id: createMarkId(), to: offset });
    after.push({ ...mark, id: createMarkId(), from: 0, to: mark.to - offset });
  }
  return {
    before: before.length ? before : undefined,
    after: after.length ? after : undefined,
  };
}

export function createBlockForType(type: NoteBlockType): NoteBlock {
  switch (type) {
    case 'heading':
      return stampBlock({ type: 'heading', text: '', level: 2 });
    case 'todo':
      return stampBlock({ type: 'todo', text: '', checked: false });
    case 'bulletList':
      return stampBlock({ type: 'bulletList', text: '' });
    case 'numberedList':
      return stampBlock({ type: 'numberedList', text: '' });
    case 'quote':
      return stampBlock({ type: 'quote', text: '' });
    case 'callout':
      return stampBlock({ type: 'callout', text: '' });
    case 'toggle':
      return stampBlock({ type: 'toggle', text: '', collapsed: false });
    case 'code':
      return stampBlock({ type: 'code', text: '' });
    case 'divider':
      return stampBlock({ type: 'divider' });
    default:
      return emptyParagraphBlock();
  }
}

function normalizeInsertedBlock(block: NoteBlock, anchor: NoteBlock): NoteBlock {
  return stampBlock({
    ...block,
    parentId: anchor.parentId,
    childIds: block.childIds ?? [],
  });
}

function applyBlockPatch(doc: BlockDocument, patch: NoteAiPatch): BlockDocument {
  let current = doc;

  for (const operation of patch.operations) {
    switch (operation.type) {
      case 'replaceBlocks': {
        const blocks = operation.blocks.length ? operation.blocks : [emptyParagraphBlock()];
        current = documentFromBlocks(blocks);
        break;
      }
      case 'insertBlocksAfter': {
        let afterId = operation.afterBlockId;
        for (const block of operation.blocks) {
          current = applyCommand(current, {
            type: 'insertAfter',
            afterBlockId: afterId,
            block,
          });
          afterId = block.id;
        }
        break;
      }
      case 'updateBlock': {
        const existing = current.blocks[operation.blockId];
        if (!existing) break;
        current = bumpDocumentVersion({
          ...current,
          blocks: {
            ...current.blocks,
            [operation.blockId]: touchBlock(existing, operation.patch),
          },
        });
        break;
      }
      default:
        break;
    }
  }

  return current;
}

function applyCommand(doc: BlockDocument, command: BlockCommand): BlockDocument {
  switch (command.type) {
    case 'updateText': {
      const block = doc.blocks[command.blockId];
      if (!block || !('text' in block)) return doc;
      const marks = clampMarks(block.marks, command.text.length);
      return bumpDocumentVersion({
        ...doc,
        blocks: {
          ...doc.blocks,
          [command.blockId]: touchBlock(block, { text: command.text, marks }),
        },
      });
    }
    case 'toggleTextMark': {
      const block = doc.blocks[command.blockId];
      if (!block || !('text' in block)) return doc;
      const from = Math.max(0, Math.min(command.from, block.text.length));
      const to = Math.max(0, Math.min(command.to, block.text.length));
      const marks = toggleTextMarkInBlock(block.marks, {
        type: command.markType,
        from,
        to,
        href: command.href,
      });
      return bumpDocumentVersion({
        ...doc,
        blocks: {
          ...doc.blocks,
          [command.blockId]: touchBlock(block, { marks }),
        },
      });
    }
    case 'updateChecked': {
      const block = doc.blocks[command.blockId];
      if (!block || block.type !== 'todo') return doc;
      return bumpDocumentVersion({
        ...doc,
        blocks: {
          ...doc.blocks,
          [command.blockId]: touchBlock(block, { checked: command.checked }),
        },
      });
    }
    case 'insertAfter': {
      const anchor = doc.blocks[command.afterBlockId];
      if (!anchor) return doc;
      const block = normalizeInsertedBlock(command.block, anchor);
      return insertBlockInDocument(doc, command.afterBlockId, block);
    }
    case 'insertImageAfter': {
      const anchor = doc.blocks[command.afterBlockId];
      if (!anchor) return doc;

      const imageBlock = stampBlock({
        type: 'image',
        attachmentId: command.attachmentId,
        alt: command.alt?.trim() || undefined,
        parentId: anchor.parentId,
      });
      const paragraph = stampBlock({
        type: 'paragraph',
        text: '',
        parentId: anchor.parentId,
      });

      let next = applyCommand(doc, {
        type: 'insertAfter',
        afterBlockId: command.afterBlockId,
        block: imageBlock,
      });
      next = applyCommand(next, {
        type: 'insertAfter',
        afterBlockId: imageBlock.id,
        block: paragraph,
      });
      return next;
    }
    case 'appendLink': {
      const trimmed = command.url.trim();
      if (!trimmed) return doc;
      const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const label = url.replace(/^https?:\/\//i, '').replace(/\/$/, '') || url;
      const linkMarkdown = `[${label}](${url})`;

      const block = doc.blocks[command.blockId];
      if (block && 'text' in block) {
        const prefix = block.text.trim().length > 0 && !block.text.endsWith(' ')
          ? `${block.text} `
          : block.text;
        return applyCommand(doc, {
          type: 'updateText',
          blockId: command.blockId,
          text: `${prefix}${linkMarkdown}`,
        });
      }

      const paragraph = stampBlock({
        ...emptyParagraphBlock(),
        parentId: block?.parentId ?? null,
      });
      const next = applyCommand(doc, {
        type: 'insertAfter',
        afterBlockId: command.blockId,
        block: paragraph,
      });
      return applyCommand(next, {
        type: 'updateText',
        blockId: paragraph.id,
        text: linkMarkdown,
      });
    }
    case 'delete': {
      const block = doc.blocks[command.blockId];
      if (!block) return doc;
      let next = removeBlockFromTree(doc, command.blockId);
      if (next.rootIds.length === 0) {
        const fallback = emptyParagraphBlock();
        next = {
          ...next,
          rootIds: [fallback.id],
          blocks: { ...next.blocks, [fallback.id]: fallback },
        };
      }
      return bumpDocumentVersion(next);
    }
    case 'duplicate': {
      const block = doc.blocks[command.blockId];
      if (!block) return doc;
      const duplicated = stampBlock({
        ...block,
        id: undefined,
        parentId: block.parentId,
        childIds: [],
      });
      return insertBlockInDocument(doc, command.blockId, duplicated);
    }
    case 'splitText': {
      const block = doc.blocks[command.blockId];
      if (!block || !('text' in block)) return doc;
      const offset = Math.max(0, Math.min(command.offset, block.text.length));
      const before = block.text.slice(0, offset);
      const after = block.text.slice(offset);
      const marks = splitMarks(block.marks, offset);
      const nextBlock = stampBlock({
        ...block,
        id: undefined,
        text: after,
        marks: marks.after,
        parentId: block.parentId,
        childIds: [],
      });
      const updated = bumpDocumentVersion({
        ...doc,
        blocks: {
          ...doc.blocks,
          [block.id]: touchBlock(block, { text: before, marks: marks.before }),
        },
      });
      return insertBlockInDocument(updated, block.id, nextBlock);
    }
    case 'mergeWithPrevious': {
      const current = doc.blocks[command.blockId];
      if (!current || !('text' in current)) return doc;

      const list = findParentList(doc, command.blockId);
      if (!list) return doc;
      const index = list.indexOf(command.blockId);
      if (index <= 0) return doc;

      const prevId = list[index - 1];
      const prev = doc.blocks[prevId];
      if (!prev || !('text' in prev)) return doc;
      if (prev.type !== 'paragraph' || current.type !== 'paragraph') return doc;

      let next = applyCommand(doc, {
        type: 'updateText',
        blockId: prevId,
        text: `${prev.text}${current.text}`,
      });
      next = applyCommand(next, { type: 'delete', blockId: command.blockId });
      return next;
    }
    case 'convert': {
      const block = doc.blocks[command.blockId];
      if (!block) return doc;
      const converted = createBlockForType(command.toType);
      return bumpDocumentVersion({
        ...doc,
        blocks: {
          ...doc.blocks,
          [command.blockId]: touchBlock(converted, {
            id: block.id,
            parentId: block.parentId,
            childIds: block.childIds,
            createdAt: block.createdAt,
          }),
        },
      });
    }
    case 'indent': {
      const block = doc.blocks[command.blockId];
      if (!block) return doc;
      const list = findParentList(doc, command.blockId);
      if (!list) return doc;
      const index = list.indexOf(command.blockId);
      if (index <= 0) return doc;

      const newParentId = list[index - 1];
      const newParent = doc.blocks[newParentId];
      if (!newParent) return doc;

      const nextList = list.filter((id) => id !== command.blockId);
      const nextBlocks = {
        ...doc.blocks,
        [command.blockId]: touchBlock(block, { parentId: newParentId }),
        [newParentId]: touchBlock(newParent, {
          childIds: [...newParent.childIds, command.blockId],
        }),
      };

      if (block.parentId == null) {
        return bumpDocumentVersion({ ...doc, rootIds: nextList, blocks: nextBlocks });
      }

      const oldParent = nextBlocks[block.parentId];
      if (!oldParent) return doc;
      return bumpDocumentVersion({
        ...doc,
        blocks: {
          ...nextBlocks,
          [block.parentId]: touchBlock(oldParent, { childIds: nextList }),
        },
      });
    }
    case 'outdent': {
      const block = doc.blocks[command.blockId];
      if (!block?.parentId) return doc;
      const parent = doc.blocks[block.parentId];
      if (!parent) return doc;

      const oldSiblingIds = parent.childIds.filter((id) => id !== command.blockId);
      const moved = touchBlock(block, { parentId: parent.parentId });
      let nextBlocks = {
        ...doc.blocks,
        [command.blockId]: moved,
        [parent.id]: touchBlock(parent, { childIds: oldSiblingIds }),
      };

      if (parent.parentId == null) {
        const parentIndex = doc.rootIds.indexOf(parent.id);
        if (parentIndex < 0) return doc;
        const rootIds = [...doc.rootIds];
        rootIds.splice(parentIndex + 1, 0, command.blockId);
        return bumpDocumentVersion({ ...doc, rootIds, blocks: nextBlocks });
      }

      const grandParent = nextBlocks[parent.parentId];
      if (!grandParent) return doc;
      const parentIndex = grandParent.childIds.indexOf(parent.id);
      if (parentIndex < 0) return doc;
      const childIds = [...grandParent.childIds];
      childIds.splice(parentIndex + 1, 0, command.blockId);
      nextBlocks = {
        ...nextBlocks,
        [parent.parentId]: touchBlock(grandParent, { childIds }),
      };
      return bumpDocumentVersion({ ...doc, blocks: nextBlocks });
    }
    case 'move': {
      const block = doc.blocks[command.blockId];
      if (!block) return doc;

      let next = removeBlockFromTree(doc, command.blockId);
      const moved = next.blocks[command.blockId] ?? block;

      if (command.afterBlockId == null) {
        return bumpDocumentVersion({
          ...next,
          rootIds: [command.blockId, ...next.rootIds],
          blocks: {
            ...next.blocks,
            [command.blockId]: touchBlock(moved, { parentId: null }),
          },
        });
      }

      const anchor = next.blocks[command.afterBlockId];
      if (!anchor) return doc;
      const list = findParentList(next, command.afterBlockId);
      if (!list) return doc;

      const parentId = anchor.parentId;
      const nextList = insertIntoList(list, command.afterBlockId, command.blockId);
      next = {
        ...next,
        blocks: {
          ...next.blocks,
          [command.blockId]: touchBlock(moved, { parentId }),
        },
      };

      if (parentId == null) {
        next.rootIds = nextList;
      } else {
        const parent = next.blocks[parentId];
        if (parent) {
          next.blocks[parentId] = touchBlock(parent, { childIds: nextList });
        }
      }

      return bumpDocumentVersion(next);
    }
    case 'applyPatch':
      return applyBlockPatch(doc, command.patch);
    default:
      return doc;
  }
}

export function applyTransaction(doc: BlockDocument, tx: BlockTransaction): BlockDocument {
  return tx.commands.reduce((current, command) => applyCommand(current, command), doc);
}

export function transaction(...commands: BlockCommand[]): BlockTransaction {
  return { commands };
}

export function insertBlockAfterDoc(
  doc: BlockDocument,
  blockId: string,
  type: NoteBlockType = 'paragraph',
): BlockDocument {
  return applyTransaction(doc, transaction({
    type: 'insertAfter',
    afterBlockId: blockId,
    block: createBlockForType(type),
  }));
}

export function updateBlockText(doc: BlockDocument, blockId: string, text: string): BlockDocument {
  return applyTransaction(doc, transaction({ type: 'updateText', blockId, text }));
}

export function updateBlockChecked(doc: BlockDocument, blockId: string, checked: boolean): BlockDocument {
  return applyTransaction(doc, transaction({ type: 'updateChecked', blockId, checked }));
}

export function applyBlockPatchToDocument(doc: BlockDocument, patch: NoteAiPatch): BlockDocument {
  return applyTransaction(doc, transaction({ type: 'applyPatch', patch }));
}

export { documentToBlocks };
