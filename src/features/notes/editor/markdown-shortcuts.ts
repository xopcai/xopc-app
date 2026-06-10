import type { NoteBlockType } from '../note-blocks';

/**
 * Markdown shortcut patterns detected at the start of a block's text.
 * When matched, the block is converted to the target type and the prefix is stripped.
 */
interface MarkdownShortcut {
  pattern: RegExp;
  targetType: NoteBlockType;
  /** Transform matched text — strip prefix, return remaining content */
  transform: (text: string, match: RegExpMatchArray) => string;
}

const MARKDOWN_SHORTCUTS: MarkdownShortcut[] = [
  // ### heading 3
  { pattern: /^###\s(.*)/, targetType: 'heading', transform: (_t, m) => m[1] },
  // ## heading 2
  { pattern: /^##\s(.*)/, targetType: 'heading', transform: (_t, m) => m[1] },
  // # heading 1
  { pattern: /^#\s(.*)/, targetType: 'heading', transform: (_t, m) => m[1] },
  // - bullet list or * bullet list
  { pattern: /^[-*]\s(.*)/, targetType: 'bulletList', transform: (_t, m) => m[1] },
  // 1. numbered list
  { pattern: /^\d+\.\s(.*)/, targetType: 'numberedList', transform: (_t, m) => m[1] },
  // [] or [ ] todo
  { pattern: /^\[[\sx]?\]\s?(.*)/, targetType: 'todo', transform: (_t, m) => m[1] },
  // > quote
  { pattern: /^>\s(.*)/, targetType: 'quote', transform: (_t, m) => m[1] },
  // ``` code
  { pattern: /^```\s?(.*)/, targetType: 'code', transform: (_t, m) => m[1] },
  // --- divider
  { pattern: /^---\s*$/, targetType: 'divider', transform: () => '' },
];

export interface MarkdownShortcutResult {
  targetType: NoteBlockType;
  remainingText: string;
}

/**
 * Detect if the given text starts with a markdown shortcut pattern.
 * Only triggers when the block is currently a plain paragraph — prevents
 * re-converting blocks that are already a specific type.
 */
export function detectMarkdownShortcut(
  text: string,
  currentBlockType: NoteBlockType,
): MarkdownShortcutResult | null {
  // Only convert from paragraph type to avoid interfering with existing blocks
  if (currentBlockType !== 'paragraph') return null;

  for (const shortcut of MARKDOWN_SHORTCUTS) {
    const match = text.match(shortcut.pattern);
    if (match) {
      return {
        targetType: shortcut.targetType,
        remainingText: shortcut.transform(text, match),
      };
    }
  }
  return null;
}

/**
 * Detect slash command trigger: text is exactly "/" or starts with "/".
 * Returns the filter query (everything after "/") or null if not a slash command.
 */
export function detectSlashCommand(text: string): string | null {
  if (text === '/') return '';
  if (text.startsWith('/') && !text.startsWith('//')) {
    return text.slice(1);
  }
  return null;
}
