import { blockToMarkdown, type MarkdownEditorBlock } from './markdown-document';

export interface StructuredEditResult {
  markdown: string;
  focusOffset: number;
}

export interface TransientInsertionResult extends StructuredEditResult {
  insertion: string;
}

export type TransientBlockKind = 'paragraph' | 'todo' | 'bulletList' | 'numberedList' | 'quote' | 'callout';

export interface TransientMarkdownBlock {
  afterBlockId: string;
  insertOffset: number;
  kind: TransientBlockKind;
  marker?: '-' | '*';
  index?: number;
  checked?: boolean;
}

export function markdownForStructuredTextInput(block: MarkdownEditorBlock, text: string): string | null {
  return transformStructuredTextInput(block, text)?.markdown ?? null;
}

export function transformStructuredTextInput(block: MarkdownEditorBlock, text: string): StructuredEditResult | null {
  return resolveParagraphShortcut(block, text) ?? splitStructuredTextInput(block, text);
}

export function shouldCreateTransientBlock(block: MarkdownEditorBlock, text: string): boolean {
  const current = editableBlockText(block);
  return current != null && text === `${current}\n`;
}

export function createTransientBlockAfter(block: MarkdownEditorBlock): TransientMarkdownBlock | null {
  if (editableBlockText(block) == null) return null;
  if (block.type === 'todo') {
    return {
      afterBlockId: block.id,
      insertOffset: block.range.end,
      kind: 'todo',
      checked: false,
    };
  }
  if (block.type === 'bulletList') {
    return {
      afterBlockId: block.id,
      insertOffset: block.range.end,
      kind: 'bulletList',
      marker: block.marker,
    };
  }
  if (block.type === 'numberedList') {
    return {
      afterBlockId: block.id,
      insertOffset: block.range.end,
      kind: 'numberedList',
      index: block.index + 1,
    };
  }
  if (block.type === 'quote') {
    return {
      afterBlockId: block.id,
      insertOffset: block.range.end,
      kind: 'quote',
    };
  }
  if (block.type === 'callout') {
    return {
      afterBlockId: block.id,
      insertOffset: block.range.end,
      kind: 'callout',
    };
  }
  return {
    afterBlockId: block.id,
    insertOffset: block.range.end,
    kind: 'paragraph',
  };
}

export function markdownForTransientInput(block: TransientMarkdownBlock, text: string): StructuredEditResult | null {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (block.kind === 'todo') {
    const markdown = lines.map((line) => `- [${block.checked ? 'x' : ' '}] ${line}`).join('\n');
    return { markdown, focusOffset: markdown.length };
  }
  if (block.kind === 'bulletList') {
    const marker = block.marker ?? '-';
    const markdown = lines.map((line) => `${marker} ${line}`).join('\n');
    return { markdown, focusOffset: markdown.length };
  }
  if (block.kind === 'numberedList') {
    const firstIndex = block.index ?? 1;
    const markdown = lines.map((line, index) => `${firstIndex + index}. ${line}`).join('\n');
    return { markdown, focusOffset: markdown.length };
  }
  if (block.kind === 'quote') {
    const markdown = lines.map((line) => `> ${line}`).join('\n');
    return { markdown, focusOffset: markdown.length };
  }
  if (block.kind === 'callout') {
    const markdown = lines.map((line) => `> ${line}`).join('\n');
    return { markdown, focusOffset: markdown.length };
  }
  const markdown = lines.join('\n\n');
  return { markdown, focusOffset: markdown.length };
}

export function markdownForTransientInsertion(block: TransientMarkdownBlock, text: string): TransientInsertionResult | null {
  const next = markdownForTransientInput(block, text);
  if (!next) return null;
  const separator = block.kind === 'callout' ? '\n' : '\n\n';
  return {
    markdown: next.markdown,
    insertion: `${separator}${next.markdown}`,
    focusOffset: separator.length + next.focusOffset,
  };
}

export function shouldExitTransientContinuation(block: TransientMarkdownBlock, text: string): boolean {
  return block.kind !== 'paragraph' && text === '\n';
}

export function exitTransientContinuation(block: TransientMarkdownBlock): TransientMarkdownBlock {
  return {
    afterBlockId: block.afterBlockId,
    insertOffset: block.insertOffset,
    kind: 'paragraph',
  };
}

export function splitStructuredTextInput(block: MarkdownEditorBlock, text: string): StructuredEditResult | null {
  if (block.type === 'code' || block.type === 'raw' || block.type === 'image') return null;
  if (!text.includes('\n')) return null;

  const lines = text.split('\n');
  if (lines.length < 2 || lines.slice(1).every((line) => !line.trim())) return null;

  if (containsStructuralMarkdownLine(lines)) {
    const markdown = trimBlankLines(text);
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'heading') {
    const markdown = [
      blockToMarkdown({ ...block, text: lines[0] }),
      lines.slice(1).join('\n').trimStart(),
    ].filter(Boolean).join('\n\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'paragraph') {
    const markdown = lines.map((line) => line.trimEnd()).filter((line) => line.length > 0).join('\n\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'todo') {
    const markdown = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `- [${block.checked ? 'x' : ' '}] ${line}`)
      .join('\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'bulletList') {
    const markdown = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `${block.marker} ${line}`)
      .join('\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'numberedList') {
    const markdown = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => `${block.index + index}. ${line}`)
      .join('\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'quote') {
    const markdown = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join('\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  if (block.type === 'callout') {
    const firstLine = lines[0]?.trim() ?? '';
    const rest = lines.slice(1).map((line) => line.trim()).filter(Boolean);
    const markdown = [`> [!${block.kind}]${block.fold ?? ''} ${firstLine}`, ...rest.map((line) => `> ${line}`)].join('\n');
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  return null;
}

export function resolveParagraphShortcut(block: MarkdownEditorBlock, text: string): StructuredEditResult | null {
  if (block.type !== 'paragraph') return null;
  if (text.includes('\n')) return null;

  const heading = /^(#{1,6})\s+(.+)$/.exec(text);
  if (heading) {
    return {
      markdown: `${heading[1]} ${heading[2]}`,
      focusOffset: text.length,
    };
  }

  const todo = /^-\s+\[([ xX])\]\s+(.+)$/.exec(text);
  if (todo) {
    const markdown = `- [${todo[1].toLowerCase() === 'x' ? 'x' : ' '}] ${todo[2]}`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const bullet = /^([-*])\s+(.+)$/.exec(text);
  if (bullet) {
    const markdown = `${bullet[1]} ${bullet[2]}`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const numbered = /^(\d+)\.\s+(.+)$/.exec(text);
  if (numbered) {
    const markdown = `${Number(numbered[1])}. ${numbered[2]}`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const callout = /^>\s*\[!([A-Za-z0-9][A-Za-z0-9_-]*)\]([+-])?\s*(.*)$/.exec(text);
  if (callout) {
    const title = callout[3].trim();
    const markdown = `> [!${callout[1]}]${callout[2] ?? ''}${title ? ` ${title}` : ''}`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const quote = /^>\s+(.+)$/.exec(text);
  if (quote) {
    const markdown = `> ${quote[1]}`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const image = /^!\[((?:\\.|[^\]\\])*)\]\((.+)\)\s*$/.exec(text);
  if (image) {
    const markdown = `![${image[1]}](${image[2].trim()})`;
    return {
      markdown,
      focusOffset: markdown.length,
    };
  }

  const codeFence = /^```([^\s`]*)$/.exec(text);
  if (codeFence) {
    const markdown = `\`\`\`${codeFence[1] ?? ''}\n\n\`\`\``;
    return {
      markdown,
      focusOffset: `\`\`\`${codeFence[1] ?? ''}\n`.length,
    };
  }

  return null;
}

function containsStructuralMarkdownLine(lines: string[]): boolean {
  return lines.some((line) => {
    const trimmed = line.trim();
    return /^```/.test(trimmed)
      || /^!\[((?:\\.|[^\]\\])*)\]\((.+)\)\s*$/.test(trimmed)
      || /^(#{1,6})\s+/.test(trimmed)
      || /^-\s+\[[ xX]\]\s+/.test(trimmed)
      || /^[-*]\s+/.test(trimmed)
      || /^\d+\.\s+/.test(trimmed)
      || /^>\s?/.test(trimmed);
  });
}

function trimBlankLines(value: string): string {
  return value.replace(/^\n+/, '').replace(/\n+$/, '');
}

export function mergeStructuredBlocks(previous: MarkdownEditorBlock, current: MarkdownEditorBlock): StructuredEditResult | null {
  const previousText = editableBlockText(previous);
  const currentText = editableBlockText(current);
  if (previousText == null || currentText == null) return null;

  const previousMarkdown = blockToMarkdown({ ...previous, text: `${previousText}${currentText}` } as MarkdownEditorBlock);
  return {
    markdown: previousMarkdown,
    focusOffset: blockContentOffset(previous) + previousText.length,
  };
}

export function editableBlockText(block: MarkdownEditorBlock): string | null {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'todo' || block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'quote' || block.type === 'callout') {
    return block.text;
  }
  return null;
}

export function blockContentOffset(block: MarkdownEditorBlock): number {
  switch (block.type) {
    case 'heading':
      return block.level + 1;
    case 'todo':
      return 6;
    case 'bulletList':
      return 2;
    case 'numberedList':
      return `${block.index}. `.length;
    case 'quote':
      return 2;
    case 'callout':
      return `> [!${block.kind}]${block.fold ?? ''} `.length;
    case 'code':
      return `\`\`\`${block.language ?? ''}\n`.length;
    default:
      return 0;
  }
}
