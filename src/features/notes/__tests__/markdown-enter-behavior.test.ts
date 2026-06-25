import { describe, expect, it } from 'vitest';

import {
  applyMarkdownEnterBehaviorFromTextChange,
  continueMarkdownTodoOnEnter,
} from '../markdown/markdown-enter-behavior';

describe('markdown-enter-behavior', () => {
  it('continues a non-empty todo on enter', () => {
    expect(continueMarkdownTodoOnEnter('- [ ] Task', { start: 10, end: 10 })).toEqual({
      markdown: '- [ ] Task\n- [ ] ',
      selection: { start: 17, end: 17 },
    });
  });

  it('exits an empty todo on enter', () => {
    expect(continueMarkdownTodoOnEnter('- [ ] ', { start: 6, end: 6 })).toEqual({
      markdown: '',
      selection: { start: 0, end: 0 },
    });
  });

  it('detects a plain text change caused by enter', () => {
    expect(applyMarkdownEnterBehaviorFromTextChange('- [x] Done', '- [x] Done\n', { start: 10, end: 10 })).toEqual({
      markdown: '- [x] Done\n- [ ] ',
      selection: { start: 17, end: 17 },
    });
  });

  it('ignores non-todo enter changes', () => {
    expect(applyMarkdownEnterBehaviorFromTextChange('Hello', 'Hello\n', { start: 5, end: 5 })).toBeNull();
  });
});
