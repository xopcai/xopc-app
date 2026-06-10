import { describe, expect, it } from 'vitest';

import { emptyParagraphBlock } from '../blocks/convert/block-serialize';
import type { Note, NoteBlock } from '../../../query/notes';
import type { LocalNoteSnapshot } from '../notes-local';
import { mergeRemoteWithLocal } from '../merge-remote-local';
import { createEmptyDocument, documentFromBlocks } from '../blocks/convert/block-serialize';

function paragraphBlock(text: string, id = 'block_1'): NoteBlock {
  return {
    id,
    type: 'paragraph',
    text,
    parentId: null,
    childIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function remote(overrides: Partial<Note> = {}): Note {
  const blocks = overrides.blocks ?? [paragraphBlock('remote')];
  return {
    id: 'note-1',
    kind: 'thought',
    status: 'inbox',
    blocks,
    text: 'remote',
    createdAt: 1,
    updatedAt: 100,
    capturedVia: { channel: 'app' },
    localVersion: 1,
    ...overrides,
  };
}

function local(overrides: Partial<LocalNoteSnapshot> = {}): LocalNoteSnapshot {
  const blocks = overrides.blocks ?? [paragraphBlock('local edit', 'block_local')];
  const document = overrides.document ?? documentFromBlocks(blocks);
  return {
    ...remote(),
    document,
    blocks,
    text: 'local edit',
    localVersion: 2,
    syncState: 'pending',
    updatedAt: 200,
    ...overrides,
  };
}

describe('mergeRemoteWithLocal', () => {
  it('returns local when remote is missing', () => {
    expect(mergeRemoteWithLocal(undefined, local())).toEqual(local());
  });

  it('prefers pending local edits over newer remote timestamps', () => {
    const merged = mergeRemoteWithLocal(
      remote({ updatedAt: 999, text: 'server copy', blocks: [paragraphBlock('server copy')] }),
      local({ syncState: 'pending', updatedAt: 200, text: 'local edit' }),
    );
    expect(merged?.text).toBe('local edit');
  });

  it('prefers local when localVersion is ahead', () => {
    const merged = mergeRemoteWithLocal(
      remote({ localVersion: 1, updatedAt: 500 }),
      local({ syncState: 'synced', localVersion: 3, updatedAt: 400 }),
    );
    expect(merged?.text).toBe('local edit');
  });

  it('uses remote when it is newer and local is synced', () => {
    const merged = mergeRemoteWithLocal(
      remote({ updatedAt: 500, text: 'server wins', blocks: [paragraphBlock('server wins')] }),
      local({
        syncState: 'synced',
        localVersion: 1,
        updatedAt: 100,
        text: 'stale local',
        blocks: [paragraphBlock('stale local')],
        document: documentFromBlocks([paragraphBlock('stale local')]),
      }),
    );
    expect(merged?.text).toBe('server wins');
  });

  it('repairs an empty synced local document from remote blocks', () => {
    const remoteBlocks: NoteBlock[] = [paragraphBlock('12321')];
    const merged = mergeRemoteWithLocal(
      remote({
        updatedAt: 500,
        text: '12321',
        blocks: remoteBlocks,
      }),
      local({
        syncState: 'synced',
        localVersion: 1,
        updatedAt: 600,
        text: '',
        blocks: [emptyParagraphBlock()],
        document: createEmptyDocument(),
      }),
    );

    expect(merged?.text).toBe('12321');
    expect(merged?.blocks?.[0]).toMatchObject({
      type: 'paragraph',
      text: '12321',
    });
  });
});
