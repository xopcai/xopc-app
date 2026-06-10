import { describe, expect, it } from 'vitest';

import { markdownToBlocks } from '../blocks/convert/markdown-import';

describe('markdown-import', () => {
  it('splits markdown into editor blocks', () => {
    const blocks = markdownToBlocks([
      '## Plan',
      '',
      '- [x] Decide scope',
      '- Ship editor',
      '1. Verify',
      '> Keep it calm',
      '---',
    ].join('\n'));

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'todo',
      'bulletList',
      'numberedList',
      'quote',
      'divider',
    ]);
    expect(blocks[0]).toMatchObject({ text: 'Plan', level: 2 });
    expect(blocks[1]).toMatchObject({ text: 'Decide scope', checked: true });
  });

  it('imports fenced code as one code block', () => {
    const blocks = markdownToBlocks('```ts\nconst ok = true;\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'code', text: 'const ok = true;' });
  });
});
