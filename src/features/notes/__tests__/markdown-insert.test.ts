import { describe, expect, it } from 'vitest';

import { formatMarkdownImage, insertMarkdownCallout, insertMarkdownCodeBlock, insertMarkdownHeading, insertMarkdownLineTemplate, insertMarkdownLink, insertMarkdownPrefixedLines, wrapMarkdownSelection } from '../markdown/markdown-insert';

describe('markdown-insert', () => {
  it('inserts a line template at the beginning without a leading blank line', () => {
    expect(insertMarkdownLineTemplate('', { start: 0, end: 0 }, '## ')).toEqual({
      markdown: '## ',
      selection: { start: 3, end: 3 },
    });
  });

  it('separates inserted block templates from surrounding text', () => {
    expect(insertMarkdownLineTemplate('AlphaBeta', { start: 5, end: 5 }, '- [ ] ')).toEqual({
      markdown: 'Alpha\n- [ ] \nBeta',
      selection: { start: 12, end: 12 },
    });
  });

  it('replaces selected text with a block template and keeps the caret in the new block', () => {
    expect(insertMarkdownLineTemplate('Alpha Beta', { start: 0, end: 5 }, '## ')).toEqual({
      markdown: '## \n Beta',
      selection: { start: 3, end: 3 },
    });
  });

  it('can use selected text as block template content', () => {
    expect(insertMarkdownLineTemplate('Alpha\nBeta Gamma', { start: 0, end: 10 }, '## ', undefined, { useSelectionAsContent: true })).toEqual({
      markdown: '## Alpha Beta\n Gamma',
      selection: { start: 13, end: 13 },
    });
  });

  it('can use selected text as an Obsidian callout title', () => {
    expect(insertMarkdownLineTemplate('Remember this', { start: 0, end: 13 }, '> [!NOTE] ', undefined, { useSelectionAsContent: true })).toEqual({
      markdown: '> [!NOTE] Remember this',
      selection: { start: 23, end: 23 },
    });
  });

  it('inserts a markdown heading with the caret after the marker', () => {
    expect(insertMarkdownHeading('', { start: 0, end: 0 }, 2)).toEqual({
      markdown: '## ',
      selection: { start: 3, end: 3 },
    });
  });

  it('turns the first selected line into a heading and preserves the rest as body', () => {
    expect(insertMarkdownHeading('Alpha\nBeta\nGamma', { start: 0, end: 10 }, 2)).toEqual({
      markdown: '## Alpha\n\nBeta\nGamma',
      selection: { start: 14, end: 14 },
    });
  });

  it('inserts an Obsidian callout with the caret in the title', () => {
    expect(insertMarkdownCallout('', { start: 0, end: 0 })).toEqual({
      markdown: '> [!NOTE] ',
      selection: { start: 10, end: 10 },
    });
  });

  it('turns selected lines into one Obsidian callout block', () => {
    const markdown = 'Title\nDetail one\nDetail two';
    expect(insertMarkdownCallout(markdown, { start: 0, end: markdown.length })).toEqual({
      markdown: '> [!NOTE] Title\n> Detail one\n> Detail two',
      selection: { start: 41, end: 41 },
    });
  });

  it('inserts image markdown as a separated block template', () => {
    const image = '![Photo](xopc-attachment://notes/n/att)';
    expect(insertMarkdownLineTemplate('AlphaBeta', { start: 5, end: 5 }, image)).toEqual({
      markdown: `Alpha\n${image}\nBeta`,
      selection: { start: 5 + 1 + image.length, end: 5 + 1 + image.length },
    });
  });

  it('converts selected lines into prefixed markdown lines', () => {
    expect(insertMarkdownPrefixedLines('Alpha\nBeta\nGamma', { start: 0, end: 10 }, '- ')).toEqual({
      markdown: '- Alpha\n- Beta\nGamma',
      selection: { start: 14, end: 14 },
    });
  });

  it('converts selected lines into todo markdown lines', () => {
    expect(insertMarkdownPrefixedLines('Alpha\nBeta\nGamma', { start: 0, end: 10 }, '- [ ] ', 6)).toEqual({
      markdown: '- [ ] Alpha\n- [ ] Beta\nGamma',
      selection: { start: 22, end: 22 },
    });
    expect(insertMarkdownPrefixedLines('', { start: 0, end: 0 }, '- [ ] ', 6)).toEqual({
      markdown: '- [ ] ',
      selection: { start: 6, end: 6 },
    });
  });

  it('inserts a numbered markdown line with a dynamic prefix', () => {
    expect(insertMarkdownPrefixedLines('Alpha\nBeta', { start: 0, end: 10 }, (index) => `${index + 1}. `)).toEqual({
      markdown: '1. Alpha\n2. Beta',
      selection: { start: 16, end: 16 },
    });
  });

  it('inserts a fenced code block with the caret inside the fence', () => {
    expect(insertMarkdownCodeBlock('AlphaBeta', { start: 5, end: 5 })).toEqual({
      markdown: 'Alpha\n```\n\n```\nBeta',
      selection: { start: 10, end: 10 },
    });
  });

  it('wraps selected text in a fenced code block', () => {
    expect(insertMarkdownCodeBlock('Alpha\nBeta', { start: 0, end: 10 }, 'ts')).toEqual({
      markdown: '```ts\nAlpha\nBeta\n```',
      selection: { start: 20, end: 20 },
    });
  });

  it('preserves indentation when wrapping selected text in a fenced code block', () => {
    expect(insertMarkdownCodeBlock('\n  const ok = true;\n', { start: 0, end: 20 }, 'ts')).toEqual({
      markdown: '```ts\n  const ok = true;\n```',
      selection: { start: 28, end: 28 },
    });
  });

  it('formats image markdown with escaped alt text', () => {
    expect(formatMarkdownImage('Photo [final]\ncopy', 'xopc-attachment://notes/n/att')).toBe(
      '![Photo \\[final\\] copy](xopc-attachment://notes/n/att)',
    );
  });

  it('wraps selected inline text and moves the caret after the wrapped content', () => {
    expect(wrapMarkdownSelection('Alpha Beta', { start: 0, end: 5 }, '**')).toEqual({
      markdown: '**Alpha** Beta',
      selection: { start: 9, end: 9 },
    });
  });

  it('inserts and selects a short inline placeholder when there is no selection', () => {
    expect(wrapMarkdownSelection('Alpha ', { start: 6, end: 6 }, '`')).toEqual({
      markdown: 'Alpha `text`',
      selection: { start: 7, end: 11 },
    });
  });

  it('inserts a markdown link and selects the label when there is no selection', () => {
    expect(insertMarkdownLink('Alpha ', { start: 6, end: 6 })).toEqual({
      markdown: 'Alpha [title](https://)',
      selection: { start: 7, end: 12 },
    });
  });

  it('wraps selected text as a markdown link and selects the url', () => {
    expect(insertMarkdownLink('Alpha Beta', { start: 6, end: 10 })).toEqual({
      markdown: 'Alpha [Beta](https://)',
      selection: { start: 13, end: 21 },
    });
  });

  it('uses a selected url as the href and selects the label placeholder', () => {
    expect(insertMarkdownLink('See https://xopc.ai now', { start: 4, end: 19 })).toEqual({
      markdown: 'See [title](https://xopc.ai) now',
      selection: { start: 5, end: 10 },
    });
  });

  it('escapes selected markdown link labels before insertion', () => {
    expect(insertMarkdownLink('Read [Alpha]\nBeta', { start: 5, end: 17 })).toEqual({
      markdown: 'Read [\\[Alpha\\] Beta](https://)',
      selection: { start: 22, end: 30 },
    });
  });
});
