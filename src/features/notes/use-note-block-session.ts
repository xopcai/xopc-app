import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { queryKeys } from '../../query/keys';
import { noteToIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import {
  fetchNote,
  recordNoteOpen,
  type Note,
  type NoteBlock,
} from '../../query/notes';
import { useGatewayStore } from '../../stores/gateway-store';
import { workspaceRelativePathToApiPath } from '../chat/workspace-file-url';
import type { BlockDocument } from './blocks/core/block-document';
import type { BlockTransaction } from './blocks/core/block-command';
import {
  createEmptyDocument,
  documentIsEmpty,
  documentToMarkdown,
  noteToDocument,
} from './blocks/convert/block-serialize';
import { useBlockEditor } from './blocks/runtime/use-block-editor';
import { useDebouncedCallback } from './blocks/use-debounced-callback';
import { mergeRemoteWithLocal } from './merge-remote-local';
import {
  applyNoteServerVersion,
  flushPendingNoteOperations,
  readLocalNote,
  saveLocalNoteEdit,
  scheduleNoteEditSync,
  writeLocalNote,
  type LocalNoteSnapshot,
} from './notes-local';

const SAVE_DEBOUNCE_MS = 400;

function resolveNoteAttachmentUrl(relativePath: string): string {
  return useGatewayStore.getState().apiUrl(workspaceRelativePathToApiPath(relativePath));
}

export interface UseNoteBlockSessionOptions {
  noteId: string | undefined;
}

export interface UseNoteBlockSessionResult {
  noteQuery: UseQueryResult<Note, Error>;
  note: Note | undefined;
  noteRef: RefObject<Note | undefined>;
  localNote: LocalNoteSnapshot | null;
  setLocalNote: React.Dispatch<React.SetStateAction<LocalNoteSnapshot | null>>;
  document: BlockDocument;
  documentRef: RefObject<BlockDocument>;
  blocks: NoteBlock[];
  blocksRef: RefObject<NoteBlock[]>;
  flatBlockIds: string[];
  editor: ReturnType<typeof useBlockEditor>;
  dispatch: (tx: BlockTransaction) => void;
  flushPendingSave: () => Promise<void>;
  leaveNoteEdit: () => Promise<void>;
  syncEditsInBackground: () => Promise<void>;
  markdownForExport: string;
}

export function useNoteBlockSession({
  noteId,
}: UseNoteBlockSessionOptions): UseNoteBlockSessionResult {
  const queryClient = useQueryClient();
  const noteRef = useRef<Note | undefined>(undefined);
  const syncInFlightRef = useRef(false);
  const recordedOpenRef = useRef<string | null>(null);
  const lastSeedKeyRef = useRef('');

  const [localNote, setLocalNote] = useState<LocalNoteSnapshot | null>(
    () => (noteId ? readLocalNote(noteId) : null),
  );

  const syncAfterSaveDebounced = useDebouncedCallback(() => {
    void (async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        await flushPendingNoteOperations();
        if (noteId) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.note(noteId) });
        }
        setLocalNote(noteId ? readLocalNote(noteId) : null);
      } finally {
        syncInFlightRef.current = false;
      }
    })();
  }, SAVE_DEBOUNCE_MS);

  const persistDocumentDebounced = useDebouncedCallback((doc: BlockDocument) => {
    const currentNote = noteRef.current;
    if (!currentNote) return;
    const snapshot = saveLocalNoteEdit(currentNote, doc);
    if (!snapshot) return;
    setLocalNote(snapshot);
    noteRef.current = snapshot;
    queryClient.setQueryData(queryKeys.note(currentNote.id), snapshot);
    if (snapshot.syncState === 'pending') {
      scheduleNoteEditSync();
      syncAfterSaveDebounced();
    }
  }, SAVE_DEBOUNCE_MS);

  const editor = useBlockEditor(createEmptyDocument(), {
    onDocumentChange: persistDocumentDebounced,
  });

  const blocksRef = useRef<NoteBlock[]>(editor.blocks);
  blocksRef.current = editor.blocks;

  const noteQuery = useQuery({
    queryKey: noteId ? queryKeys.note(noteId) : ['note', 'missing'],
    queryFn: () => fetchNote(noteId!),
    enabled: Boolean(noteId),
    retry: 1,
  });

  const note = useMemo(
    () => mergeRemoteWithLocal(noteQuery.data, localNote),
    [localNote, noteQuery.data],
  );
  noteRef.current = note;

  const markdownForExport = useMemo(
    () => documentToMarkdown(editor.document, {
      noteId,
      attachments: note?.attachments,
      resolveAttachmentUrl: resolveNoteAttachmentUrl,
    }),
    [editor.document, note?.attachments, noteId],
  );

  useEffect(() => {
    if (!noteQuery.data) return;
    upsertNoteInListCaches(queryClient, noteToIndexEntry(noteQuery.data));
  }, [noteQuery.data, queryClient]);

  useEffect(() => {
    if (!noteId) return;
    setLocalNote(readLocalNote(noteId));
  }, [noteId]);

  useEffect(() => {
    if (!noteId || !noteQuery.data) return;
    if (recordedOpenRef.current === noteId) return;
    recordedOpenRef.current = noteId;

    void recordNoteOpen(noteId)
      .then((opened) => {
        if (!opened || opened.remoteVersion == null) return;
        const next = applyNoteServerVersion(noteId, opened);
        if (next) setLocalNote(next);
        queryClient.setQueryData<Note>(queryKeys.note(noteId), (previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            remoteVersion: opened.remoteVersion,
            lastOpenedAt: opened.lastOpenedAt ?? previous.lastOpenedAt,
          };
        });
      })
      .catch(() => {});
  }, [noteId, noteQuery.data, queryClient]);

  useEffect(() => {
    lastSeedKeyRef.current = '';
    recordedOpenRef.current = null;
    editor.setDocument(createEmptyDocument(), { silent: true });
  }, [noteId]);

  useEffect(() => {
    if (!note || !noteId) return;
    if (lastSeedKeyRef.current === noteId) return;
    lastSeedKeyRef.current = noteId;

    const localSnapshot = readLocalNote(noteId);
    const nextDocument = localSnapshot?.document ?? noteToDocument(note);
    editor.setDocument(nextDocument, { silent: true });

    if (!localSnapshot) {
      writeLocalNote({
        ...note,
        document: nextDocument,
        blocks: note.blocks,
        localVersion: note.localVersion ?? 0,
        syncState: 'synced',
      });
      return;
    }

    if (
      localSnapshot.document &&
      localSnapshot.syncState === 'synced' &&
      documentIsEmpty(localSnapshot.document) &&
      !documentIsEmpty(nextDocument)
    ) {
      const repaired: LocalNoteSnapshot = {
        ...localSnapshot,
        ...note,
        document: nextDocument,
        blocks: note.blocks,
        text: note.text ?? localSnapshot.text,
        syncState: 'synced',
      };
      writeLocalNote(repaired);
      setLocalNote(repaired);
    }
  }, [note, noteId]);

  const dispatch = useCallback((tx: BlockTransaction) => {
    editor.dispatch(tx);
  }, [editor]);

  const flushPendingSave = useCallback(async () => {
    persistDocumentDebounced.flush();
  }, [persistDocumentDebounced]);

  const syncEditsInBackground = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      await flushPendingNoteOperations();
      if (noteId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.note(noteId) });
      }
      setLocalNote(noteId ? readLocalNote(noteId) : null);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [noteId, queryClient]);

  const leaveNoteEdit = useCallback(async () => {
    await flushPendingSave();
    void syncEditsInBackground();
  }, [flushPendingSave, syncEditsInBackground]);

  return {
    noteQuery,
    note,
    noteRef,
    localNote,
    setLocalNote,
    document: editor.document,
    documentRef: editor.documentRef,
    blocks: editor.blocks,
    blocksRef,
    flatBlockIds: editor.flatBlockIds,
    editor,
    dispatch,
    flushPendingSave,
    leaveNoteEdit,
    syncEditsInBackground,
    markdownForExport,
  };
}
