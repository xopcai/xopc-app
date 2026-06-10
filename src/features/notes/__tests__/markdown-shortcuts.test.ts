import { describe, expect, it } from 'vitest';

import { detectMarkdownShortcut, detectSlashCommand } from '../editor/markdown-shortcuts';

describe('detectMarkdownShortcut', () => {
  it('converts # to heading', () => {
    const result = detectMarkdownShortcut('# Hello', 'paragraph');
    expect(result).toEqual({ targetType: 'heading', remainingText: 'Hello' });
  });

  it('converts ## to heading', () => {
    const result = detectMarkdownShortcut('## Sub heading', 'paragraph');
    expect(result).toEqual({ targetType: 'heading', remainingText: 'Sub heading' });
  });

  it('converts ### to heading', () => {
    const result = detectMarkdownShortcut('### Third', 'paragraph');
    expect(result).toEqual({ targetType: 'heading', remainingText: 'Third' });
  });

  it('converts - to bullet list', () => {
    const result = detectMarkdownShortcut('- item', 'paragraph');
    expect(result).toEqual({ targetType: 'bulletList', remainingText: 'item' });
  });

  it('converts * to bullet list', () => {
    const result = detectMarkdownShortcut('* item', 'paragraph');
    expect(result).toEqual({ targetType: 'bulletList', remainingText: 'item' });
  });

  it('converts 1. to numbered list', () => {
    const result = detectMarkdownShortcut('1. first', 'paragraph');
    expect(result).toEqual({ targetType: 'numberedList', remainingText: 'first' });
  });

  it('converts [] to todo', () => {
    const result = detectMarkdownShortcut('[] buy milk', 'paragraph');
    expect(result).toEqual({ targetType: 'todo', remainingText: 'buy milk' });
  });

  it('converts [ ] to todo', () => {
    const result = detectMarkdownShortcut('[ ] task', 'paragraph');
    expect(result).toEqual({ targetType: 'todo', remainingText: 'task' });
  });

  it('converts > to quote', () => {
    const result = detectMarkdownShortcut('> wisdom', 'paragraph');
    expect(result).toEqual({ targetType: 'quote', remainingText: 'wisdom' });
  });

  it('converts ``` to code', () => {
    const result = detectMarkdownShortcut('``` ', 'paragraph');
    expect(result).toEqual({ targetType: 'code', remainingText: '' });
  });

  it('converts --- to divider', () => {
    const result = detectMarkdownShortcut('---', 'paragraph');
    expect(result).toEqual({ targetType: 'divider', remainingText: '' });
  });

  it('does not convert when block type is not paragraph', () => {
    expect(detectMarkdownShortcut('# Hello', 'heading')).toBeNull();
    expect(detectMarkdownShortcut('- item', 'bulletList')).toBeNull();
    expect(detectMarkdownShortcut('> quote', 'quote')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(detectMarkdownShortcut('just text', 'paragraph')).toBeNull();
    expect(detectMarkdownShortcut('hello world', 'paragraph')).toBeNull();
  });
});

describe('detectSlashCommand', () => {
  it('detects bare slash', () => {
    expect(detectSlashCommand('/')).toBe('');
  });

  it('detects slash with filter', () => {
    expect(detectSlashCommand('/heading')).toBe('heading');
  });

  it('ignores double slash', () => {
    expect(detectSlashCommand('//comment')).toBeNull();
  });

  it('ignores regular text', () => {
    expect(detectSlashCommand('hello')).toBeNull();
    expect(detectSlashCommand('hello /world')).toBeNull();
  });
});
