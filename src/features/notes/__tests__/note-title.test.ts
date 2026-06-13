import { describe, expect, it } from 'vitest';

import { createTextBlock } from '../note-blocks';
import {
  countNoteCharacters,
  deriveNoteTitle,
  normalizeNoteIndexEntry,
  resolveNoteListPreview,
  resolveNoteListSnippet,
  resolveNoteListTitle,
} from '../note-title';

describe('deriveNoteTitle', () => {
  it('returns first 10 characters from note body', () => {
    const blocks = [createTextBlock('paragraph', '移动app 就做成笔记管理类 人')];
    expect(deriveNoteTitle(blocks, 10, '无标题')).toBe('移动app 就做成笔');
  });

  it('returns fallback for empty content', () => {
    expect(deriveNoteTitle([createTextBlock('paragraph', '')], 10, '无标题')).toBe('无标题');
  });

  it('skips image markdown and uses attachment transcript', () => {
    const blocks = [
      { id: 'img', type: 'image' as const, src: 'data:image/png;base64,abc', createdAt: 1, updatedAt: 1 },
    ];
    expect(deriveNoteTitle(blocks, 10, '无标题')).toBe('无标题');
    expect(
      deriveNoteTitle(blocks, 10, '无标题', [{ fileName: 'voice.m4a', transcript: '明天开会讨论方案' }]),
    ).toBe('明天开会讨论方案');
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

describe('resolveNoteListSnippet', () => {
  it('falls back to cached blocks when snippet is missing', () => {
    const entry = { snippet: '' };
    const cachedNote = {
      blocks: [createTextBlock('paragraph', '缓存正文内容')],
    };
    expect(resolveNoteListSnippet(entry, cachedNote)).toBe('缓存正文内容');
  });
});

describe('resolveNoteListPreview', () => {
  it('uses title and body separately when both exist', () => {
    const preview = resolveNoteListPreview(
      { title: '项目计划', snippet: '第一步是整理需求文档' },
      { untitled: '无标题' },
    );
    expect(preview).toEqual({
      title: '项目计划',
      subtitle: '第一步是整理需求文档',
    });
  });

  it('uses body as title when no explicit title exists', () => {
    const preview = resolveNoteListPreview(
      { title: '', snippet: '只有正文内容' },
      { untitled: '无标题' },
    );
    expect(preview).toEqual({
      title: '只有正文内容',
      subtitle: null,
    });
  });
});

describe('normalizeNoteIndexEntry', () => {
  it('derives snippet from blocks when API omits snippet', () => {
    const entry = normalizeNoteIndexEntry({
      id: 'n1',
      kind: 'thought',
      status: 'processed',
      createdAt: 1,
      updatedAt: 1,
      blocks: [createTextBlock('paragraph', 'Block note body')],
    });
    expect(entry.snippet).toBe('Block note body');
  });
});

describe('countNoteCharacters', () => {
  it('counts characters across blocks', () => {
    const blocks = [createTextBlock('paragraph', '你好世界')];
    expect(countNoteCharacters(blocks)).toBe(4);
  });
});
