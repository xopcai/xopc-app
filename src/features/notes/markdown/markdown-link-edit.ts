import type { MarkdownRange } from './markdown-document';
import type { MarkdownInsertResult } from './markdown-insert';

export type MarkdownLinkAtSelection = {
  range: MarkdownRange;
  label: string;
  url: string;
} | null;

export function findMarkdownLinkAtSelection(markdown: string, selection: MarkdownRange): MarkdownLinkAtSelection {
  const source = markdown.replace(/\r\n/g, '\n');
  const cursor = Math.max(0, Math.min(selection.start, source.length));
  const linkPattern = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    if (match[1] === '!') continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if ((cursor >= start && cursor <= end) || (selection.start >= start && selection.end <= end)) {
      return {
        range: { start, end },
        label: unescapeMarkdownLabel(match[2]),
        url: match[3],
      };
    }
  }
  return null;
}

export function getMarkdownLinkDraft(markdown: string, selection: MarkdownRange): { title: string; url: string; existing: MarkdownLinkAtSelection } {
  const existing = findMarkdownLinkAtSelection(markdown, selection);
  if (existing) return { title: existing.label, url: existing.url, existing };
  const selected = markdown.slice(Math.min(selection.start, selection.end), Math.max(selection.start, selection.end)).trim();
  return isHttpUrl(selected)
    ? { title: 'title', url: selected, existing: null }
    : { title: selected || 'title', url: '', existing: null };
}

export function applyMarkdownLinkEdit(
  markdown: string,
  selection: MarkdownRange,
  input: { title: string; url: string },
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const existing = findMarkdownLinkAtSelection(source, selection);
  const targetRange = existing?.range ?? normalizeRange(selection, source.length);
  const title = escapeMarkdownLabel(input.title || 'title');
  const url = sanitizeUrl(input.url);
  const insert = `[${title}](${url})`;
  const cursor = targetRange.start + insert.length;
  return {
    markdown: `${source.slice(0, targetRange.start)}${insert}${source.slice(targetRange.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function removeMarkdownLink(markdown: string, selection: MarkdownRange): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const existing = findMarkdownLinkAtSelection(source, selection);
  if (!existing) return { markdown: source, selection };
  const cursor = existing.range.start + existing.label.length;
  return {
    markdown: `${source.slice(0, existing.range.start)}${existing.label}${source.slice(existing.range.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'https://';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed.replace(/\s+/g, '');
  return `https://${trimmed.replace(/\s+/g, '')}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function normalizeRange(selection: MarkdownRange, max: number): MarkdownRange {
  const start = Math.max(0, Math.min(Math.min(selection.start, selection.end), max));
  const end = Math.max(0, Math.min(Math.max(selection.start, selection.end), max));
  return { start, end };
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/([\\\]])/g, '\\$1').replace(/\[/g, '\\[') || 'title';
}

function unescapeMarkdownLabel(value: string): string {
  return value.replace(/\\([[\]\\])/g, '$1');
}
