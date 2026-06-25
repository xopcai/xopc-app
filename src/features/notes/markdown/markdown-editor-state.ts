import type { MarkdownRange } from './markdown-document';

export type MarkdownTodoState = 'none' | 'open' | 'done';

export type MarkdownEditorState = {
  bold: boolean;
  italic: boolean;
  todo: MarkdownTodoState;
  bullet: boolean;
  headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  link: boolean;
  currentLineRange: MarkdownRange;
};

export function getMarkdownEditorState(markdown: string, selection: MarkdownRange): MarkdownEditorState {
  const source = markdown.replace(/\r\n/g, '\n');
  const normalizedSelection = normalizeRange(selection, source.length);
  const currentLineRange = getCurrentLineRange(source, normalizedSelection.start);
  const line = source.slice(currentLineRange.start, currentLineRange.end);
  const heading = /^(#{1,6})\s+/.exec(line);
  const todo = /^\s*-\s+\[([ xX])\]\s+/.exec(line);
  const bullet = /^\s*[-*]\s+/.test(line) && !todo;

  return {
    bold: isWrappedBy(source, normalizedSelection, '**'),
    italic: isWrappedBy(source, normalizedSelection, '*') && !isWrappedBy(source, normalizedSelection, '**'),
    todo: todo ? (todo[1].toLowerCase() === 'x' ? 'done' : 'open') : 'none',
    bullet,
    headingLevel: heading ? heading[1].length as MarkdownEditorState['headingLevel'] : 0,
    link: Boolean(findMarkdownLinkAtPosition(source, normalizedSelection)),
    currentLineRange,
  };
}

export function getCurrentLineRange(markdown: string, position: number): MarkdownRange {
  const source = markdown.replace(/\r\n/g, '\n');
  const cursor = Math.max(0, Math.min(position, source.length));
  const before = source.lastIndexOf('\n', Math.max(0, cursor - 1));
  const after = source.indexOf('\n', cursor);
  return {
    start: before < 0 ? 0 : before + 1,
    end: after < 0 ? source.length : after,
  };
}

function normalizeRange(selection: MarkdownRange, max: number): MarkdownRange {
  const start = Math.max(0, Math.min(Math.min(selection.start, selection.end), max));
  const end = Math.max(0, Math.min(Math.max(selection.start, selection.end), max));
  return { start, end };
}

function isWrappedBy(markdown: string, selection: MarkdownRange, token: string): boolean {
  if (selection.start === selection.end) {
    const beforeStart = selection.start - token.length;
    const afterEnd = selection.end + token.length;
    return beforeStart >= 0
      && afterEnd <= markdown.length
      && markdown.slice(beforeStart, selection.start) === token
      && markdown.slice(selection.end, afterEnd) === token;
  }

  const beforeStart = selection.start - token.length;
  const afterEnd = selection.end + token.length;
  if (
    beforeStart >= 0
    && afterEnd <= markdown.length
    && markdown.slice(beforeStart, selection.start) === token
    && markdown.slice(selection.end, afterEnd) === token
  ) {
    return true;
  }

  return markdown.slice(selection.start, selection.start + token.length) === token
    && markdown.slice(selection.end - token.length, selection.end) === token;
}

function findMarkdownLinkAtPosition(markdown: string, selection: MarkdownRange): boolean {
  const linkPattern = /!?\[[^\]\n]*\]\([^) \n]+(?:\s+"[^"]*")?\)/g;
  const cursor = selection.start;
  for (const match of markdown.matchAll(linkPattern)) {
    if (match[0].startsWith('!')) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (cursor >= start && cursor <= end) return true;
    if (selection.start >= start && selection.end <= end) return true;
  }
  return false;
}
