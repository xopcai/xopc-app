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
  | 'divider';

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

export type NoteBlock = TextNoteBlock | TodoNoteBlock | DividerNoteBlock;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Convert blocks to HTML suitable for TipTap editor `setContent`. */
export function blocksToHtml(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'divider') return '<hr>';
      if (block.type === 'heading') {
        const level = block.level ?? 2;
        return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
      }
      if (block.type === 'todo') {
        const checked = block.checked ? ' checked="checked"' : '';
        return `<ul data-type="taskList"><li data-type="taskItem" data-checked="${block.checked ? 'true' : 'false'}"><label><input type="checkbox"${checked}></label><div><p>${escapeHtml(block.text)}</p></div></li></ul>`;
      }
      if (block.type === 'bulletList') return `<ul><li><p>${escapeHtml(block.text)}</p></li></ul>`;
      if (block.type === 'numberedList') return `<ol><li><p>${escapeHtml(block.text)}</p></li></ol>`;
      if (block.type === 'quote') return `<blockquote><p>${escapeHtml(block.text)}</p></blockquote>`;
      if (block.type === 'code') return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
      return `<p>${escapeHtml(block.text) || '<br>'}</p>`;
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
    .trim();
}

/** Parse TipTap HTML output back into NoteBlock array. */
export function htmlToBlocks(html: string): NoteBlock[] {
  if (!html?.trim()) return [createTextBlock('paragraph')];

  const blocks: NoteBlock[] = [];
  const tagPattern = /<(h[1-3]|p|ul|ol|blockquote|pre|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const fullMatch = match[0];
    const tag = (match[1] || '').toLowerCase();
    const inner = match[2] || '';

    if (fullMatch === '<hr>' || fullMatch === '<hr/>' || fullMatch === '<hr />') {
      blocks.push({ id: createBlockId(), type: 'divider', createdAt: Date.now(), updatedAt: Date.now() });
      continue;
    }

    if (tag === 'hr') {
      blocks.push({ id: createBlockId(), type: 'divider', createdAt: Date.now(), updatedAt: Date.now() });
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag[1]) as 1 | 2 | 3;
      blocks.push(Object.assign(createTextBlock('heading', unescapeHtml(inner)), { level }));
      continue;
    }

    if (tag === 'blockquote') {
      blocks.push(createTextBlock('quote', unescapeHtml(inner)));
      continue;
    }

    if (tag === 'pre') {
      const codeContent = inner.replace(/<code[^>]*>([\s\S]*?)<\/code>/i, '$1');
      blocks.push(createTextBlock('code', unescapeHtml(codeContent)));
      continue;
    }

    if (tag === 'ul') {
      // Check if this is a task list
      if (inner.includes('data-type="taskItem"') || inner.includes('data-type="taskList"')) {
        const taskItemPattern = /<li[^>]*data-checked="(true|false)"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi;
        let taskMatch: RegExpExecArray | null;
        while ((taskMatch = taskItemPattern.exec(inner)) !== null) {
          const checked = taskMatch[1] === 'true';
          const text = unescapeHtml(taskMatch[2]);
          blocks.push(Object.assign(createTodoBlock(text), { checked }));
        }
        if (blocks.length === 0 || !inner.includes('data-checked')) {
          // Fallback: single task item without proper structure
          blocks.push(createTodoBlock(unescapeHtml(inner)));
        }
      } else {
        // Regular bullet list
        const listItemPattern = /<li[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>|<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch: RegExpExecArray | null;
        while ((liMatch = listItemPattern.exec(inner)) !== null) {
          const text = unescapeHtml(liMatch[1] || liMatch[2] || '');
          blocks.push(createTextBlock('bulletList', text));
        }
      }
      continue;
    }

    if (tag === 'ol') {
      const listItemPattern = /<li[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/li>|<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = listItemPattern.exec(inner)) !== null) {
        const text = unescapeHtml(liMatch[1] || liMatch[2] || '');
        blocks.push(createTextBlock('numberedList', text));
      }
      continue;
    }

    if (tag === 'p') {
      blocks.push(createTextBlock('paragraph', unescapeHtml(inner)));
      continue;
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
