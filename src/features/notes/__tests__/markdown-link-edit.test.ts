import { describe, expect, it } from 'vitest';

import {
  applyMarkdownLinkEdit,
  findMarkdownLinkAtSelection,
  getMarkdownLinkDraft,
  removeMarkdownLink,
} from '../markdown/markdown-link-edit';

describe('markdown-link-edit', () => {
  it('detects a markdown link at the cursor', () => {
    expect(findMarkdownLinkAtSelection('See [docs](https://xopc.ai)', { start: 8, end: 8 })).toEqual({
      range: { start: 4, end: 27 },
      label: 'docs',
      url: 'https://xopc.ai',
    });
  });

  it('builds a draft from selected text or url', () => {
    expect(getMarkdownLinkDraft('Alpha', { start: 0, end: 5 })).toMatchObject({ title: 'Alpha', url: '' });
    expect(getMarkdownLinkDraft('https://xopc.ai', { start: 0, end: 15 })).toMatchObject({ title: 'title', url: 'https://xopc.ai' });
  });

  it('applies a new link and normalizes missing schemes', () => {
    expect(applyMarkdownLinkEdit('Alpha', { start: 0, end: 5 }, { title: 'Docs', url: 'xopc.ai' }).markdown).toBe('[Docs](https://xopc.ai)');
  });

  it('updates and removes an existing link', () => {
    const source = 'See [docs](https://xopc.ai)';
    expect(applyMarkdownLinkEdit(source, { start: 8, end: 8 }, { title: 'Home', url: 'https://xopc.test' }).markdown).toBe('See [Home](https://xopc.test)');
    expect(removeMarkdownLink(source, { start: 8, end: 8 }).markdown).toBe('See docs');
  });
});
