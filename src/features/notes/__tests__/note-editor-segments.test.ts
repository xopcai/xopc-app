import { describe, expect, it } from 'vitest';

import {
  blocksToEditorSegments,
  insertImageBlockIntoBlocks,
  mergeRichSegmentIntoBlocks,
  removeImageBlockFromBlocks,
} from '../editor/note-editor-segments';
import { createImageBlock, createTextBlock, type NoteBlock } from '../note-blocks';

function paragraph(id: string, text: string): NoteBlock {
  return { ...createTextBlock('paragraph', text), id };
}

describe('note-editor-segments', () => {
  it('splits blocks into rich and image segments', () => {
    const blocks: NoteBlock[] = [
      paragraph('a', 'Hello'),
      createImageBlock('data:image/png;base64,abc', 'pic'),
      paragraph('b', 'World'),
    ];
    const segments = blocksToEditorSegments(blocks);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ kind: 'rich', blockIds: ['a'] });
    expect(segments[1]).toMatchObject({ kind: 'image', key: segments[1]?.kind === 'image' ? segments[1].block.id : '' });
    expect(segments[2]).toMatchObject({ kind: 'rich', blockIds: ['b'] });
    if (segments[1]?.kind === 'image') {
      expect(segments[1].block.alt).toBe('pic');
    }
  });

  it('merges rich segment html without reintroducing images', () => {
    const blocks: NoteBlock[] = [
      paragraph('a', 'Before'),
      createImageBlock('data:image/png;base64,abc'),
      paragraph('b', 'After'),
    ];
    const segments = blocksToEditorSegments(blocks);
    const richAfter = segments[2];
    expect(richAfter?.kind).toBe('rich');
    if (richAfter?.kind !== 'rich') return;

    const merged = mergeRichSegmentIntoBlocks(blocks, richAfter.blockIds, '<p data-block-id="b">Updated</p><img src="x">');
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ id: 'a', text: 'Before' });
    expect(merged[1]).toMatchObject({ type: 'image' });
    expect(merged[2]).toMatchObject({ id: 'b', text: 'Updated' });
  });

  it('inserts image block after active segment with trailing paragraph', () => {
    const blocks: NoteBlock[] = [paragraph('a', 'Text')];
    const { blocks: next, focusSegmentKey } = insertImageBlockIntoBlocks(blocks, ['a'], 'data:image/jpeg;base64,xyz', 'photo');
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ id: 'a' });
    expect(next[1]).toMatchObject({ type: 'image', alt: 'photo' });
    expect(next[2]).toMatchObject({ type: 'paragraph' });
    expect(focusSegmentKey).toBe(next[2]?.id);
  });

  it('removes image block and keeps at least one paragraph', () => {
    const image = createImageBlock('data:image/png;base64,abc');
    const next = removeImageBlockFromBlocks([image], image.id);
    expect(next).toHaveLength(1);
    expect(next[0]?.type).toBe('paragraph');
  });
});
