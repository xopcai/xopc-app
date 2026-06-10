import { describe, expect, it } from 'vitest';

import {
  createTransientBlockAfter,
  exitTransientContinuation,
  markdownForStructuredTextInput,
  markdownForTransientInput,
  markdownForTransientInsertion,
  mergeStructuredBlocks,
  resolveParagraphShortcut,
  shouldCreateTransientBlock,
  shouldExitTransientContinuation,
  splitStructuredTextInput,
  transformStructuredTextInput,
} from '../markdown/markdown-editing';
import { parseMarkdownDocument } from '../markdown/markdown-document';

function firstBlock(markdown: string) {
  const block = parseMarkdownDocument(markdown).blocks[0];
  if (!block) throw new Error('Expected parsed block');
  return block;
}

describe('markdown-editing', () => {
  it('splits heading input into a heading and following paragraph markdown', () => {
    const block = firstBlock('## Plan');

    expect(markdownForStructuredTextInput(block, 'Plan\nNext step')).toBe('## Plan\n\nNext step');
    expect(splitStructuredTextInput(block, 'Plan\nNext step')).toEqual({
      markdown: '## Plan\n\nNext step',
      focusOffset: 18,
    });
  });

  it('splits paragraph input into separate paragraphs', () => {
    const block = firstBlock('One');

    expect(markdownForStructuredTextInput(block, 'One\nTwo\nThree')).toBe('One\n\nTwo\n\nThree');
  });

  it('continues todo, bullet, numbered, and quote blocks', () => {
    expect(markdownForStructuredTextInput(firstBlock('- [ ] First'), 'First\nSecond')).toBe('- [ ] First\n- [ ] Second');
    expect(markdownForStructuredTextInput(firstBlock('- First'), 'First\nSecond')).toBe('- First\n- Second');
    expect(markdownForStructuredTextInput(firstBlock('3. First'), 'First\nSecond')).toBe('3. First\n4. Second');
    expect(markdownForStructuredTextInput(firstBlock('> First'), 'First\nSecond')).toBe('> First\n> Second');
    expect(markdownForStructuredTextInput(firstBlock('> [!NOTE] First'), 'First\nSecond')).toBe('> [!NOTE] First\n> Second');
    expect(splitStructuredTextInput(firstBlock('> [!WARNING]+ First'), 'First\nSecond')).toEqual({
      markdown: '> [!WARNING]+ First\n> Second',
      focusOffset: 28,
    });
    expect(splitStructuredTextInput(firstBlock('- First'), 'First\nSecond')).toEqual({
      markdown: '- First\n- Second',
      focusOffset: 16,
    });
  });

  it('turns paragraph markdown shortcuts into structured markdown blocks', () => {
    const block = firstBlock('Draft');

    expect(resolveParagraphShortcut(block, '## Roadmap')).toEqual({
      markdown: '## Roadmap',
      focusOffset: 10,
    });
    expect(markdownForStructuredTextInput(block, '- [ ] Follow up')).toBe('- [ ] Follow up');
    expect(markdownForStructuredTextInput(block, '- [x] Done')).toBe('- [x] Done');
    expect(markdownForStructuredTextInput(block, '* Bullet')).toBe('* Bullet');
    expect(markdownForStructuredTextInput(block, '12. Step')).toBe('12. Step');
    expect(markdownForStructuredTextInput(block, '> Quote')).toBe('> Quote');
    expect(transformStructuredTextInput(block, '> [!NOTE] Remember')).toEqual({
      markdown: '> [!NOTE] Remember',
      focusOffset: 18,
    });
    expect(transformStructuredTextInput(block, '> [!WARNING]+ Check')).toEqual({
      markdown: '> [!WARNING]+ Check',
      focusOffset: 19,
    });
    expect(transformStructuredTextInput(block, '![Alt](image.png)')).toEqual({
      markdown: '![Alt](image.png)',
      focusOffset: 17,
    });
    expect(transformStructuredTextInput(block, '```ts')).toEqual({
      markdown: '```ts\n\n```',
      focusOffset: 6,
    });
  });

  it('preserves pasted structured Markdown inside a paragraph block', () => {
    const block = firstBlock('Draft');
    const pasted = '\n## Plan\n\n- [ ] Follow up\n\n```ts\nconst ok = true;\n```\n';
    const markdown = '## Plan\n\n- [ ] Follow up\n\n```ts\nconst ok = true;\n```';

    expect(transformStructuredTextInput(block, pasted)).toEqual({
      markdown,
      focusOffset: markdown.length,
    });
    expect(parseMarkdownDocument(markdown).blocks.map((item) => item.type)).toEqual(['heading', 'todo', 'code']);
  });

  it('preserves pasted structured Markdown inside list-like blocks', () => {
    const block = firstBlock('- Draft');
    const pasted = '## Plan\n\n![Alt](image.png)\n\n- [ ] Follow up';

    expect(transformStructuredTextInput(block, pasted)).toEqual({
      markdown: pasted,
      focusOffset: pasted.length,
    });
    expect(parseMarkdownDocument(pasted).blocks.map((item) => item.type)).toEqual(['heading', 'image', 'todo']);
  });

  it('does not apply paragraph markdown shortcuts inside non-paragraph blocks', () => {
    expect(resolveParagraphShortcut(firstBlock('- Draft'), '## Roadmap')).toBeNull();
    expect(markdownForStructuredTextInput(firstBlock('- Draft'), '## Roadmap')).toBeNull();
  });

  it('does not split code blocks or trailing blank newline input', () => {
    expect(markdownForStructuredTextInput(firstBlock('```ts\none\n```'), 'one\ntwo')).toBeNull();
    expect(markdownForStructuredTextInput(firstBlock('- First'), 'First\n')).toBeNull();
  });

  it('merges adjacent editable blocks and keeps focus at the join point', () => {
    const [previous, current] = parseMarkdownDocument('- First\n- Second').blocks;
    if (!previous || !current) throw new Error('Expected adjacent blocks');

    expect(mergeStructuredBlocks(previous, current)).toEqual({
      markdown: '- FirstSecond',
      focusOffset: 7,
    });
  });

  it('does not merge unsupported blocks', () => {
    const [previous, current] = parseMarkdownDocument('![Alt](image.png)\n\nBody').blocks;
    if (!previous || !current) throw new Error('Expected adjacent blocks');

    expect(mergeStructuredBlocks(previous, current)).toBeNull();
  });

  it('creates transient empty blocks for trailing newline input', () => {
    const heading = firstBlock('## Plan');
    const bullet = firstBlock('- First');
    const numbered = firstBlock('3. First');
    const callout = firstBlock('> [!NOTE] First');
    const foldedCallout = firstBlock('> [!NOTE]+ First');

    expect(shouldCreateTransientBlock(heading, 'Plan\n')).toBe(true);
    expect(createTransientBlockAfter(heading)).toMatchObject({ kind: 'paragraph', insertOffset: 7 });
    expect(createTransientBlockAfter(bullet)).toMatchObject({ kind: 'bulletList', marker: '-', insertOffset: 7 });
    expect(createTransientBlockAfter(numbered)).toMatchObject({ kind: 'numberedList', index: 4, insertOffset: 8 });
    expect(createTransientBlockAfter(callout)).toMatchObject({ kind: 'callout', insertOffset: 15 });
    expect(createTransientBlockAfter(foldedCallout)).toMatchObject({ kind: 'callout', insertOffset: 16 });
  });

  it('renders transient input into markdown only after the user types content', () => {
    const bullet = createTransientBlockAfter(firstBlock('- First'));
    const paragraph = createTransientBlockAfter(firstBlock('## Plan'));
    if (!bullet || !paragraph) throw new Error('Expected transient blocks');

    expect(markdownForTransientInput(bullet, '')).toBeNull();
    expect(markdownForTransientInput(bullet, 'Second')).toEqual({ markdown: '- Second', focusOffset: 8 });
    expect(markdownForTransientInput(paragraph, 'Next\nAfter')).toEqual({ markdown: 'Next\n\nAfter', focusOffset: 11 });
  });

  it('continues transient callout input inside the same Obsidian callout block', () => {
    const callout = createTransientBlockAfter(firstBlock('> [!NOTE] First'));
    if (!callout) throw new Error('Expected transient block');

    expect(markdownForTransientInsertion(callout, 'Second')).toEqual({
      markdown: '> Second',
      insertion: '\n> Second',
      focusOffset: 9,
    });
    expect(parseMarkdownDocument(`> [!NOTE] First${markdownForTransientInsertion(callout, 'Second')?.insertion}`).blocks[0]).toMatchObject({
      type: 'callout',
      kind: 'NOTE',
      text: 'First\nSecond',
    });
  });

  it('exits list-like transient continuations to a paragraph placeholder', () => {
    const bullet = createTransientBlockAfter(firstBlock('- First'));
    if (!bullet) throw new Error('Expected transient block');

    expect(shouldExitTransientContinuation(bullet, '\n')).toBe(true);
    expect(exitTransientContinuation(bullet)).toEqual({
      afterBlockId: bullet.afterBlockId,
      insertOffset: bullet.insertOffset,
      kind: 'paragraph',
    });
    expect(shouldExitTransientContinuation(exitTransientContinuation(bullet), '\n')).toBe(false);
  });
});
