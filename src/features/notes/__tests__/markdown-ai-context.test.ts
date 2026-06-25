import { describe, expect, it } from 'vitest';

import { buildNativeEditorAiContext } from '../markdown/markdown-ai-context';

describe('markdown-ai-context', () => {
  it('prefers an explicit selection', () => {
    expect(buildNativeEditorAiContext('Alpha\n\nBeta', 0, 5)).toMatchObject({
      markdown: 'Alpha',
      currentBlockMarkdown: 'Alpha',
      contextType: 'selection',
    });
  });

  it('uses the current paragraph when there is no selection', () => {
    expect(buildNativeEditorAiContext('Alpha\n\nBeta text\nmore', 9, 9)).toMatchObject({
      markdown: '',
      currentBlockMarkdown: 'Beta text\nmore',
      beforeMarkdown: 'Alpha\n\n',
      contextType: 'block',
    });
  });

  it('falls back to note context on an empty block', () => {
    expect(buildNativeEditorAiContext('\n\n', 1, 1)).toMatchObject({
      contextType: 'note',
    });
  });
});
