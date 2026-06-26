export type MarkdownRange = {
  start: number;
  end: number;
};

export interface MarkdownOutlineItem {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  range: MarkdownRange;
}

export interface MarkdownWikiLink {
  target: string;
  label: string;
  heading?: string;
  range: MarkdownRange;
}

type SourceLine = {
  text: string;
  start: number;
  end: number;
};

export function stripMarkdownFrontmatter(markdown: string): string {
  const source = normalizeMarkdown(markdown);
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  if (!frontmatterRange) return source;
  return source.slice(frontmatterRange.end).replace(/^\n+/, '');
}

export function getMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  const source = normalizeMarkdown(markdown);
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  const seen = new Map<string, number>();
  const outline: MarkdownOutlineItem[] = [];
  let inFence = false;

  for (const line of splitSourceLines(source)) {
    if (frontmatterRange && line.start < frontmatterRange.end) continue;
    if (/^```/.test(line.text.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = /^(#{1,6})\s*(.*)$/.exec(line.text);
    if (!heading) continue;

    const { id: explicitId, title } = parseHeadingAnchor(heading[2]);
    const baseId = explicitId || slugifyHeading(title) || `heading-${line.start}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    outline.push({
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
      title,
      level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
      range: { start: line.start, end: line.end },
    });
  }

  return outline;
}

export function extractMarkdownWikiLinks(markdown: string): MarkdownWikiLink[] {
  const source = normalizeMarkdown(markdown);
  const ignoredRanges = ignoredMarkdownRanges(source);
  const links: MarkdownWikiLink[] = [];
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) != null) {
    const start = match.index;
    const end = start + match[0].length;
    if (isInsideRange(start, ignoredRanges)) continue;

    const parsed = parseWikiLinkTarget(match[1]);
    if (!parsed.target) continue;
    links.push({
      ...parsed,
      range: { start, end },
    });
  }

  return links;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n');
}

function splitSourceLines(source: string): SourceLine[] {
  if (!source) return [];
  const lines: SourceLine[] = [];
  let start = 0;

  while (start < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline >= 0 ? newline : source.length;
    lines.push({ text: source.slice(start, end), start, end });
    if (newline < 0) break;
    start = newline + 1;
  }

  return lines;
}

function ignoredMarkdownRanges(source: string): MarkdownRange[] {
  return [
    findMarkdownFrontmatterRange(source),
    ...fencedCodeRanges(source),
  ].filter((range): range is MarkdownRange => range != null);
}

function fencedCodeRanges(source: string): MarkdownRange[] {
  const ranges: MarkdownRange[] = [];
  const lines = splitSourceLines(source);
  let start: number | null = null;

  for (const line of lines) {
    if (!/^```/.test(line.text.trim())) continue;
    if (start == null) {
      start = line.start;
    } else {
      ranges.push({ start, end: line.end });
      start = null;
    }
  }

  if (start != null) ranges.push({ start, end: source.length });
  return ranges;
}

function findMarkdownFrontmatterRange(source: string): MarkdownRange | null {
  if (!source.startsWith('---\n')) return null;
  const end = source.indexOf('\n---', 4);
  if (end < 0) return null;
  const closeEnd = source.indexOf('\n', end + 4);
  return { start: 0, end: closeEnd < 0 ? source.length : closeEnd + 1 };
}

function isInsideRange(offset: number, ranges: MarkdownRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function parseHeadingAnchor(raw: string): { id?: string; title: string } {
  const match = /\s*\{#([^}]+)}\s*$/.exec(raw);
  if (!match) return { title: raw.trim() };
  return {
    id: match[1].trim(),
    title: raw.slice(0, match.index).trim(),
  };
}

function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseWikiLinkTarget(raw: string): Pick<MarkdownWikiLink, 'target' | 'label' | 'heading'> {
  const [targetPart = '', labelPart] = raw.split('|');
  const [titlePart = '', headingPart] = targetPart.split('#');
  const target = sanitizeWikiLinkPart(titlePart);
  const heading = sanitizeWikiLinkPart(headingPart ?? '');
  const label = sanitizeWikiLinkPart(labelPart ?? (heading || target || raw));
  return {
    target,
    label: label || target,
    ...(heading ? { heading } : {}),
  };
}

function sanitizeWikiLinkPart(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
