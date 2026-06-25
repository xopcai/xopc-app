import type { MarkdownRange } from './markdown-document';
import type { MarkdownInsertResult } from './markdown-insert';
import { formatMarkdownImage } from './markdown-insert';
import { getCurrentLineRange } from './markdown-editor-state';

export type MarkdownImageAtSelection = {
  range: MarkdownRange;
  alt: string;
  src: string;
} | null;

export function findMarkdownImageAtSelection(markdown: string, selection: MarkdownRange): MarkdownImageAtSelection {
  const source = markdown.replace(/\r\n/g, '\n');
  const lineRange = getCurrentLineRange(source, selection.start);
  const line = source.slice(lineRange.start, lineRange.end);
  const image = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line.trim());
  if (!image) return null;
  const leading = line.length - line.trimStart().length;
  const start = lineRange.start + leading;
  return {
    range: { start, end: start + line.trim().length },
    alt: unescapeMarkdownLabel(image[1]),
    src: image[2],
  };
}

export function replaceMarkdownImage(
  markdown: string,
  image: NonNullable<MarkdownImageAtSelection>,
  input: { alt: string; src: string },
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const insert = formatMarkdownImage(input.alt, input.src);
  const cursor = image.range.start + insert.length;
  return {
    markdown: `${source.slice(0, image.range.start)}${insert}${source.slice(image.range.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function insertMarkdownImageBlock(
  markdown: string,
  selection: MarkdownRange,
  input: { alt: string; src: string },
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = Math.max(0, Math.min(Math.min(selection.start, selection.end), source.length));
  const end = Math.max(0, Math.min(Math.max(selection.start, selection.end), source.length));
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const image = formatMarkdownImage(input.alt, input.src);
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix ? (suffix.startsWith('\n') ? '' : '\n') : '';
  const trailing = suffix ? after : '\n';
  const insert = `${before}${image}${trailing}`;
  const cursor = start + before.length + image.length + 1;
  return {
    markdown: `${prefix}${insert}${suffix}`,
    selection: { start: cursor, end: cursor },
  };
}

export function updateMarkdownImageCaption(
  markdown: string,
  image: NonNullable<MarkdownImageAtSelection>,
  alt: string,
): MarkdownInsertResult {
  return replaceMarkdownImage(markdown, image, { alt, src: image.src });
}

export function deleteMarkdownImage(markdown: string, image: NonNullable<MarkdownImageAtSelection>): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const lineRange = expandToWholeLine(source, image.range);
  const cursor = lineRange.start;
  return {
    markdown: `${source.slice(0, lineRange.start)}${source.slice(lineRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

function expandToWholeLine(markdown: string, range: MarkdownRange): MarkdownRange {
  let start = range.start;
  let end = range.end;
  while (start > 0 && markdown[start - 1] !== '\n') start -= 1;
  if (markdown[end] === '\n') end += 1;
  else if (start > 0 && markdown[start - 1] === '\n') start -= 1;
  return { start, end };
}

function unescapeMarkdownLabel(value: string): string {
  return value.replace(/\\([[\]\\])/g, '$1');
}
