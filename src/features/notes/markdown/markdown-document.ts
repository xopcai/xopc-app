export type MarkdownBlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'callout'
  | 'code'
  | 'image'
  | 'raw';

export type MarkdownRange = {
  start: number;
  end: number;
};

interface BaseMarkdownBlock {
  id: string;
  type: MarkdownBlockType;
  markdown: string;
  range: MarkdownRange;
}

export type MarkdownEditorBlock =
  | (BaseMarkdownBlock & { type: 'paragraph'; text: string })
  | (BaseMarkdownBlock & { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string })
  | (BaseMarkdownBlock & { type: 'todo'; checked: boolean; text: string })
  | (BaseMarkdownBlock & { type: 'bulletList'; marker: '-' | '*'; text: string })
  | (BaseMarkdownBlock & { type: 'numberedList'; index: number; text: string })
  | (BaseMarkdownBlock & { type: 'quote'; text: string })
  | (BaseMarkdownBlock & { type: 'callout'; kind: string; text: string; fold?: '+' | '-' })
  | (BaseMarkdownBlock & { type: 'code'; language?: string; code: string })
  | (BaseMarkdownBlock & { type: 'image'; alt: string; src: string })
  | (BaseMarkdownBlock & { type: 'raw'; reason: 'html' | 'table' | 'unsupported'; text: string });

export interface MarkdownEditorDocument {
  source: string;
  blocks: MarkdownEditorBlock[];
  parseWarnings: string[];
}

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

export interface MarkdownSearchMatch {
  id: string;
  query: string;
  range: MarkdownRange;
  snippet: string;
}

export type MarkdownAiContext =
  | { type: 'selection'; range: MarkdownRange; markdown: string }
  | { type: 'section'; range: MarkdownRange; markdown: string; heading: string; headingLevel: 1 | 2 | 3 | 4 | 5 | 6; sectionId: string }
  | { type: 'block'; range: MarkdownRange; markdown: string; blockType: MarkdownBlockType }
  | { type: 'note'; range: MarkdownRange; markdown: string };

type SourceLine = {
  text: string;
  start: number;
  end: number;
};

export function parseMarkdownDocument(markdown: string): MarkdownEditorDocument {
  const source = markdown.replace(/\r\n/g, '\n');
  const lines = splitSourceLines(source);
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  const blocks: MarkdownEditorBlock[] = [];
  const parseWarnings: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (frontmatterRange && line.start < frontmatterRange.end) continue;
    const trimmed = line.text.trim();
    if (!trimmed) continue;

    const codeFence = /^```([^\s`]*)?.*$/.exec(line.text);
    if (codeFence) {
      const startLine = line;
      const codeLines: string[] = [];
      let endLine = line;
      let closed = false;
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        if (/^```\s*$/.test(nextLine.text)) {
          endLine = nextLine;
          index = nextIndex;
          closed = true;
          break;
        }
        codeLines.push(nextLine.text);
        endLine = nextLine;
        index = nextIndex;
      }
      if (!closed) parseWarnings.push('Unclosed fenced code block.');
      const markdownSlice = source.slice(startLine.start, endLine.end);
      blocks.push(withId({
        type: 'code',
        language: codeFence[1] || undefined,
        code: codeLines.join('\n'),
        markdown: markdownSlice,
        range: { start: startLine.start, end: endLine.end },
      }));
      continue;
    }

    const image = parseMarkdownImageLine(line.text);
    if (image) {
      blocks.push(withId({
        type: 'image',
        alt: image.alt,
        src: image.src,
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const heading = /^(#{1,6})\s*(.*)$/.exec(line.text);
    if (heading) {
      blocks.push(withId({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2],
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const todo = /^-\s+\[([ xX])\]\s*(.*)$/.exec(line.text);
    if (todo) {
      blocks.push(withId({
        type: 'todo',
        checked: todo[1].toLowerCase() === 'x',
        text: todo[2],
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const bullet = /^([-*])\s+(.*)$/.exec(line.text);
    if (bullet) {
      blocks.push(withId({
        type: 'bulletList',
        marker: bullet[1] as '-' | '*',
        text: bullet[2],
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const numbered = /^(\d+)\.\s*(.*)$/.exec(line.text);
    if (numbered) {
      blocks.push(withId({
        type: 'numberedList',
        index: Number(numbered[1]),
        text: numbered[2],
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const callout = /^>\s*\[!([A-Za-z0-9][A-Za-z0-9_-]*)\]([+-])?\s*(.*)$/.exec(line.text);
    if (callout) {
      const startLine = line;
      const calloutLines = [callout[3] ?? ''];
      let endLine = line;
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        const quoted = /^>\s?(.*)$/.exec(nextLine.text);
        if (!quoted) break;
        calloutLines.push(quoted[1]);
        endLine = nextLine;
        index = nextIndex;
      }
      blocks.push(withId({
        type: 'callout',
        kind: callout[1].toUpperCase(),
        fold: callout[2] as '+' | '-' | undefined,
        text: calloutLines.join('\n').trimEnd(),
        markdown: source.slice(startLine.start, endLine.end),
        range: { start: startLine.start, end: endLine.end },
      }));
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line.text);
    if (quote) {
      blocks.push(withId({
        type: 'quote',
        text: quote[1],
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    if (isRawLine(line.text)) {
      const reason = line.text.trimStart().startsWith('<')
        ? 'html'
        : line.text.includes('|')
          ? 'table'
          : 'unsupported';
      blocks.push(withId({
        type: 'raw',
        reason,
        text: line.text,
        markdown: line.text,
        range: { start: line.start, end: line.end },
      }));
      continue;
    }

    const startLine = line;
    const paragraphLines = [line.text];
    let endLine = line;
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (!nextLine.text.trim()) break;
      if (isStructuralLine(nextLine.text)) break;
      paragraphLines.push(nextLine.text);
      endLine = nextLine;
      index = nextIndex;
    }
    const markdownSlice = source.slice(startLine.start, endLine.end);
    blocks.push(withId({
      type: 'paragraph',
      text: paragraphLines.join('\n'),
      markdown: markdownSlice,
      range: { start: startLine.start, end: endLine.end },
    }));
  }

  return { source, blocks, parseWarnings };
}

export function stripMarkdownFrontmatter(markdown: string): string {
  const source = markdown.replace(/\r\n/g, '\n');
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  if (!frontmatterRange) return source;
  return source.slice(frontmatterRange.end).replace(/^\n+/, '');
}

export function getMarkdownBodyStartOffset(markdown: string): number {
  const source = markdown.replace(/\r\n/g, '\n');
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  if (!frontmatterRange) return 0;
  let offset = frontmatterRange.end;
  while (source[offset] === '\n') offset += 1;
  return offset;
}

export function isMarkdownRangeInFrontmatter(markdown: string, range: MarkdownRange): boolean {
  const source = markdown.replace(/\r\n/g, '\n');
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  if (!frontmatterRange) return false;
  const start = clamp(Math.min(range.start, range.end), 0, source.length);
  const end = clamp(Math.max(range.start, range.end), 0, source.length);
  return start >= frontmatterRange.start && end <= frontmatterRange.end;
}

export function getVisibleMarkdownSelection(markdown: string, selection: MarkdownRange): MarkdownRange {
  const source = markdown.replace(/\r\n/g, '\n');
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  if (!frontmatterRange) return selection;
  const bodyStart = getMarkdownBodyStartOffset(markdown);
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  if (end <= bodyStart) return { start: bodyStart, end: bodyStart };
  if (start < bodyStart) return { start: bodyStart, end };
  return selection;
}

export function serializeMarkdownDocument(blocks: MarkdownEditorBlock[]): string {
  return blocks.map(blockToMarkdown).filter((part) => part.length > 0).join('\n\n');
}

export function getMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  const seen = new Map<string, number>();
  return parseMarkdownDocument(markdown).blocks
    .filter((block): block is Extract<MarkdownEditorBlock, { type: 'heading' }> => block.type === 'heading')
    .map((block) => {
      const { id: explicitId, title } = parseHeadingAnchor(block.text);
      const baseId = explicitId || slugifyHeading(title) || `heading-${block.range.start}`;
      const count = seen.get(baseId) ?? 0;
      seen.set(baseId, count + 1);
      return {
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        title,
        level: block.level,
        range: block.range,
      };
    });
}

export function extractMarkdownWikiLinks(markdown: string): MarkdownWikiLink[] {
  const source = markdown.replace(/\r\n/g, '\n');
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

export function renderWikiLinksToMarkdown(markdown: string): string {
  const source = markdown.replace(/\r\n/g, '\n');
  const links = extractMarkdownWikiLinks(source);
  if (!links.length) return source;
  let rendered = '';
  let cursor = 0;
  for (const link of links) {
    rendered += source.slice(cursor, link.range.start);
    const params = new URLSearchParams({ title: link.target });
    if (link.heading) params.set('heading', link.heading);
    rendered += `[${escapeMarkdownLinkLabel(link.label)}](xopc-note://open?${params.toString()})`;
    cursor = link.range.end;
  }
  return rendered + source.slice(cursor);
}

export function renderObsidianCalloutsToMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  return lines.map((line) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    const callout = /^>\s*\[!([A-Za-z0-9][A-Za-z0-9_-]*)\][+-]?\s*(.*)$/.exec(line);
    if (!callout) return line;
    const label = titleCaseCalloutKind(callout[1]);
    const title = callout[2]?.trim();
    return title ? `> **${label}** - ${title}` : `> **${label}**`;
  }).join('\n');
}

export function formatWikiLink(target: string, label?: string): string {
  const normalizedTarget = sanitizeWikiLinkPart(target) || 'Untitled';
  const normalizedLabel = label ? sanitizeWikiLinkPart(label) : '';
  if (!normalizedLabel || normalizedLabel === normalizedTarget) return `[[${normalizedTarget}]]`;
  return `[[${normalizedTarget}|${normalizedLabel}]]`;
}

export function findMarkdownMatches(markdown: string, query: string, contextChars = 28): MarkdownSearchMatch[] {
  const source = markdown.replace(/\r\n/g, '\n');
  const needle = query.trim();
  if (!needle) return [];
  const haystack = source.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const ignoredRanges = ignoredMarkdownRangesForSearch(source);
  const matches: MarkdownSearchMatch[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const index = haystack.indexOf(normalizedNeedle, cursor);
    if (index < 0) break;
    const end = index + needle.length;
    if (isInsideRange(index, ignoredRanges)) {
      cursor = Math.max(end, index + 1);
      continue;
    }
    matches.push({
      id: `match_${index}_${end}`,
      query: source.slice(index, end),
      range: { start: index, end },
      snippet: snippetAroundRange(source, { start: index, end }, contextChars, ignoredRanges),
    });
    cursor = Math.max(end, index + 1);
  }
  return matches;
}

export function canFocusStructuredMarkdownRange(markdown: string, range: MarkdownRange): boolean {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(range.start, range.end), 0, source.length);
  const end = clamp(Math.max(range.start, range.end), 0, source.length);
  return parseMarkdownDocument(source).blocks.some((block) => (
    block.type !== 'image'
    && block.type !== 'raw'
    && start <= block.range.end
    && end >= block.range.start
  ));
}

export function getStructuredMarkdownFocusRange(markdown: string, range: MarkdownRange): MarkdownRange | null {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(range.start, range.end), 0, source.length);
  const end = clamp(Math.max(range.start, range.end), 0, source.length);
  const blocks = parseMarkdownDocument(source).blocks;
  const exact = blocks.find((block) => (
    block.type !== 'image'
    && block.type !== 'raw'
    && start <= block.range.end
    && end >= block.range.start
  ));
  if (exact) return { start, end };

  const cursor = start;
  const containingUnsupported = blocks.find((block) => (
    (block.type === 'image' || block.type === 'raw')
    && cursor >= block.range.start
    && cursor <= block.range.end
  ));
  if (containingUnsupported) {
    const next = blocks.find((block) => block.range.start > containingUnsupported.range.end && block.type !== 'image' && block.type !== 'raw');
    if (next) {
      const offset = next.range.start + focusableBlockContentOffset(next);
      return { start: offset, end: offset };
    }
    const previous = [...blocks].reverse().find((block) => block.range.end < containingUnsupported.range.start && block.type !== 'image' && block.type !== 'raw');
    if (previous) {
      const offset = previous.range.start + focusableBlockContentOffset(previous);
      return { start: offset, end: offset };
    }
  }

  let nearest: MarkdownEditorBlock | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const block of blocks) {
    if (block.type === 'image' || block.type === 'raw') continue;
    const distance = cursor < block.range.start
      ? block.range.start - cursor
      : cursor > block.range.end
        ? cursor - block.range.end
        : 0;
    if (distance < nearestDistance) {
      nearest = block;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;
  const offset = nearest.range.start + focusableBlockContentOffset(nearest);
  return { start: offset, end: offset };
}

export function getMarkdownAiContext(markdown: string, selection: MarkdownRange): MarkdownAiContext {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  if (end > start) {
    return {
      type: 'selection',
      range: { start, end },
      markdown: source.slice(start, end),
    };
  }

  const section = findSectionAtOffset(source, start);
  if (section) return section;
  const block = findBlockAtOffset(source, start);
  if (block) return block;
  return {
    type: 'note',
    range: { start: 0, end: source.length },
    markdown: source,
  };
}

export function getWholeMarkdownAiContext(markdown: string): MarkdownAiContext {
  const source = markdown.replace(/\r\n/g, '\n');
  return {
    type: 'note',
    range: { start: 0, end: source.length },
    markdown: source,
  };
}

export function summarizeMarkdownAiContext(context: MarkdownAiContext, maxChars = 140): string {
  const markdown = context.type === 'note' ? stripMarkdownFrontmatter(context.markdown) : context.markdown;
  const source = markdown.replace(/\s+/g, ' ').trim();
  if (source.length <= maxChars) return source;
  return `${source.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function blockToMarkdown(block: MarkdownEditorBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
    case 'bulletList':
      return `${block.marker} ${block.text}`;
    case 'numberedList':
      return `${block.index}. ${block.text}`;
    case 'quote':
      return `> ${block.text}`;
    case 'callout': {
      const lines = block.text.split('\n');
      const title = lines[0] ?? '';
      const rest = lines.slice(1);
      return [`> [!${block.kind}]${block.fold ?? ''} ${title}`, ...rest.map((line) => `> ${line}`)].join('\n').trimEnd();
    }
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${block.code}\n\`\`\``;
    case 'image':
      return `![${escapeMarkdownImageAlt(block.alt)}](${block.src})`;
    case 'paragraph':
    case 'raw':
      return block.text;
  }
}

function parseMarkdownImageLine(line: string): { alt: string; src: string } | null {
  const image = /^!\[((?:\\.|[^\]\\])*)\]\((.+)\)\s*$/.exec(line);
  if (!image?.[2]) return null;
  return {
    alt: unescapeMarkdownImageAlt(image[1]),
    src: image[2].trim(),
  };
}

function escapeMarkdownImageAlt(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/([\\\]])/g, '\\$1').replace(/\[/g, '\\[');
}

function unescapeMarkdownImageAlt(value: string): string {
  return value.replace(/\\([\\[\]])/g, '$1');
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

function findMarkdownFrontmatterRange(source: string): MarkdownRange | null {
  if (!source.startsWith('---\n')) return null;
  const lines = splitSourceLines(source);
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.text.trim() !== '---') continue;
    return {
      start: 0,
      end: source[line.end] === '\n' ? line.end + 1 : line.end,
    };
  }
  return null;
}

function isStructuralLine(line: string): boolean {
  return /^```/.test(line)
    || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)
    || /^(#{1,6})\s+/.test(line)
    || /^-\s+\[[ xX]\]\s+/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^>\s?/.test(line)
    || isRawLine(line);
}

function isRawLine(line: string): boolean {
  const trimmed = line.trim();
  return /^<[^>]+>/.test(trimmed) || /^\|.*\|$/.test(trimmed);
}

function withId<T extends Omit<MarkdownEditorBlock, 'id'>>(block: T): T & { id: string } {
  return {
    ...block,
    id: `mdb_${block.range.start}_${block.type}`,
  };
}

function parseWikiLinkTarget(raw: string): Pick<MarkdownWikiLink, 'target' | 'label' | 'heading'> {
  const [destinationRaw, labelRaw] = raw.split('|', 2);
  const [targetRaw, headingRaw] = destinationRaw.split('#', 2);
  const target = targetRaw.trim();
  const heading = headingRaw?.trim() || undefined;
  const label = (labelRaw?.trim() || heading || target).trim();
  return { target, heading, label };
}

function sanitizeWikiLinkPart(value: string): string {
  return value.replace(/\]\]/g, ']').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

function fencedCodeRanges(source: string): MarkdownRange[] {
  const ranges: MarkdownRange[] = [];
  const lines = splitSourceLines(source);
  let openStart: number | null = null;
  for (const line of lines) {
    if (!/^```/.test(line.text)) continue;
    if (openStart == null) {
      openStart = line.start;
    } else {
      ranges.push({ start: openStart, end: line.end });
      openStart = null;
    }
  }
  if (openStart != null) ranges.push({ start: openStart, end: source.length });
  return ranges;
}

function ignoredMarkdownRanges(source: string): MarkdownRange[] {
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  return frontmatterRange ? [frontmatterRange, ...fencedCodeRanges(source)] : fencedCodeRanges(source);
}

function ignoredMarkdownRangesForSearch(source: string): MarkdownRange[] {
  const frontmatterRange = findMarkdownFrontmatterRange(source);
  return frontmatterRange ? [frontmatterRange] : [];
}

function isInsideRange(offset: number, ranges: MarkdownRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/([\\\]])/g, '\\$1');
}

function titleCaseCalloutKind(kind: string): string {
  return kind
    .replace(/[-_]+/g, ' ')
    .toLowerCase()
    .replace(/\b\p{Letter}/gu, (char) => char.toLocaleUpperCase());
}

function snippetAroundRange(source: string, range: MarkdownRange, contextChars: number, ignoredRanges: MarkdownRange[] = []): string {
  let start = Math.max(0, range.start - contextChars);
  let end = Math.min(source.length, range.end + contextChars);
  for (const ignored of ignoredRanges) {
    if (range.start >= ignored.end && start < ignored.end) start = ignored.end;
    if (range.end <= ignored.start && end > ignored.start) end = ignored.start;
  }
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  return `${prefix}${source.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function findSectionAtOffset(source: string, offset: number): Extract<MarkdownAiContext, { type: 'section' }> | null {
  const headings = getMarkdownOutline(source);
  if (!headings.length) return null;
  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const heading = headings[index];
    if (heading.range.start > offset) continue;
    let end = source.length;
    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const next = headings[nextIndex];
      if (next.level <= heading.level) {
        end = next.range.start;
        break;
      }
    }
    if (offset > end) continue;
    return {
      type: 'section',
      range: { start: heading.range.start, end },
      markdown: source.slice(heading.range.start, end).trimEnd(),
      heading: heading.title,
      headingLevel: heading.level,
      sectionId: heading.id,
    };
  }
  return null;
}

function findBlockAtOffset(source: string, offset: number): Extract<MarkdownAiContext, { type: 'block' }> | null {
  const block = parseMarkdownDocument(source).blocks.find((item) => (
    item.type !== 'image'
    && item.type !== 'raw'
    && offset >= item.range.start
    && offset <= item.range.end
  ));
  if (!block) return null;
  return {
    type: 'block',
    range: block.range,
    markdown: source.slice(block.range.start, block.range.end),
    blockType: block.type,
  };
}

function focusableBlockContentOffset(block: MarkdownEditorBlock): number {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function parseHeadingAnchor(text: string): { id?: string; title: string } {
  const anchor = /\s+\{#([A-Za-z0-9_-]+)\}\s*$/.exec(text);
  if (!anchor) return { title: text.trim() };
  return {
    id: anchor[1],
    title: text.slice(0, anchor.index).trim(),
  };
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
