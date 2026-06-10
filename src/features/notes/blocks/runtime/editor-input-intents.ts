import type { NoteBlockType } from '../../../../query/notes';

export interface MarkdownShortcutIntent {
  blockType: NoteBlockType;
  text: string;
}

const SHORTCUTS: Array<{
  pattern: RegExp;
  blockType: NoteBlockType;
  trim: (value: string) => string;
}> = [
  { pattern: /^###\s/, blockType: 'heading', trim: (value) => value.replace(/^###\s/, '') },
  { pattern: /^##\s/, blockType: 'heading', trim: (value) => value.replace(/^##\s/, '') },
  { pattern: /^#\s/, blockType: 'heading', trim: (value) => value.replace(/^#\s/, '') },
  { pattern: /^-\s/, blockType: 'bulletList', trim: (value) => value.replace(/^-\s/, '') },
  { pattern: /^\*\s/, blockType: 'bulletList', trim: (value) => value.replace(/^\*\s/, '') },
  { pattern: /^1\.\s/, blockType: 'numberedList', trim: (value) => value.replace(/^1\.\s/, '') },
  { pattern: /^\[\]\s/, blockType: 'todo', trim: (value) => value.replace(/^\[\]\s/, '') },
  { pattern: /^\[ \]\s/, blockType: 'todo', trim: (value) => value.replace(/^\[ \]\s/, '') },
  { pattern: /^>\s/, blockType: 'quote', trim: (value) => value.replace(/^>\s/, '') },
  { pattern: /^```\s?/, blockType: 'code', trim: (value) => value.replace(/^```\s?/, '') },
  { pattern: /^---$/, blockType: 'divider', trim: () => '' },
];

export function resolveMarkdownShortcut(text: string): MarkdownShortcutIntent | null {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.pattern.test(text)) {
      return {
        blockType: shortcut.blockType,
        text: shortcut.trim(text),
      };
    }
  }
  return null;
}

export interface SlashCommandRange {
  start: number;
  end: number;
  query: string;
}

export function detectSlashCommand(text: string, caretOffset: number): SlashCommandRange | null {
  const offset = Math.max(0, Math.min(caretOffset, text.length));
  const beforeCaret = text.slice(0, offset);
  const slashIndex = beforeCaret.lastIndexOf('/');
  if (slashIndex < 0) return null;

  const beforeSlash = slashIndex === 0 ? '' : beforeCaret[slashIndex - 1];
  if (beforeSlash && !/\s/.test(beforeSlash)) return null;

  const query = beforeCaret.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    start: slashIndex,
    end: offset,
    query,
  };
}

export function removeSlashCommandText(text: string, range: SlashCommandRange): string {
  return `${text.slice(0, range.start)}${text.slice(range.end)}`;
}
