import { describe, expect, it } from 'vitest';

import { createTextBlock } from '../note-blocks';
import { countNoteCharacters, deriveNoteTitle } from '../note-title';

describe('deriveNoteTitle', () => {
  it('returns first 10 characters from note body', () => {
    const blocks = [createTextBlock('paragraph', '移动app 就做成笔记管理类 人')];
    expect(deriveNoteTitle(blocks, 10, '无标题')).toBe('移动app 就做成笔');
  });

  it('returns fallback for empty content', () => {
    expect(deriveNoteTitle([createTextBlock('paragraph', '')], 10, '无标题')).toBe('无标题');
  });
});

describe('countNoteCharacters', () => {
  it('counts characters across blocks', () => {
    const blocks = [createTextBlock('paragraph', '你好世界')];
    expect(countNoteCharacters(blocks)).toBe(4);
  });
});
