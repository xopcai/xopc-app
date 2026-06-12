import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AttachmentFileError,
  formatAttachmentSize,
  pickAttachmentFromSource,
  type AttachmentPickSource,
} from '../../chat/attachment-file-io';
import { MAX_WEBCHAT_ATTACHMENT_FILE_BYTES } from '../../chat/chat-limits';
import type { Note } from '../../../query/notes';
import { useGatewayStore } from '../../../stores/gateway-store';
import type { LocalNoteSnapshot } from '../notes-local';

import { noteAttachmentToEditor, type NoteEditorAttachment } from './note-attachment.types';

const MAX_NOTE_ATTACHMENTS = 24;

export interface NoteAttachmentMessages {
  maxAttachmentsReached: string;
  attachmentFileTooLarge: string;
  attachmentLoadFailed: string;
  attachmentPermissionDenied: string;
}

function attachmentsFromNote(note: Note | undefined, apiUrl: (path: string) => string): NoteEditorAttachment[] {
  const local = note as LocalNoteSnapshot | undefined;
  if (local?.pendingAttachments?.length) return local.pendingAttachments;
  if (!note?.attachments?.length) return [];
  return note.attachments.map((att) => noteAttachmentToEditor(att, apiUrl));
}

export function useNoteAttachments(
  note: Note | undefined,
  messages: NoteAttachmentMessages,
  onPersist: (attachments: NoteEditorAttachment[]) => void,
) {
  const baseUrl = useGatewayStore((s) => s.baseUrl.trim());
  const apiUrl = useCallback((path: string) => `${baseUrl.replace(/\/$/, '')}${path}`, [baseUrl]);

  const [attachments, setAttachments] = useState<NoteEditorAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const loadedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!note?.id) return;
    if (loadedNoteIdRef.current === note.id) return;
    loadedNoteIdRef.current = note.id;
    setAttachments(attachmentsFromNote(note, apiUrl));
  }, [apiUrl, note]);

  const persist = useCallback((next: NoteEditorAttachment[]) => {
    setAttachments(next);
    onPersist(next);
  }, [onPersist]);

  const removeAttachment = useCallback((index: number) => {
    persist(attachmentsRef.current.filter((_, i) => i !== index));
  }, [persist]);

  const addFromSource = useCallback(async (source: AttachmentPickSource): Promise<boolean> => {
    if (attachmentsRef.current.length >= MAX_NOTE_ATTACHMENTS) {
      return false;
    }
    try {
      const picked = await pickAttachmentFromSource(source);
      if (!picked) return false;
      if (attachmentsRef.current.length >= MAX_NOTE_ATTACHMENTS) {
        return false;
      }
      persist([...attachmentsRef.current, picked]);
      return true;
    } catch (e) {
      if (e instanceof AttachmentFileError) {
        if (e.code === 'cancelled') return false;
        throw e;
      }
      throw e;
    }
  }, [persist]);

  const mapPickError = useCallback((error: unknown): string | null => {
    if (!(error instanceof AttachmentFileError)) {
      return messages.attachmentLoadFailed.replace('{{name}}', 'file');
    }
    if (error.code === 'cancelled') return null;
    if (error.code === 'permission_denied') return messages.attachmentPermissionDenied;
    if (error.code === 'too_large') {
      return messages.attachmentFileTooLarge
        .replace('{{name}}', error.fileName ?? 'file')
        .replace('{{maxSize}}', formatAttachmentSize(MAX_WEBCHAT_ATTACHMENT_FILE_BYTES));
    }
    return messages.attachmentLoadFailed.replace('{{name}}', error.fileName ?? 'file');
  }, [messages]);

  return {
    attachments,
    maxAttachments: MAX_NOTE_ATTACHMENTS,
    addFromSource,
    removeAttachment,
    mapPickError,
    isFull: attachments.length >= MAX_NOTE_ATTACHMENTS,
  };
}
