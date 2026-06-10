import { describe, expect, it } from 'vitest';

import type { TextNoteBlock } from '../../../query/notes';
import {
  applyBlockPatchToDocument,
  applyTransaction,
  insertBlockAfterDoc,
  transaction,
  updateBlockText,
} from '../blocks/core/block-reducer';
import {
  createEmptyDocument,
  documentFromBlocks,
  documentToBlocks,
  emptyParagraphBlock,
} from '../blocks/convert/block-serialize';
import type { NoteAiPatch } from '../../../query/notes';

function paragraphBlock(text: string, id = 'block_1'): TextNoteBlock {
  return {
    id,
    type: 'paragraph',
    text,
    parentId: null,
    childIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('block-reducer', () => {
  it('inserts a paragraph after the focused block', () => {
    const doc = documentFromBlocks([paragraphBlock('Hello')]);
    const rootId = doc.rootIds[0];
    const next = insertBlockAfterDoc(doc, rootId, 'paragraph');
    const blocks = documentToBlocks(next);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].type).toBe('paragraph');
  });

  it('updates block text without changing block count', () => {
    const doc = createEmptyDocument();
    const patch: NoteAiPatch = {
      id: 'patch-1',
      summary: 'Replace',
      operations: [{
        type: 'replaceBlocks',
        blocks: [paragraphBlock('Replaced')],
      }],
    };
    const next = applyBlockPatchToDocument(doc, patch);
    expect(documentToBlocks(next)[0]).toMatchObject({ type: 'paragraph', text: 'Replaced' });
  });

  it('updates block text without changing block count', () => {
    const doc = documentFromBlocks([emptyParagraphBlock()]);
    const blockId = doc.rootIds[0];
    const next = updateBlockText(doc, blockId, 'Updated');
    expect(next.blocks[blockId]).toMatchObject({ text: 'Updated' });
  });

  it('inserts an image block and trailing paragraph after the anchor', () => {
    const doc = createEmptyDocument();
    const anchorId = doc.rootIds[0];
    const next = applyTransaction(doc, transaction({
      type: 'insertImageAfter',
      afterBlockId: anchorId,
      attachmentId: 'att_1',
      alt: 'photo.jpg',
    }));
    const blocks = documentToBlocks(next);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({ type: 'image', attachmentId: 'att_1', alt: 'photo.jpg' });
    expect(blocks[2]).toMatchObject({ type: 'paragraph', text: '' });
  });

  it('splits a text block at the caret offset', () => {
    const doc = documentFromBlocks([paragraphBlock('AlphaBeta')]);
    const blockId = doc.rootIds[0];
    const next = applyTransaction(doc, transaction({
      type: 'splitText',
      blockId,
      offset: 5,
    }));
    expect(documentToBlocks(next).map((block) => 'text' in block ? block.text : '')).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('duplicates a block after itself', () => {
    const doc = documentFromBlocks([paragraphBlock('Alpha')]);
    const blockId = doc.rootIds[0];
    const next = applyTransaction(doc, transaction({
      type: 'duplicate',
      blockId,
    }));
    const blocks = documentToBlocks(next);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ id: blockId, text: 'Alpha' });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'Alpha' });
    expect(blocks[1].id).not.toBe(blockId);
  });

  it('toggles inline marks on a text range', () => {
    const doc = documentFromBlocks([paragraphBlock('Alpha Beta')]);
    const blockId = doc.rootIds[0];
    const marked = applyTransaction(doc, transaction({
      type: 'toggleTextMark',
      blockId,
      markType: 'bold',
      from: 0,
      to: 5,
    }));
    expect(marked.blocks[blockId]).toMatchObject({
      marks: [{ type: 'bold', from: 0, to: 5 }],
    });

    const unmarked = applyTransaction(marked, transaction({
      type: 'toggleTextMark',
      blockId,
      markType: 'bold',
      from: 0,
      to: 5,
    }));
    expect('marks' in unmarked.blocks[blockId] ? unmarked.blocks[blockId].marks : undefined).toBeUndefined();
  });

  it('splits inline marks when splitting a text block', () => {
    const doc = documentFromBlocks([{
      ...paragraphBlock('AlphaBeta'),
      marks: [{ id: 'mark_1', type: 'italic', from: 2, to: 7 }],
    }]);
    const blockId = doc.rootIds[0];
    const next = applyTransaction(doc, transaction({
      type: 'splitText',
      blockId,
      offset: 5,
    }));
    const blocks = documentToBlocks(next);
    expect(blocks[0]).toMatchObject({ text: 'Alpha', marks: [{ type: 'italic', from: 2, to: 5 }] });
    expect(blocks[1]).toMatchObject({ text: 'Beta', marks: [{ type: 'italic', from: 0, to: 2 }] });
  });

  it('indents and outdents a block through parent child ids', () => {
    const doc = documentFromBlocks([
      paragraphBlock('Parent', 'block_parent'),
      paragraphBlock('Child', 'block_child'),
    ]);
    const indented = applyTransaction(doc, transaction({
      type: 'indent',
      blockId: 'block_child',
    }));
    expect(indented.rootIds).toEqual(['block_parent']);
    expect(indented.blocks.block_child.parentId).toBe('block_parent');
    expect(indented.blocks.block_parent.childIds).toEqual(['block_child']);

    const outdented = applyTransaction(indented, transaction({
      type: 'outdent',
      blockId: 'block_child',
    }));
    expect(outdented.rootIds).toEqual(['block_parent', 'block_child']);
    expect(outdented.blocks.block_child.parentId).toBeNull();
    expect(outdented.blocks.block_parent.childIds).toEqual([]);
  });
});
