import type { MarkdownRange } from './markdown-document';
import type { MarkdownInsertResult } from './markdown-insert';
import { getCurrentLineRange } from './markdown-editor-state';

export function toggleMarkdownTodo(markdown: string, selection: MarkdownRange): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const lineRange = getCurrentLineRange(source, selection.start);
  const line = source.slice(lineRange.start, lineRange.end);
  const todo = /^(\s*)-\s+\[([ xX])\]\s*(.*)$/.exec(line);

  if (todo) {
    const checked = todo[2].toLowerCase() === 'x';
    const nextLine = `${todo[1]}- [${checked ? ' ' : 'x'}] ${todo[3]}`;
    return replaceLine(source, lineRange, nextLine, selection);
  }

  const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
  if (bullet) {
    return replaceLine(source, lineRange, `${bullet[1]}- [ ] ${bullet[2]}`, selection);
  }

  const trimmed = line.trim();
  const indent = /^(\s*)/.exec(line)?.[1] ?? '';
  const nextLine = trimmed ? `${indent}- [ ] ${trimmed}` : `${indent}- [ ] `;
  const cursor = lineRange.start + nextLine.length;
  return {
    markdown: `${source.slice(0, lineRange.start)}${nextLine}${source.slice(lineRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function toggleMarkdownBullet(markdown: string, selection: MarkdownRange): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const lineRange = getCurrentLineRange(source, selection.start);
  const line = source.slice(lineRange.start, lineRange.end);
  const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);

  if (bullet) {
    return replaceLine(source, lineRange, `${bullet[1]}${bullet[2]}`, selection);
  }

  const todo = /^(\s*)-\s+\[[ xX]\]\s*(.*)$/.exec(line);
  if (todo) {
    return replaceLine(source, lineRange, `${todo[1]}- ${todo[2]}`, selection);
  }

  const trimmed = line.trim();
  const indent = /^(\s*)/.exec(line)?.[1] ?? '';
  const nextLine = trimmed ? `${indent}- ${trimmed}` : `${indent}- `;
  const cursor = lineRange.start + nextLine.length;
  return {
    markdown: `${source.slice(0, lineRange.start)}${nextLine}${source.slice(lineRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function toggleMarkdownHeading(
  markdown: string,
  selection: MarkdownRange,
  level = 2,
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const lineRange = getCurrentLineRange(source, selection.start);
  const line = source.slice(lineRange.start, lineRange.end);
  const marker = `${'#'.repeat(Math.max(1, Math.min(Math.round(level), 6)))} `;
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  const nextLine = heading
    ? heading[1].length === marker.length - 1
      ? heading[2]
      : `${marker}${heading[2]}`
    : `${marker}${line.trim()}`;
  const cursor = Math.min(lineRange.start + nextLine.length, Math.max(lineRange.start, selection.end + nextLine.length - line.length));
  return {
    markdown: `${source.slice(0, lineRange.start)}${nextLine}${source.slice(lineRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

function replaceLine(
  markdown: string,
  lineRange: MarkdownRange,
  nextLine: string,
  selection: MarkdownRange,
): MarkdownInsertResult {
  const delta = nextLine.length - (lineRange.end - lineRange.start);
  const cursor = Math.max(lineRange.start, Math.min(selection.end + delta, lineRange.start + nextLine.length));
  return {
    markdown: `${markdown.slice(0, lineRange.start)}${nextLine}${markdown.slice(lineRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}
