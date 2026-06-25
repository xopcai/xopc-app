import { describe, expect, it } from 'vitest';

import { getMarkdownEditorState } from '../markdown/markdown-editor-state';

describe('markdown-editor-state', () => {
  it('detects todo, bullet, heading, and current line range', () => {
    expect(getMarkdownEditorState('- [ ] Task\nBody', { start: 3, end: 3 })).toMatchObject({
      todo: 'open',
      bullet: false,
      headingLevel: 0,
      currentLineRange: { start: 0, end: 10 },
    });
    expect(getMarkdownEditorState('- [x] Task', { start: 4, end: 4 }).todo).toBe('done');
    expect(getMarkdownEditorState('- Bullet', { start: 2, end: 2 }).bullet).toBe(true);
    expect(getMarkdownEditorState('## Heading', { start: 4, end: 4 }).headingLevel).toBe(2);
  });

  it('detects simple inline marks and links around the selection', () => {
    expect(getMarkdownEditorState('A **bold** word', { start: 4, end: 8 }).bold).toBe(true);
    expect(getMarkdownEditorState('A *soft* word', { start: 3, end: 7 }).italic).toBe(true);
    expect(getMarkdownEditorState('See [docs](https://xopc.ai)', { start: 7, end: 7 }).link).toBe(true);
  });
});
