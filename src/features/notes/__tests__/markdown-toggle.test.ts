import { describe, expect, it } from 'vitest';

import { toggleMarkdownBullet, toggleMarkdownHeading, toggleMarkdownTodo } from '../markdown/markdown-toggle';

describe('markdown-toggle', () => {
  it('toggles todo open and done states on the current line', () => {
    expect(toggleMarkdownTodo('- [ ] Task', { start: 2, end: 2 }).markdown).toBe('- [x] Task');
    expect(toggleMarkdownTodo('- [x] Task', { start: 2, end: 2 }).markdown).toBe('- [ ] Task');
  });

  it('turns plain and bullet lines into todos', () => {
    expect(toggleMarkdownTodo('Task', { start: 2, end: 2 }).markdown).toBe('- [ ] Task');
    expect(toggleMarkdownTodo('- Task', { start: 2, end: 2 }).markdown).toBe('- [ ] Task');
  });

  it('toggles bullet state on the current line', () => {
    expect(toggleMarkdownBullet('Task', { start: 2, end: 2 }).markdown).toBe('- Task');
    expect(toggleMarkdownBullet('- Task', { start: 2, end: 2 }).markdown).toBe('Task');
  });

  it('toggles a heading level', () => {
    expect(toggleMarkdownHeading('Title', { start: 1, end: 1 }, 2).markdown).toBe('## Title');
    expect(toggleMarkdownHeading('## Title', { start: 4, end: 4 }, 2).markdown).toBe('Title');
    expect(toggleMarkdownHeading('# Title', { start: 3, end: 3 }, 2).markdown).toBe('## Title');
  });
});
