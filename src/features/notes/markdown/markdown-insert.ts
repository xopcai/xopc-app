import type { MarkdownRange } from './markdown-document';

export interface MarkdownInsertResult {
  markdown: string;
  selection: MarkdownRange;
}

export interface MarkdownLineTemplateOptions {
  useSelectionAsContent?: boolean;
}

export function insertMarkdownLineTemplate(
  markdown: string,
  selection: MarkdownRange,
  template: string,
  placeholderOffset = template.length,
  options?: MarkdownLineTemplateOptions,
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const selectedContent = options?.useSelectionAsContent ? source.slice(start, end).replace(/\s+/g, ' ').trim() : '';
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix && !suffix.startsWith('\n') ? '\n' : '';
  const templateWithContent = selectedContent ? `${template}${selectedContent}` : template;
  const insert = `${before}${templateWithContent}${after}`;
  const nextCursor = start + before.length + (selectedContent ? templateWithContent.length : placeholderOffset);
  return {
    markdown: `${prefix}${insert}${suffix}`,
    selection: { start: nextCursor, end: nextCursor },
  };
}

export function insertMarkdownPrefixedLines(
  markdown: string,
  selection: MarkdownRange,
  prefixForLine: string | ((lineIndex: number) => string),
  placeholderOffset = typeof prefixForLine === 'string' ? prefixForLine.length : 0,
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const selectedLines = source.slice(start, end).split('\n').map((line) => line.trim()).filter(Boolean);
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix && !suffix.startsWith('\n') ? '\n' : '';
  const inserted = selectedLines.length
    ? selectedLines.map((line, index) => `${linePrefix(prefixForLine, index)}${line}`).join('\n')
    : linePrefix(prefixForLine, 0);
  const nextCursor = start + before.length + (selectedLines.length ? inserted.length : placeholderOffset);
  return {
    markdown: `${prefix}${before}${inserted}${after}${suffix}`,
    selection: { start: nextCursor, end: nextCursor },
  };
}

export function insertMarkdownHeading(
  markdown: string,
  selection: MarkdownRange,
  level = 2,
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const selectedLines = trimBlankLines(source.slice(start, end)).split('\n');
  const firstContentLineIndex = selectedLines.findIndex((line) => line.trim());
  const marker = `${'#'.repeat(clamp(Math.round(level), 1, 6))} `;
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix && !suffix.startsWith('\n') ? '\n' : '';

  if (firstContentLineIndex < 0) {
    const cursor = start + before.length + marker.length;
    return {
      markdown: `${prefix}${before}${marker}${after}${suffix}`,
      selection: { start: cursor, end: cursor },
    };
  }

  const title = selectedLines[firstContentLineIndex].trim().replace(/\s+/g, ' ');
  const body = selectedLines.slice(firstContentLineIndex + 1).join('\n').trimEnd();
  const inserted = body ? `${marker}${title}\n\n${body}` : `${marker}${title}`;
  const cursor = start + before.length + inserted.length;
  return {
    markdown: `${prefix}${before}${inserted}${after}${suffix}`,
    selection: { start: cursor, end: cursor },
  };
}

export function insertMarkdownCodeBlock(
  markdown: string,
  selection: MarkdownRange,
  language = '',
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const selected = trimBlankLines(source.slice(start, end));
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix && !suffix.startsWith('\n') ? '\n' : '';
  const fenceStart = `\`\`\`${language}`;
  const inserted = selected ? `${fenceStart}\n${selected}\n\`\`\`` : `${fenceStart}\n\n\`\`\``;
  const cursor = selected
    ? start + before.length + inserted.length
    : start + before.length + fenceStart.length + 1;
  return {
    markdown: `${prefix}${before}${inserted}${after}${suffix}`,
    selection: { start: cursor, end: cursor },
  };
}

export function insertMarkdownCallout(
  markdown: string,
  selection: MarkdownRange,
  kind = 'NOTE',
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const selectedLines = trimBlankLines(source.slice(start, end))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
  const after = suffix && !suffix.startsWith('\n') ? '\n' : '';
  const marker = `> [!${kind}] `;
  const inserted = selectedLines.length
    ? [marker + selectedLines[0], ...selectedLines.slice(1).map((line) => `> ${line}`)].join('\n')
    : marker;
  const cursor = start + before.length + (selectedLines.length ? inserted.length : marker.length);
  return {
    markdown: `${prefix}${before}${inserted}${after}${suffix}`,
    selection: { start: cursor, end: cursor },
  };
}

export function wrapMarkdownSelection(
  markdown: string,
  selection: MarkdownRange,
  before: string,
  after = before,
  placeholder = 'text',
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const selected = source.slice(start, end);
  const inner = selected || placeholder;
  const insert = `${before}${inner}${after}`;
  const innerStart = start + before.length;
  const innerEnd = innerStart + inner.length;
  return {
    markdown: `${source.slice(0, start)}${insert}${source.slice(end)}`,
    selection: selected ? { start: start + insert.length, end: start + insert.length } : { start: innerStart, end: innerEnd },
  };
}

export function insertMarkdownLink(
  markdown: string,
  selection: MarkdownRange,
  defaultLabel = 'title',
  defaultUrl = 'https://',
): MarkdownInsertResult {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  const selected = source.slice(start, end).trim();
  const selectedUrl = isHttpUrl(selected) ? selected : '';
  const label = escapeMarkdownLinkLabel(selectedUrl ? defaultLabel : selected || defaultLabel);
  const url = selectedUrl || defaultUrl;
  const insert = `[${label}](${url})`;
  const labelStart = start + 1;
  const labelEnd = labelStart + label.length;
  const urlStart = start + label.length + 3;
  const urlEnd = urlStart + url.length;
  return {
    markdown: `${source.slice(0, start)}${insert}${source.slice(end)}`,
    selection: selectedUrl || !selected ? { start: labelStart, end: labelEnd } : { start: urlStart, end: urlEnd },
  };
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/([\\\]])/g, '\\$1').replace(/\[/g, '\\[') || 'title';
}

export function formatMarkdownImage(alt: string, src: string): string {
  const safeAlt = escapeMarkdownLinkLabel(alt || 'image');
  return `![${safeAlt}](${src})`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function trimBlankLines(value: string): string {
  return value.replace(/^\n+/, '').replace(/\n+$/, '');
}

function linePrefix(prefixForLine: string | ((lineIndex: number) => string), lineIndex: number): string {
  return typeof prefixForLine === 'function' ? prefixForLine(lineIndex) : prefixForLine;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
