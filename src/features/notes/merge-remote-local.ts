import type { Note } from '../../query/notes';
import { documentIsEmpty, noteToDocument } from './blocks/convert/block-serialize';
import type { LocalNoteSnapshot } from './notes-local';

/** Prefer local snapshot when it has unsynced or newer edits. */
export function mergeRemoteWithLocal(
  remoteNote?: Note,
  localNote?: LocalNoteSnapshot | null,
): Note | LocalNoteSnapshot | undefined {
  if (!remoteNote) return localNote ?? undefined;
  if (!localNote) return remoteNote;

  if (localNote.syncState === 'pending' || localNote.syncState === 'failed') {
    return localNote;
  }

  const remoteDocument = noteToDocument(remoteNote);
  if (localNote.document && documentIsEmpty(localNote.document) && !documentIsEmpty(remoteDocument)) {
    return {
      ...remoteNote,
      ...localNote,
      document: remoteDocument,
      blocks: remoteNote.blocks,
      text: remoteNote.text ?? localNote.text,
    };
  }

  if ((localNote.localVersion ?? 0) > (remoteNote.localVersion ?? 0)) {
    return localNote;
  }

  if (localNote.updatedAt >= remoteNote.updatedAt) {
    return localNote;
  }

  return remoteNote;
}
