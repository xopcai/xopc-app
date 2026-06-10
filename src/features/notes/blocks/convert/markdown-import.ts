import type { NoteBlock, NoteBlockType } from '../../../../query/notes';

import { createBlockForType } from '../core/block-reducer';

function textBlock(type: NoteBlockType, text: string): NoteBlock {
  const block = createBlockForType(type);
  if ('text' in block) {
    return { ...block, text };
  }
  return block;
}

export function markdownToBlocks(markdown: string): NoteBlock[] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const blocks: NoteBlock[] = [];
  let codeLines: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      if (codeLines) {
        blocks.push(textBlock('code', codeLines.join('\n')));
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line) continue;
    if (/^---+$/.test(line)) {
      blocks.push(createBlockForType('divider'));
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const block = textBlock('heading', heading[2]);
      if (block.type === 'heading') {
        block.level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      }
      blocks.push(block);
      continue;
    }
    const todo = /^-\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (todo) {
      const block = createBlockForType('todo');
      if (block.type === 'todo') {
        block.text = todo[2];
        block.checked = todo[1].toLowerCase() === 'x';
      }
      blocks.push(block);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      blocks.push(textBlock('bulletList', bullet[1]));
      continue;
    }
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      blocks.push(textBlock('numberedList', numbered[1]));
      continue;
    }
    const quote = /^>\s+(.+)$/.exec(line);
    if (quote) {
      blocks.push(textBlock('quote', quote[1]));
      continue;
    }
    blocks.push(textBlock('paragraph', line));
  }

  if (codeLines) {
    blocks.push(textBlock('code', codeLines.join('\n')));
  }

  return blocks.length ? blocks : [textBlock('paragraph', markdown.trim())];
}
