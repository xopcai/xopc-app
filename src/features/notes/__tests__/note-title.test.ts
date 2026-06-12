import { describe, expect, it } from 'vitest';

import { createTextBlock } from '../note-blocks';
import { countNoteCharacters, deriveNoteTitle, resolveNoteListTitle } from '../note-title';

describe('deriveNoteTitle', () => {
  it('returns first 10 characters from note body', () => {
    const blocks = [createTextBlock('paragraph', '移动app 就做成笔记管理类 人')];
    expect(deriveNoteTitle(blocks, 10, '无标题')).toBe('移动app 就做成笔');
  });

  it('returns fallback for empty content', () => {
    expect(deriveNoteTitle([createTextBlock('paragraph', '')], 10, '无标题')).toBe('无标题');
  });
});

describe('resolveNoteListTitle', () => {
  it('derives title from cached note blocks when index title and snippet are empty', () => {
    const entry = { title: '', snippet: '' };
    const cachedNote = {
      blocks: [createTextBlock('paragraph', '我的笔记内容很长')],
    };
    expect(resolveNoteListTitle(entry, '无标题', cachedNote)).toBe('我的笔记内容很长');
  });

  it('prefers explicit index title over cached note', () => {
    const entry = { title: '索引标题', snippet: '摘要' };
    const cachedNote = {
      title: '缓存标题',
      blocks: [createTextBlock('paragraph', '正文')],
    };
    expect(resolveNoteListTitle(entry, '无标题', cachedNote)).toBe('索引标题');
  });
});

describe('countNoteCharacters', () => {
  it('counts characters across blocks', () => {
    const blocks = [createTextBlock('paragraph', '你好世界')];
    expect(countNoteCharacters(blocks)).toBe(4);
  });
});
