import { describe, expect, it } from 'vitest';

import type { Note } from '../../../query/notes';
import type { LocalNoteSnapshot } from '../notes-local';
import { mergeRemoteWithLocal } from '../merge-remote-local';

function remote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    kind: 'thought',
    status: 'inbox',
    text: 'remote',
    createdAt: 1,
    updatedAt: 100,
    capturedVia: { channel: 'app' },
    localVersion: 1,
    ...overrides,
  };
}

function local(overrides: Partial<LocalNoteSnapshot> = {}): LocalNoteSnapshot {
  return {
    ...remote(),
    blocks: [{ id: 'b1', type: 'paragraph', text: 'local edit', createdAt: 1, updatedAt: 1 }],
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
      remote({ updatedAt: 999, text: 'server copy' }),
      local({ syncState: 'pending', updatedAt: 200, text: 'local edit' }),
    );
    expect(merged?.blocks?.[0]).toMatchObject({ text: 'local edit' });
  });

  it('prefers local when localVersion is ahead', () => {
    const merged = mergeRemoteWithLocal(
      remote({ localVersion: 1, updatedAt: 500 }),
      local({ syncState: 'synced', localVersion: 3, updatedAt: 400 }),
    );
    expect(merged?.blocks?.[0]).toMatchObject({ text: 'local edit' });
  });

  it('uses remote when it is newer and local is synced', () => {
    const merged = mergeRemoteWithLocal(
      remote({ updatedAt: 500, text: 'server wins' }),
      local({ syncState: 'synced', localVersion: 1, updatedAt: 100, text: 'stale local' }),
    );
    expect(merged?.text).toBe('server wins');
  });
});
