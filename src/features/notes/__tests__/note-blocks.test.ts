import { describe, expect, it, vi } from 'vitest';

import {
  applyNotePatch,
  blocksToHtml,
  blocksToMarkdown,
  blocksToPlainText,
  createTextBlock,
  createTodoBlock,
  htmlToBlocks,
  normalizeBlocks,
  noteTextToBlocks,
  noteToBlocks,
  type NoteBlock,
  type NoteAiPatch,
} from '../note-blocks';

function textBlock(id: string, text: string): NoteBlock {
  return { id, type: 'paragraph', text, createdAt: 1, updatedAt: 1 };
}

describe('note-blocks', () => {
  it('converts text paragraphs into editable blocks', () => {
    const blocks = noteTextToBlocks('第一段\n\n第二段');
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    expect(blocks.map((b) => 'text' in b ? b.text : '')).toEqual(['第一段', '第二段']);
  });

  it('prefers existing note blocks over legacy text', () => {
    const blocks = [textBlock('existing', '已有块')];
    expect(noteToBlocks({ text: '旧文本', blocks })).toBe(blocks);
  });

  it('serializes mixed blocks into plain text', () => {
    const blocks: NoteBlock[] = [
      textBlock('a', '标题'),
      { id: 'todo', type: 'todo', text: '跟进需求', checked: false, createdAt: 1, updatedAt: 1 },
      { id: 'done', type: 'todo', text: '完成设计', checked: true, createdAt: 1, updatedAt: 1 },
      { id: 'line', type: 'divider', createdAt: 1, updatedAt: 1 },
    ];
    expect(blocksToPlainText(blocks)).toBe('标题\n\n[ ] 跟进需求\n\n[x] 完成设计\n\n---');
  });

  it('applies replace, insert, and update patch operations', () => {
    vi.setSystemTime(1000);
    const original = [textBlock('a', 'A'), textBlock('b', 'B')];
    const patch: NoteAiPatch = {
      id: 'patch-1',
      summary: '整理',
      operations: [
        { type: 'insertBlocksAfter', afterBlockId: 'a', blocks: [textBlock('inserted', '插入')] },
        { type: 'updateBlock', blockId: 'b', patch: { text: '更新后' } },
      ],
    };
    const updated = applyNotePatch(original, patch);
    expect(updated.map((b) => b.id)).toEqual(['a', 'inserted', 'b']);
    expect(updated[2]).toMatchObject({ id: 'b', text: '更新后', updatedAt: 1000 });
    vi.useRealTimers();
  });

  it('normalizes empty blocks to one paragraph block', () => {
    expect(normalizeBlocks([])).toHaveLength(1);
    expect(createTextBlock('heading', '标题')).toMatchObject({ type: 'heading', text: '标题', level: 2 });
    expect(createTodoBlock('事项')).toMatchObject({ type: 'todo', text: '事项', checked: false });
  });
});

describe('blocksToHtml', () => {
  it('converts paragraph to <p>', () => {
    const html = blocksToHtml([textBlock('a', 'Hello world')]);
    expect(html).toBe('<p data-block-id="a">Hello world</p>');
  });

  it('converts empty paragraph to <p><br></p>', () => {
    const html = blocksToHtml([textBlock('a', '')]);
    expect(html).toBe('<p data-block-id="a"><br></p>');
  });

  it('converts heading with level', () => {
    const block = Object.assign(createTextBlock('heading', '标题'), { level: 1 as const, id: 'h' });
    const html = blocksToHtml([block]);
    expect(html).toBe('<h1 data-block-id="h">标题</h1>');
  });

  it('converts todo blocks', () => {
    const checked: NoteBlock = { id: 't1', type: 'todo', text: 'Done', checked: true, createdAt: 1, updatedAt: 1 };
    const unchecked: NoteBlock = { id: 't2', type: 'todo', text: 'Pending', checked: false, createdAt: 1, updatedAt: 1 };
    const html = blocksToHtml([checked, unchecked]);
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('Done');
    expect(html).toContain('Pending');
  });

  it('converts bullet and numbered lists', () => {
    const bullet = createTextBlock('bulletList', 'Item A');
    const numbered = createTextBlock('numberedList', 'Step 1');
    const html = blocksToHtml([bullet, numbered]);
    expect(html).toMatch(/<ul data-block-id="[^"]+"><li><p>Item A<\/p><\/li><\/ul>/);
    expect(html).toMatch(/<ol data-block-id="[^"]+"><li><p>Step 1<\/p><\/li><\/ol>/);
  });

  it('converts quote and code', () => {
    const quote = createTextBlock('quote', '名言');
    const code = createTextBlock('code', 'const x = 1;');
    const html = blocksToHtml([quote, code]);
    expect(html).toMatch(/<blockquote data-block-id="[^"]+"><p>名言<\/p><\/blockquote>/);
    expect(html).toMatch(/<pre data-block-id="[^"]+"><code>const x = 1;<\/code><\/pre>/);
  });

  it('converts divider to <hr>', () => {
    const divider: NoteBlock = { id: 'd', type: 'divider', createdAt: 1, updatedAt: 1 };
    expect(blocksToHtml([divider])).toBe('<hr data-block-id="d">');
  });

  it('escapes HTML entities in text', () => {
    const html = blocksToHtml([textBlock('a', '<script>alert("xss")</script>')]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('htmlToBlocks', () => {
  it('parses <p> into paragraph blocks', () => {
    const blocks = htmlToBlocks('<p>Hello</p><p>World</p>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: 'Hello' });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'World' });
  });

  it('parses headings with correct levels', () => {
    const blocks = htmlToBlocks('<h1>Title</h1><h2>Sub</h2><h3>Detail</h3>');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Title', level: 1 });
    expect(blocks[1]).toMatchObject({ type: 'heading', text: 'Sub', level: 2 });
    expect(blocks[2]).toMatchObject({ type: 'heading', text: 'Detail', level: 3 });
  });

  it('parses task list items', () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>Done</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Todo</p></div></li></ul>';
    const blocks = htmlToBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'todo', text: 'Done', checked: true });
    expect(blocks[1]).toMatchObject({ type: 'todo', text: 'Todo', checked: false });
  });

  it('parses bullet list', () => {
    const blocks = htmlToBlocks('<ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'bulletList', text: 'Alpha' });
    expect(blocks[1]).toMatchObject({ type: 'bulletList', text: 'Beta' });
  });

  it('parses ordered list', () => {
    const blocks = htmlToBlocks('<ol><li><p>First</p></li><li><p>Second</p></li></ol>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'numberedList', text: 'First' });
  });

  it('parses blockquote', () => {
    const blocks = htmlToBlocks('<blockquote><p>Quote text</p></blockquote>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'quote', text: 'Quote text' });
  });

  it('parses code block', () => {
    const blocks = htmlToBlocks('<pre><code>let x = 1;</code></pre>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'code', text: 'let x = 1;' });
  });

  it('parses <hr> as divider', () => {
    const blocks = htmlToBlocks('<p>Before</p><hr><p>After</p>');
    expect(blocks).toHaveLength(3);
    expect(blocks[1].type).toBe('divider');
  });

  it('returns empty paragraph for empty input', () => {
    expect(htmlToBlocks('')).toHaveLength(1);
    expect(htmlToBlocks('')[0].type).toBe('paragraph');
  });

  it('roundtrips: blocks → html → blocks preserves structure', () => {
    const original: NoteBlock[] = [
      Object.assign(createTextBlock('heading', '标题'), { level: 2 as const, id: 'h1' }),
      Object.assign(createTextBlock('paragraph', '正文内容'), { id: 'p1' }),
      { id: 'todo1', type: 'todo' as const, text: '待办事项', checked: false, createdAt: 1, updatedAt: 1 },
      Object.assign(createTextBlock('bulletList', '列表项'), { id: 'b1' }),
      Object.assign(createTextBlock('quote', '引用文字'), { id: 'q1' }),
      { id: 'div', type: 'divider' as const, createdAt: 1, updatedAt: 1 },
    ];
    const html = blocksToHtml(original);
    const restored = htmlToBlocks(html, original);

    expect(restored).toHaveLength(original.length);
    expect(restored[0]).toMatchObject({ id: 'h1', type: 'heading', text: '标题', level: 2 });
    expect(restored[1]).toMatchObject({ id: 'p1', type: 'paragraph', text: '正文内容' });
    expect(restored[2]).toMatchObject({ id: 'todo1', type: 'todo', text: '待办事项', checked: false });
    expect(restored[3]).toMatchObject({ id: 'b1', type: 'bulletList', text: '列表项' });
    expect(restored[4]).toMatchObject({ id: 'q1', type: 'quote', text: '引用文字' });
    expect(restored[5]).toMatchObject({ id: 'div', type: 'divider' });
  });

  it('preserves block ids when converting html back to blocks', () => {
    const original = [textBlock('stable-id', 'Hello'), textBlock('second-id', 'World')];
    const restored = htmlToBlocks(blocksToHtml(original), original);
    expect(restored.map((block) => block.id)).toEqual(['stable-id', 'second-id']);
  });
});

describe('blocksToMarkdown', () => {
  it('serializes heading with correct prefix', () => {
    const block = Object.assign(createTextBlock('heading', 'Title'), { level: 1 as const });
    expect(blocksToMarkdown([block])).toBe('# Title');
  });

  it('serializes todo with checkbox', () => {
    const blocks: NoteBlock[] = [
      { id: 'a', type: 'todo', text: 'Done', checked: true, createdAt: 1, updatedAt: 1 },
      { id: 'b', type: 'todo', text: 'Open', checked: false, createdAt: 1, updatedAt: 1 },
    ];
    expect(blocksToMarkdown(blocks)).toBe('- [x] Done\n\n- [ ] Open');
  });

  it('round-trips inline image blocks through html', () => {
    const src = 'data:image/png;base64,abc123';
    const html = blocksToHtml([{ id: 'img-1', type: 'image', src, alt: 'shot', createdAt: 1, updatedAt: 1 }]);
    const blocks = htmlToBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'image', src, alt: 'shot' });
  });
});
