import { describe, expect, it, vi } from 'vitest';

import {
  applyNotePatch,
  blocksToPlainText,
  createTextBlock,
  createTodoBlock,
  normalizeBlocks,
  noteTextToBlocks,
  noteToBlocks,
  type NoteBlock,
  type NoteAiPatch,
} from '../note-blocks';

function textBlock(id: string, text: string): NoteBlock {
  return {
    id,
    type: 'paragraph',
    text,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('note-blocks', () => {
  it('converts text paragraphs into editable blocks', () => {
    const blocks = noteTextToBlocks('第一段\n\n第二段');

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph']);
    expect(blocks.map((block) => 'text' in block ? block.text : '')).toEqual(['第一段', '第二段']);
  });

  it('prefers existing note blocks over legacy text', () => {
    const blocks = [textBlock('existing', '已有块')];

    expect(noteToBlocks({ text: '旧文本', blocks })).toBe(blocks);
  });

  it('serializes mixed blocks into plain text', () => {
    const blocks: NoteBlock[] = [
      textBlock('a', '标题'),
      { id: 'todo', type: 'todo', text: '跟进需求', checked: false, createdAt: 1, updatedAt: 1 },
      { id: 'done', type: 'todo', text: '完成设计', checked: true, createdAt: 1, updatedAt: 1 },
      { id: 'line', type: 'divider', createdAt: 1, updatedAt: 1 },
    ];

    expect(blocksToPlainText(blocks)).toBe('标题\n\n[ ] 跟进需求\n\n[x] 完成设计\n\n---');
  });

  it('applies replace, insert, and update patch operations', () => {
    vi.setSystemTime(1000);
    const original = [textBlock('a', 'A'), textBlock('b', 'B')];
    const patch: NoteAiPatch = {
      id: 'patch-1',
      summary: '整理',
      operations: [
        { type: 'insertBlocksAfter', afterBlockId: 'a', blocks: [textBlock('inserted', '插入')] },
        { type: 'updateBlock', blockId: 'b', patch: { text: '更新后' } },
      ],
    };

    const updated = applyNotePatch(original, patch);

    expect(updated.map((block) => block.id)).toEqual(['a', 'inserted', 'b']);
    expect(updated[2]).toMatchObject({ id: 'b', text: '更新后', updatedAt: 1000 });
    vi.useRealTimers();
  });

  it('normalizes empty blocks to one paragraph block', () => {
    expect(normalizeBlocks([])).toHaveLength(1);
    expect(createTextBlock('heading', '标题')).toMatchObject({ type: 'heading', text: '标题', level: 2 });
    expect(createTodoBlock('事项')).toMatchObject({ type: 'todo', text: '事项', checked: false });
  });
});
