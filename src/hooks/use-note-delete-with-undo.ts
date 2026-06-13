import { useCallback, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { LIST_DELETE_UNDO_MS } from '../constants/list-interaction';
import { useMessages } from '../i18n/messages';
import { removeNoteFromListCaches, upsertNoteInListCaches } from '../query/note-list-cache';
import { deleteNote, type NoteIndexEntry } from '../query/notes';
import { invalidateHomeFeed } from '../query/workspace-sync';

type PendingDelete = {
  entry: NoteIndexEntry;
  timer: ReturnType<typeof setTimeout>;
};

export type NoteDeleteSnack = {
  message: string;
  undoLabel: string;
  onUndo: () => void;
};

export function useNoteDeleteWithUndo(queryClient: QueryClient) {
  const m = useMessages();
  const li = m.listInteraction;
  const pendingRef = useRef<PendingDelete | null>(null);

  const cancelPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    upsertNoteInListCaches(queryClient, pending.entry);
    pendingRef.current = null;
  }, [queryClient]);

  const deleteWithUndo = useCallback(
    (entry: NoteIndexEntry): NoteDeleteSnack => {
      cancelPending();
      const removed = removeNoteFromListCaches(queryClient, entry.id) ?? entry;
      const timer = setTimeout(() => {
        pendingRef.current = null;
        void deleteNote(removed.id)
          .then(() => invalidateHomeFeed(queryClient))
          .catch(() => {
            upsertNoteInListCaches(queryClient, removed);
          });
      }, LIST_DELETE_UNDO_MS);
      pendingRef.current = { entry: removed, timer };
      return {
        message: m.notesPage.deleted,
        undoLabel: li.undo,
        onUndo: cancelPending,
      };
    },
    [cancelPending, li.undo, m.notesPage.deleted, queryClient],
  );

  return { deleteWithUndo, cancelPending };
}
