import type { Note } from '../../query/notes';

// ── Block types ────────────────────────────────────────────

export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'code'
  | 'divider'
  | 'image';

export interface BaseNoteBlock {
  id: string;
  type: NoteBlockType;
  createdAt: number;
  updatedAt: number;
}

export interface TextNoteBlock extends BaseNoteBlock {
  type: 'paragraph' | 'heading' | 'bulletList' | 'numberedList' | 'quote' | 'code';
  text: string;
  level?: 1 | 2 | 3;
}

export interface TodoNoteBlock extends BaseNoteBlock {
  type: 'todo';
  text: string;
  checked: boolean;
}

export interface DividerNoteBlock extends BaseNoteBlock {
  type: 'divider';
}

export interface ImageNoteBlock extends BaseNoteBlock {
  type: 'image';
  src: string;
  alt?: string;
}

export type NoteBlock = TextNoteBlock | TodoNoteBlock | DividerNoteBlock | ImageNoteBlock;

// ── AI patch types ─────────────────────────────────────────

export type NotePatchOperation =
  | { type: 'replaceBlocks'; blocks: NoteBlock[] }
  | { type: 'insertBlocksAfter'; afterBlockId: string; blocks: NoteBlock[] }
  | { type: 'updateBlock'; blockId: string; patch: Partial<NoteBlock> }
  | { type: 'updateMetadata'; title?: string; tags?: string[]; status?: Note['status'] };

export interface NoteAiPatch {
  id: string;
  summary: string;
  operations: NotePatchOperation[];
}

// ── Block factories ────────────────────────────────────────

export function createBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTextBlock(type: TextNoteBlock['type'], text = ''): TextNoteBlock {
  const now = Date.now();
  return {
    id: createBlockId(),
    type,
    text,
    createdAt: now,
    updatedAt: now,
    ...(type === 'heading' ? { level: 2 as const } : null),
  };
}

export function createImageBlock(src: string, alt = ''): ImageNoteBlock {
  const now = Date.now();
  return {
    id: createBlockId(),
    type: 'image',
    src,
    alt,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTodoBlock(text = ''): TodoNoteBlock {
  const now = Date.now();
  return {
    id: createBlockId(),
    type: 'todo',
    text,
    checked: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Legacy text → blocks ───────────────────────────────────

export function noteTextToBlocks(text?: string): NoteBlock[] {
  const source = text?.trimEnd() ?? '';
  if (!source) return [createTextBlock('paragraph')];
  return source.split(/\n{2,}/).map((part) => createTextBlock('paragraph', part.trim()));
}

export function noteToBlocks(note?: Pick<Note, 'text' | 'blocks'> | null): NoteBlock[] {
  if (note?.blocks?.length) return note.blocks;
  return noteTextToBlocks(note?.text);
}

// ── Serialization ──────────────────────────────────────────

export function blocksToPlainText(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'divider') return '---';
      if (block.type === 'image') return `![${block.alt ?? 'image'}](${block.src})`;
      if (block.type === 'todo') return `${block.checked ? '[x]' : '[ ]'} ${block.text}`;
      return block.text;
    })
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
}

export function blocksToMarkdown(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'divider') return '\n---\n';
      if (block.type === 'image') return `![${block.alt ?? 'image'}](${block.src})`;
      if (block.type === 'heading') {
        const prefix = '#'.repeat(block.level ?? 2);
        return `${prefix} ${block.text}`;
      }
      if (block.type === 'todo') return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
      if (block.type === 'bulletList') return `- ${block.text}`;
      if (block.type === 'numberedList') return `1. ${block.text}`;
      if (block.type === 'quote') return `> ${block.text}`;
      if (block.type === 'code') return `\`\`\`\n${block.text}\n\`\`\``;
      return block.text;
    })
    .filter((line) => line.trim().length > 0)
    .join('\n\n');
}

// ── HTML ↔ blocks conversion (for TipTap bridge) ──────────

const BLOCK_ID_ATTR = 'data-block-id';

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function blockIdAttr(id: string): string {
  return ` ${BLOCK_ID_ATTR}="${id}"`;
}

function readBlockId(openTag: string): string | undefined {
  const match = openTag.match(new RegExp(`${BLOCK_ID_ATTR}="([^"]+)"`));
  return match?.[1];
}

function blockWithId<T extends NoteBlock>(block: T, id?: string): T {
  if (!id) return block;
  return { ...block, id };
}

function readAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function unescapeAttr(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** Convert blocks to HTML suitable for TipTap editor `setContent`. */
export function blocksToHtml(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      const id = blockIdAttr(block.id);
      if (block.type === 'divider') return `<hr${id}>`;
      if (block.type === 'image') {
        const alt = block.alt ? ` alt="${escapeAttr(block.alt)}"` : '';
        return `<img${id} src="${escapeAttr(block.src)}"${alt}>`;
      }
      if (block.type === 'heading') {
        const level = block.level ?? 2;
        return `<h${level}${id}>${escapeHtml(block.text)}</h${level}>`;
      }
      if (block.type === 'todo') {
        const checked = block.checked ? ' checked="checked"' : '';
        return `<ul data-type="taskList"${id}><li data-type="taskItem" data-checked="${block.checked ? 'true' : 'false'}"><label><input type="checkbox"${checked}></label><div><p>${escapeHtml(block.text)}</p></div></li></ul>`;
      }
      if (block.type === 'bulletList') return `<ul${id}><li><p>${escapeHtml(block.text)}</p></li></ul>`;
      if (block.type === 'numberedList') return `<ol${id}><li><p>${escapeHtml(block.text)}</p></li></ol>`;
      if (block.type === 'quote') return `<blockquote${id}><p>${escapeHtml(block.text)}</p></blockquote>`;
      if (block.type === 'code') return `<pre${id}><code>${escapeHtml(block.text)}</code></pre>`;
      return `<p${id}>${escapeHtml(block.text) || '<br>'}</p>`;
    })
    .join('');
}

function unescapeHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Normalize TipTap HTML for stable comparison (avoid spurious setContent). */
export function normalizeEditorHtml(html: string): string {
  return html
    .replace(/\sdata-block-id="[^"]*"/g, '')
    .replace(/<p><\/p>/g, '<p><br></p>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse TipTap HTML output back into NoteBlock array. */
export function htmlToBlocks(html: string, previousBlocks: NoteBlock[] = []): NoteBlock[] {
  if (!html?.trim()) return [createTextBlock('paragraph')];

  const previousById = new Map(previousBlocks.map((block) => [block.id, block]));
  let previousIndex = 0;

  const nextId = (explicitId?: string, fallbackType?: NoteBlockType): string => {
    if (explicitId && previousById.has(explicitId)) return explicitId;
    while (previousIndex < previousBlocks.length) {
      const candidate = previousBlocks[previousIndex++];
      if (!fallbackType || candidate.type === fallbackType) return candidate.id;
    }
    return createBlockId();
  };

  const blocks: NoteBlock[] = [];
  const tagPattern =
    /<(h[1-3]|p|ul|ol|blockquote|pre|hr|img)\b([^>]*)>([\s\S]*?)<\/\1>|<hr\b([^>]*)\s*\/?>|<img\b([^>]*)\s*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const fullMatch = match[0];
    const tag = (match[1] || (fullMatch.startsWith('<img') ? 'img' : 'hr')).toLowerCase();
    const attrs = match[2] || match[4] || match[5] || '';
    const inner = match[3] || '';
    const blockId = readBlockId(attrs ? ` ${attrs}` : '');

    if (tag === 'img' || fullMatch.startsWith('<img')) {
      const src = readAttr(attrs, 'src');
      if (src) {
        blocks.push(blockWithId(
          createImageBlock(unescapeAttr(src), unescapeAttr(readAttr(attrs, 'alt') ?? '')),
          nextId(blockId, 'image'),
        ));
      }
      continue;
    }

    if (tag === 'hr' || fullMatch.startsWith('<hr')) {
      blocks.push(blockWithId(
        { id: createBlockId(), type: 'divider', createdAt: Date.now(), updatedAt: Date.now() },
        nextId(blockId, 'divider'),
      ));
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag[1]) as 1 | 2 | 3;
      blocks.push(blockWithId(
        Object.assign(createTextBlock('heading', unescapeHtml(inner)), { level }),
        nextId(blockId, 'heading'),
      ));
      continue;
    }

    if (tag === 'blockquote') {
      blocks.push(blockWithId(createTextBlock('quote', unescapeHtml(inner)), nextId(blockId, 'quote')));
      continue;
    }

    if (tag === 'pre') {
      const codeContent = inner.replace(/<code[^>]*>([\s\S]*?)<\/code>/i, '$1');
      blocks.push(blockWithId(createTextBlock('code', unescapeHtml(codeContent)), nextId(blockId, 'code')));
      continue;
    }

    if (tag === 'ul') {
      if (inner.includes('data-type="taskItem"') || attrs.includes('data-type="taskList"') || inner.includes('data-type="taskList"')) {
        const taskItemPattern = /<li[^>]*data-checked="(true|false)"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi;
        let taskMatch: RegExpExecArray | null;
        let foundTask = false;
        while ((taskMatch = taskItemPattern.exec(inner)) !== null) {
          foundTask = true;
          const checked = taskMatch[1] === 'true';
          const text = unescapeHtml(taskMatch[2]);
          blocks.push(blockWithId(Object.assign(createTodoBlock(text), { checked }), nextId(undefined, 'todo')));
        }
        if (!foundTask) {
          blocks.push(blockWithId(createTodoBlock(unescapeHtml(inner)), nextId(blockId, 'todo')));
        }
      } else {
        const listItemPattern = /<li[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>|<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch: RegExpExecArray | null;
        while ((liMatch = listItemPattern.exec(inner)) !== null) {
          const text = unescapeHtml(liMatch[1] || liMatch[2] || '');
          blocks.push(blockWithId(createTextBlock('bulletList', text), nextId(undefined, 'bulletList')));
        }
      }
      continue;
    }

    if (tag === 'ol') {
      const listItemPattern = /<li[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>|<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = listItemPattern.exec(inner)) !== null) {
        const text = unescapeHtml(liMatch[1] || liMatch[2] || '');
        blocks.push(blockWithId(createTextBlock('numberedList', text), nextId(undefined, 'numberedList')));
      }
      continue;
    }

    if (tag === 'p') {
      blocks.push(blockWithId(createTextBlock('paragraph', unescapeHtml(inner)), nextId(blockId, 'paragraph')));
    }
  }

  return blocks.length ? blocks : [createTextBlock('paragraph')];
}

// ── AI patch application ───────────────────────────────────

export function applyNotePatch(blocks: NoteBlock[], patch: NoteAiPatch): NoteBlock[] {
  return patch.operations.reduce((currentBlocks, operation) => {
    if (operation.type === 'replaceBlocks') return operation.blocks;
    if (operation.type === 'insertBlocksAfter') {
      const index = currentBlocks.findIndex((block) => block.id === operation.afterBlockId);
      if (index === -1) return [...currentBlocks, ...operation.blocks];
      return [
        ...currentBlocks.slice(0, index + 1),
        ...operation.blocks,
        ...currentBlocks.slice(index + 1),
      ];
    }
    if (operation.type === 'updateBlock') {
      return currentBlocks.map((block) => {
        if (block.id !== operation.blockId) return block;
        return { ...block, ...operation.patch, id: block.id, updatedAt: Date.now() } as NoteBlock;
      });
    }
    return currentBlocks;
  }, blocks);
}

export function normalizeBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.length ? blocks : [createTextBlock('paragraph')];
}
