import { describe, expect, it } from 'vitest';

import {
  blockToMarkdown,
  canFocusStructuredMarkdownRange,
  extractMarkdownWikiLinks,
  findMarkdownMatches,
  formatWikiLink,
  getMarkdownAiContext,
  getMarkdownBodyStartOffset,
  getMarkdownOutline,
  getStructuredMarkdownFocusRange,
  getVisibleMarkdownSelection,
  getWholeMarkdownAiContext,
  isMarkdownRangeInFrontmatter,
  type MarkdownEditorBlock,
  parseMarkdownDocument,
  renderObsidianCalloutsToMarkdown,
  renderWikiLinksToMarkdown,
  serializeMarkdownDocument,
  stripMarkdownFrontmatter,
  summarizeMarkdownAiContext,
} from '../markdown/markdown-document';

describe('markdown-document', () => {
  it('parses common Markdown blocks with source ranges', () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph line one',
      'paragraph line two',
      '',
      '- [x] Done',
      '- Bullet',
      '3. Numbered',
      '> Quote',
      '![Alt](xopc-attachment://notes/note/att)',
    ].join('\n');

    const doc = parseMarkdownDocument(markdown);

    expect(doc.parseWarnings).toEqual([]);
    expect(doc.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'todo',
      'bulletList',
      'numberedList',
      'quote',
      'image',
    ]);
    expect(doc.blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'Title', range: { start: 0, end: 7 } });
    expect(doc.blocks[1]).toMatchObject({ type: 'paragraph', text: 'Paragraph line one\nparagraph line two' });
    expect(doc.blocks[2]).toMatchObject({ type: 'todo', checked: true, text: 'Done' });
    expect(doc.blocks[6]).toMatchObject({ type: 'image', alt: 'Alt', src: 'xopc-attachment://notes/note/att' });
  });

  it('parses empty structural markers as editable empty blocks', () => {
    const doc = parseMarkdownDocument(['## ', '- [ ] ', '- ', '1. ', '> ', '> [!NOTE] '].join('\n'));

    expect(doc.blocks).toHaveLength(6);
    expect(doc.blocks[0]).toMatchObject({ type: 'heading', level: 2, text: '' });
    expect(doc.blocks[1]).toMatchObject({ type: 'todo', checked: false, text: '' });
    expect(doc.blocks[2]).toMatchObject({ type: 'bulletList', text: '' });
    expect(doc.blocks[3]).toMatchObject({ type: 'numberedList', index: 1, text: '' });
    expect(doc.blocks[4]).toMatchObject({ type: 'quote', text: '' });
    expect(doc.blocks[5]).toMatchObject({ type: 'callout', kind: 'NOTE', text: '' });
    expect(blockToMarkdown(doc.blocks[0]!)).toBe('## ');
    expect(blockToMarkdown(doc.blocks[1]!)).toBe('- [ ] ');
    expect(blockToMarkdown(doc.blocks[2]!)).toBe('- ');
    expect(blockToMarkdown(doc.blocks[3]!)).toBe('1. ');
    expect(blockToMarkdown(doc.blocks[4]!)).toBe('> ');
    expect(blockToMarkdown(doc.blocks[5]!)).toBe('> [!NOTE]');
  });

  it('parses fenced code as one block', () => {
    const doc = parseMarkdownDocument('```ts\nconst ok = true;\n```');

    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({
      type: 'code',
      language: 'ts',
      code: 'const ok = true;',
    });
    expect(blockToMarkdown(doc.blocks[0])).toBe('```ts\nconst ok = true;\n```');
  });

  it('parses Obsidian callouts as structured Markdown blocks', () => {
    const markdown = '> [!NOTE] Remember this\n> Follow up';
    const doc = parseMarkdownDocument(markdown);

    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({
      type: 'callout',
      kind: 'NOTE',
      text: 'Remember this\nFollow up',
    });
    expect(blockToMarkdown(doc.blocks[0]!)).toBe(markdown);

    const folded = parseMarkdownDocument('> [!WARNING]+ Check this');
    expect(folded.blocks[0]).toMatchObject({
      type: 'callout',
      kind: 'WARNING',
      fold: '+',
      text: 'Check this',
    });
    expect(blockToMarkdown(folded.blocks[0]!)).toBe('> [!WARNING]+ Check this');

    const numericKind = parseMarkdownDocument('> [!404_ERROR] Missing');
    expect(numericKind.blocks[0]).toMatchObject({
      type: 'callout',
      kind: '404_ERROR',
      text: 'Missing',
    });
    expect(blockToMarkdown(numericKind.blocks[0]!)).toBe('> [!404_ERROR] Missing');
  });

  it('keeps frontmatter in source but hides it from structured blocks', () => {
    const markdown = [
      '---',
      'title: "Idea"',
      'tags: ["ai"]',
      '---',
      '',
      '# Visible',
      '',
      'Body',
    ].join('\n');

    const doc = parseMarkdownDocument(markdown);

    expect(doc.source).toBe(markdown);
    expect(doc.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph']);
    expect(doc.blocks[0]).toMatchObject({
      type: 'heading',
      text: 'Visible',
      range: { start: 36, end: 45 },
    });
  });

  it('strips frontmatter for note preview without changing normal markdown', () => {
    expect(stripMarkdownFrontmatter('---\ntitle: "Idea"\n---\n\n# Visible')).toBe('# Visible');
    expect(stripMarkdownFrontmatter('# Visible')).toBe('# Visible');
  });

  it('returns the editable body start after frontmatter and leading blank lines', () => {
    expect(getMarkdownBodyStartOffset('---\ntitle: "Idea"\n---\n\n# Visible')).toBe(23);
    expect(getMarkdownBodyStartOffset('---\ntitle: "Idea"\n---')).toBe(21);
    expect(getMarkdownBodyStartOffset('# Visible')).toBe(0);
  });

  it('detects ranges fully inside frontmatter', () => {
    const markdown = '---\ntitle: "Idea"\n---\n\n# Visible';

    expect(isMarkdownRangeInFrontmatter(markdown, { start: 4, end: 15 })).toBe(true);
    expect(isMarkdownRangeInFrontmatter(markdown, { start: 4, end: 24 })).toBe(false);
    expect(isMarkdownRangeInFrontmatter('# Visible', { start: 0, end: 3 })).toBe(false);
  });

  it('maps hidden frontmatter selections to the visible body start', () => {
    const markdown = '---\ntitle: "Idea"\n---\n\n# Visible';

    expect(getVisibleMarkdownSelection(markdown, { start: 4, end: 15 })).toEqual({ start: 23, end: 23 });
    expect(getVisibleMarkdownSelection(markdown, { start: 4, end: 25 })).toEqual({ start: 23, end: 25 });
    expect(getVisibleMarkdownSelection(markdown, { start: 21, end: 22 })).toEqual({ start: 23, end: 23 });
    expect(getVisibleMarkdownSelection(markdown, { start: 23, end: 32 })).toEqual({ start: 23, end: 32 });
  });

  it('warns but preserves unclosed fenced code', () => {
    const doc = parseMarkdownDocument('```ts\nconst ok = true;');

    expect(doc.parseWarnings).toEqual(['Unclosed fenced code block.']);
    expect(doc.blocks[0]).toMatchObject({
      type: 'code',
      language: 'ts',
      code: 'const ok = true;',
    });
  });

  it('keeps unsupported Markdown as raw blocks', () => {
    const doc = parseMarkdownDocument('| A | B |\n| - | - |\n<div>raw</div>');

    expect(doc.blocks.map((block) => block.type)).toEqual(['raw', 'raw', 'raw']);
    expect(doc.blocks[0]).toMatchObject({ type: 'raw', reason: 'table', text: '| A | B |' });
    expect(doc.blocks[2]).toMatchObject({ type: 'raw', reason: 'html', text: '<div>raw</div>' });
    expect(serializeMarkdownDocument(doc.blocks)).toBe('| A | B |\n\n| - | - |\n\n<div>raw</div>');
  });

  it('serializes edited structured blocks back to Markdown', () => {
    const doc = parseMarkdownDocument('# Old\n\n- [ ] Todo\n\n![Alt](image.png)');
    const [heading, todo, image] = doc.blocks;
    if (heading?.type !== 'heading' || todo?.type !== 'todo' || image?.type !== 'image') {
      throw new Error('Unexpected block parse result');
    }

    const blocks: MarkdownEditorBlock[] = [
      { ...heading, type: 'heading', text: 'New title' },
      { ...todo, type: 'todo', checked: true, text: 'Ship parser' },
      { ...image, type: 'image', alt: 'Diagram', src: 'diagram.png' },
    ];
    const serialized = serializeMarkdownDocument(blocks);

    expect(serialized).toBe('# New title\n\n- [x] Ship parser\n\n![Diagram](diagram.png)');
  });

  it('round-trips escaped image alt text as an image block', () => {
    const markdown = '![Photo \\[final\\] copy](xopc-attachment://notes/n/att)';
    const doc = parseMarkdownDocument(markdown);

    expect(doc.blocks[0]).toMatchObject({
      type: 'image',
      alt: 'Photo [final] copy',
      src: 'xopc-attachment://notes/n/att',
    });
    expect(blockToMarkdown(doc.blocks[0]!)).toBe(markdown);
  });

  it('keeps block ids stable when content changes in place', () => {
    const first = parseMarkdownDocument('## Old title\n\nBody');
    const second = parseMarkdownDocument('## New title\n\nBody');

    expect(first.blocks[0]?.id).toBe(second.blocks[0]?.id);
    expect(first.blocks[1]?.id).toBe(second.blocks[1]?.id);
  });

  it('changes block ids when markdown shortcuts change the block type', () => {
    const paragraph = parseMarkdownDocument('Plain');
    const heading = parseMarkdownDocument('## Plain');

    expect(paragraph.blocks[0]?.id).not.toBe(heading.blocks[0]?.id);
  });

  it('extracts a stable heading outline', () => {
    const outline = getMarkdownOutline('# Intro\n\nBody\n\n## Next step {#next}\n\n### Next step\n\n## Next step');

    expect(outline).toEqual([
      { id: 'intro', title: 'Intro', level: 1, range: { start: 0, end: 7 } },
      { id: 'next', title: 'Next step', level: 2, range: { start: 15, end: 35 } },
      { id: 'next-step', title: 'Next step', level: 3, range: { start: 37, end: 50 } },
      { id: 'next-step-2', title: 'Next step', level: 2, range: { start: 52, end: 64 } },
    ]);
  });

  it('extracts wiki links with aliases and section targets', () => {
    const markdown = 'See [[Project Alpha|Alpha]] and [[Project Beta#Plan]].\n\n```md\n[[Ignored]]\n```';

    expect(extractMarkdownWikiLinks(markdown)).toEqual([
      {
        target: 'Project Alpha',
        label: 'Alpha',
        range: { start: 4, end: 27 },
      },
      {
        target: 'Project Beta',
        heading: 'Plan',
        label: 'Plan',
        range: { start: 32, end: 53 },
      },
    ]);
  });

  it('ignores wiki links in frontmatter', () => {
    const markdown = [
      '---',
      'related: [[Hidden Note]]',
      '---',
      '',
      'See [[Visible Note]].',
    ].join('\n');

    expect(extractMarkdownWikiLinks(markdown)).toEqual([
      {
        target: 'Visible Note',
        label: 'Visible Note',
        range: { start: 38, end: 54 },
      },
    ]);
  });

  it('renders wiki links as internal markdown links for preview', () => {
    expect(renderWikiLinksToMarkdown('See [[Project Alpha|Alpha]] and [[Project Beta#Plan]].')).toBe(
      'See [Alpha](xopc-note://open?title=Project+Alpha) and [Plan](xopc-note://open?title=Project+Beta&heading=Plan).',
    );
  });

  it('renders Obsidian callouts without exposing syntax markers in preview markdown', () => {
    expect(renderObsidianCalloutsToMarkdown('> [!NOTE] Remember this\n> Follow up')).toBe(
      '> **Note** - Remember this\n> Follow up',
    );
    expect(renderObsidianCalloutsToMarkdown('> [!ACTION_ITEM] Ship it')).toBe(
      '> **Action Item** - Ship it',
    );
    expect(renderObsidianCalloutsToMarkdown('> [!404_ERROR] Missing')).toBe(
      '> **404 Error** - Missing',
    );
    expect(renderObsidianCalloutsToMarkdown('> [!WARNING]+ Check this')).toBe(
      '> **Warning** - Check this',
    );
    expect(renderObsidianCalloutsToMarkdown('```md\n> [!NOTE] Keep syntax\n```')).toBe(
      '```md\n> [!NOTE] Keep syntax\n```',
    );
  });

  it('formats wiki links for mobile insertion', () => {
    expect(formatWikiLink('  Project   Alpha  ')).toBe('[[Project Alpha]]');
    expect(formatWikiLink('Bad ]] Title')).toBe('[[Bad ] Title]]');
    expect(formatWikiLink('\n')).toBe('[[Untitled]]');
    expect(formatWikiLink('Project Alpha', 'Alpha')).toBe('[[Project Alpha|Alpha]]');
    expect(formatWikiLink('Project Alpha', 'Project Alpha')).toBe('[[Project Alpha]]');
    expect(formatWikiLink('Project Alpha', 'A | B ]] C')).toBe('[[Project Alpha|A B ] C]]');
  });

  it('finds document search matches with source ranges and snippets', () => {
    const markdown = '# Plan\n\nAlpha task\n\nbeta ALPHA note';

    expect(findMarkdownMatches(markdown, 'alpha')).toEqual([
      {
        id: 'match_8_13',
        query: 'Alpha',
        range: { start: 8, end: 13 },
        snippet: '# Plan Alpha task beta ALPHA note',
      },
      {
        id: 'match_25_30',
        query: 'ALPHA',
        range: { start: 25, end: 30 },
        snippet: '# Plan Alpha task beta ALPHA note',
      },
    ]);
    expect(findMarkdownMatches(markdown, '   ')).toEqual([]);
  });

  it('ignores search matches in frontmatter', () => {
    const markdown = [
      '---',
      'title: Alpha',
      '---',
      '',
      '# Visible',
      '',
      'Alpha body',
    ].join('\n');

    expect(findMarkdownMatches(markdown, 'alpha')).toEqual([
      {
        id: 'match_33_38',
        query: 'Alpha',
        range: { start: 33, end: 38 },
        snippet: '...# Visible Alpha body',
      },
    ]);
  });

  it('finds search matches inside fenced code blocks', () => {
    const markdown = 'Intro\n\n```ts\nconst alpha = true;\n```\n\nOutro alpha';

    expect(findMarkdownMatches(markdown, 'alpha')).toEqual([
      {
        id: 'match_19_24',
        query: 'alpha',
        range: { start: 19, end: 24 },
        snippet: 'Intro ```ts const alpha = true; ``` Outro alpha',
      },
      {
        id: 'match_44_49',
        query: 'alpha',
        range: { start: 44, end: 49 },
        snippet: '...st alpha = true; ``` Outro alpha',
      },
    ]);
  });

  it('detects whether a source range can be focused in the structured editor', () => {
    const markdown = 'Body alpha\n\n```ts\nconst alpha = true;\n```\n\n![alpha](image.png)\n\n| alpha | beta |';

    expect(canFocusStructuredMarkdownRange(markdown, { start: 5, end: 10 })).toBe(true);
    expect(canFocusStructuredMarkdownRange(markdown, { start: 25, end: 30 })).toBe(true);
    expect(canFocusStructuredMarkdownRange(markdown, { start: 48, end: 53 })).toBe(false);
    expect(canFocusStructuredMarkdownRange(markdown, { start: 70, end: 75 })).toBe(false);
  });

  it('maps source selections to a stable structured editor focus range', () => {
    const markdown = [
      'Intro',
      '',
      '```ts',
      'const alpha = true;',
      '```',
      '',
      '![alpha](image.png)',
      '',
      'After',
      '',
      '| alpha | beta |',
    ].join('\n');

    expect(getStructuredMarkdownFocusRange(markdown, { start: 16, end: 21 })).toEqual({ start: 16, end: 21 });
    expect(getStructuredMarkdownFocusRange(markdown, { start: 46, end: 51 })).toEqual({ start: 59, end: 59 });
    expect(getStructuredMarkdownFocusRange(markdown, { start: 72, end: 78 })).toEqual({ start: 59, end: 59 });
  });

  it('builds AI context from selection, section, current block, or whole note', () => {
    const markdown = '# Intro\n\nLead\n\n## Plan {#plan}\n\nDo alpha\n\n### Detail\n\nMore\n\n## Next\n\nDone';

    expect(getMarkdownAiContext(markdown, { start: 17, end: 26 })).toEqual({
      type: 'selection',
      range: { start: 17, end: 26 },
      markdown: ' Plan {#p',
    });
    expect(getMarkdownAiContext(markdown, { start: 34, end: 34 })).toEqual({
      type: 'section',
      range: { start: 15, end: 60 },
      markdown: '## Plan {#plan}\n\nDo alpha\n\n### Detail\n\nMore',
      heading: 'Plan',
      headingLevel: 2,
      sectionId: 'plan',
    });
    expect(getMarkdownAiContext('Body only', { start: 0, end: 0 })).toEqual({
      type: 'block',
      range: { start: 0, end: 9 },
      markdown: 'Body only',
      blockType: 'paragraph',
    });
    expect(getMarkdownAiContext('Intro\n\n> [!NOTE] Remember\n> Follow up', { start: 18, end: 18 })).toEqual({
      type: 'block',
      range: { start: 7, end: 37 },
      markdown: '> [!NOTE] Remember\n> Follow up',
      blockType: 'callout',
    });
    expect(getMarkdownAiContext('```ts\nconst ok = true;\n```', { start: 12, end: 12 })).toEqual({
      type: 'block',
      range: { start: 0, end: 26 },
      markdown: '```ts\nconst ok = true;\n```',
      blockType: 'code',
    });
  });

  it('builds whole-note AI context without selecting the current section', () => {
    const markdown = '# Intro\n\nLead\n\n## Plan\n\nDo alpha';

    expect(getWholeMarkdownAiContext(markdown)).toEqual({
      type: 'note',
      range: { start: 0, end: markdown.length },
      markdown,
    });
  });

  it('summarizes AI context for sheet preview', () => {
    expect(summarizeMarkdownAiContext({
      type: 'note',
      range: { start: 0, end: 0 },
      markdown: 'Alpha\n\nBeta   Gamma',
    })).toBe('Alpha Beta Gamma');
    expect(summarizeMarkdownAiContext({
      type: 'note',
      range: { start: 0, end: 0 },
      markdown: '---\ntitle: "Hidden"\n---\n\nVisible body',
    })).toBe('Visible body');
    expect(summarizeMarkdownAiContext({
      type: 'selection',
      range: { start: 0, end: 20 },
      markdown: '1234567890 1234567890',
    }, 12)).toBe('1234567890…');
  });
});
