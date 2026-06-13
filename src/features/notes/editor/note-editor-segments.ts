import {
  blocksToHtml,
  createImageBlock,
  createTextBlock,
  htmlToBlocks,
  type ImageNoteBlock,
  type NoteBlock,
} from '../note-blocks';

export type RichEditorSegment = {
  kind: 'rich';
  key: string;
  blockIds: string[];
  html: string;
};

export type ImageEditorSegment = {
  kind: 'image';
  key: string;
  block: ImageNoteBlock;
};

export type EditorSegment = RichEditorSegment | ImageEditorSegment;

/** HTML for TipTap segments — excludes image blocks (rendered natively). */
export function blocksToRichHtml(blocks: NoteBlock[]): string {
  const richBlocks = blocks.filter((block) => block.type !== 'image');
  if (!richBlocks.length) return '<p><br></p>';
  return blocksToHtml(richBlocks);
}

/** Split note blocks into alternating rich-text and native image segments. */
export function blocksToEditorSegments(blocks: NoteBlock[]): EditorSegment[] {
  const segments: EditorSegment[] = [];
  let richBlocks: NoteBlock[] = [];

  const flushRich = () => {
    if (!richBlocks.length) return;
    segments.push({
      kind: 'rich',
      key: richBlocks.map((block) => block.id).join(':'),
      blockIds: richBlocks.map((block) => block.id),
      html: blocksToRichHtml(richBlocks),
    });
    richBlocks = [];
  };

  for (const block of blocks) {
    if (block.type === 'image') {
      flushRich();
      segments.push({ kind: 'image', key: block.id, block });
    } else {
      richBlocks.push(block);
    }
  }
  flushRich();

  if (!segments.length) {
    segments.push({
      kind: 'rich',
      key: 'empty',
      blockIds: [],
      html: '<p><br></p>',
    });
  }

  return segments;
}

function segmentRange(blocks: NoteBlock[], segmentBlockIds: string[]): { start: number; end: number } | null {
  if (!segmentBlockIds.length) return null;
  const start = blocks.findIndex((block) => block.id === segmentBlockIds[0]);
  const end = blocks.findIndex((block) => block.id === segmentBlockIds[segmentBlockIds.length - 1]);
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end };
}

/** Merge a rich segment's TipTap HTML back into the full block list (images stay native). */
export function mergeRichSegmentIntoBlocks(
  blocks: NoteBlock[],
  segmentBlockIds: string[],
  html: string,
): NoteBlock[] {
  const previousSegmentBlocks = segmentBlockIds.length
    ? blocks.filter((block) => segmentBlockIds.includes(block.id))
    : [];
  const parsed = htmlToBlocks(html, previousSegmentBlocks).filter((block) => block.type !== 'image');

  if (!segmentBlockIds.length) {
    return parsed.length ? [...parsed, ...blocks] : blocks;
  }

  const range = segmentRange(blocks, segmentBlockIds);
  if (!range) return blocks;

  return [
    ...blocks.slice(0, range.start),
    ...parsed,
    ...blocks.slice(range.end + 1),
  ];
}

/** Insert an inline image block after the active rich segment, with a trailing paragraph. */
export function insertImageBlockIntoBlocks(
  blocks: NoteBlock[],
  activeSegmentBlockIds: string[],
  src: string,
  alt = '',
): { blocks: NoteBlock[]; focusSegmentKey: string } {
  const imageBlock = createImageBlock(src, alt);
  const trailingParagraph = createTextBlock('paragraph');
  let nextBlocks: NoteBlock[];

  if (!activeSegmentBlockIds.length) {
    nextBlocks = [...blocks, imageBlock, trailingParagraph];
  } else {
    const range = segmentRange(blocks, activeSegmentBlockIds);
    const insertAt = range ? range.end + 1 : blocks.length;
    nextBlocks = [
      ...blocks.slice(0, insertAt),
      imageBlock,
      trailingParagraph,
      ...blocks.slice(insertAt),
    ];
  }

  return {
    blocks: nextBlocks,
    focusSegmentKey: trailingParagraph.id,
  };
}

export function removeImageBlockFromBlocks(blocks: NoteBlock[], blockId: string): NoteBlock[] {
  const filtered = blocks.filter((block) => block.id !== blockId);
  return filtered.length ? filtered : [createTextBlock('paragraph')];
}
