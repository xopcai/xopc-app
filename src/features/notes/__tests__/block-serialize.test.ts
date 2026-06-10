import { describe, expect, it } from 'vitest';

import type { NoteBlock, TextNoteBlock } from '../../../query/notes';
import {
  blocksToMarkdown,
  blocksToPlainText,
  documentToBlocks,
  noteToDocument,
} from '../blocks/convert/block-serialize';

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

describe('block-serialize', () => {
  it('converts blocks to readable plain text', () => {
    const blocks = [
      paragraphBlock('12321'),
      paragraphBlock('123123', 'block_2'),
    ];
    expect(blocksToPlainText(blocks)).toBe('12321\n\n123123');
  });

  it('maps todo blocks to markdown task lists', () => {
    const blocks: NoteBlock[] = [{
      id: 'todo-1',
      type: 'todo',
      text: 'Buy milk',
      checked: true,
      parentId: null,
      childIds: [],
      createdAt: 1,
      updatedAt: 1,
    }];
    expect(blocksToMarkdown(blocks)).toBe('- [x] Buy milk');
  });

  it('serializes AI-first structured blocks to markdown', () => {
    const blocks: NoteBlock[] = [{
      id: 'callout-1',
      type: 'callout',
      text: 'Remember the constraint',
      parentId: null,
      childIds: [],
      createdAt: 1,
      updatedAt: 1,
    }, {
      id: 'toggle-1',
      type: 'toggle',
      text: 'Decision notes',
      collapsed: false,
      parentId: null,
      childIds: [],
      createdAt: 1,
      updatedAt: 1,
    }];
    expect(blocksToMarkdown(blocks)).toBe('> Remember the constraint\n\n<details><summary>Decision notes</summary></details>');
  });

  it('serializes inline marks to markdown', () => {
    const blocks: NoteBlock[] = [{
      ...paragraphBlock('Alpha Beta Link'),
      marks: [
        { id: 'mark_1', type: 'bold', from: 0, to: 5 },
        { id: 'mark_2', type: 'code', from: 6, to: 10 },
        { id: 'mark_3', type: 'link', from: 11, to: 15, href: 'https://xopc.ai' },
      ],
    }];
    expect(blocksToMarkdown(blocks)).toBe('**Alpha** `Beta` [Link](https://xopc.ai)');
  });

  it('builds a document from gateway note blocks', () => {
    const doc = noteToDocument({
      blocks: [paragraphBlock('Alpha'), paragraphBlock('Beta', 'block_2')],
    });
    expect(blocksToPlainText(documentToBlocks(doc))).toBe('Alpha\n\nBeta');
  });
});
