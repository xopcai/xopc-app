import { describe, expect, it } from 'vitest';

import {
  detectSlashCommand,
  removeSlashCommandText,
  resolveMarkdownShortcut,
} from '../blocks/runtime/editor-input-intents';

describe('editor-input-intents', () => {
  it('turns markdown prefixes into block shortcut intents', () => {
    expect(resolveMarkdownShortcut('## Roadmap')).toEqual({
      blockType: 'heading',
      text: 'Roadmap',
    });
    expect(resolveMarkdownShortcut('- Ship P0')).toEqual({
      blockType: 'bulletList',
      text: 'Ship P0',
    });
    expect(resolveMarkdownShortcut('[] Follow up')).toEqual({
      blockType: 'todo',
      text: 'Follow up',
    });
  });

  it('detects an active slash command at the caret', () => {
    expect(detectSlashCommand('/todo', 5)).toEqual({
      start: 0,
      end: 5,
      query: 'todo',
    });
    expect(detectSlashCommand('Ask /ai', 7)).toEqual({
      start: 4,
      end: 7,
      query: 'ai',
    });
  });

  it('ignores slash tokens after whitespace in the query', () => {
    expect(detectSlashCommand('/todo now', 9)).toBeNull();
    expect(detectSlashCommand('https://xopc.ai', 15)).toBeNull();
  });

  it('removes the slash command text before applying a block type', () => {
    const range = detectSlashCommand('Ship /todo today', 10);
    expect(range).not.toBeNull();
    expect(removeSlashCommandText('Ship /todo today', range!)).toBe('Ship  today');
  });
});
