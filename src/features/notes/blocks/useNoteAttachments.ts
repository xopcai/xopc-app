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

import { noteAttachmentToEditor, type NoteEditorAttachment } from './attachment.types';

const MAX_NOTE_ATTACHMENTS = 24;

export interface NoteAttachmentMessages {
  maxAttachmentsReached: string;
  attachmentFileTooLarge: string;
  attachmentLoadFailed: string;
  attachmentPermissionDenied: string;
}

function attachmentsFromNote(note: Note | undefined, apiUrl: (path: string) => string): NoteEditorAttachment[] {
  if (!note?.attachments?.length) return [];
  return note.attachments.map((att) => noteAttachmentToEditor(att, apiUrl));
}

export function useNoteAttachments(
  note: Note | undefined,
  messages: NoteAttachmentMessages,
) {
  const baseUrl = useGatewayStore((s) => s.baseUrl.trim());
  const apiUrl = useCallback((path: string) => `${baseUrl.replace(/\/$/, '')}${path}`, [baseUrl]);

  const [attachments, setAttachments] = useState<NoteEditorAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const loadedAttachmentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!note?.id) return;
    const attachmentKey = [
      note.id,
      note.updatedAt,
      note.attachments?.length ?? 0,
    ].join(':');
    if (loadedAttachmentKeyRef.current === attachmentKey) return;
    loadedAttachmentKeyRef.current = attachmentKey;
    const fromNote = attachmentsFromNote(note, apiUrl);
    setAttachments(fromNote);
  }, [apiUrl, note]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((previous) => {
      const next = previous.filter((_, i) => i !== index);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const removeAttachmentById = useCallback((id: string) => {
    setAttachments((previous) => {
      const next = previous.filter((attachment) => attachment.id !== id);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const appendAttachment = useCallback((attachment: NoteEditorAttachment) => {
    setAttachments((previous) => {
      const next = [...previous, attachment];
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const pickFromSource = useCallback(async (source: AttachmentPickSource): Promise<NoteEditorAttachment | null> => {
    if (attachmentsRef.current.length >= MAX_NOTE_ATTACHMENTS) {
      return null;
    }
    try {
      const picked = await pickAttachmentFromSource(source);
      if (!picked) return null;
      if (attachmentsRef.current.length >= MAX_NOTE_ATTACHMENTS) {
        return null;
      }
      return picked;
    } catch (e) {
      if (e instanceof AttachmentFileError) {
        if (e.code === 'cancelled') return null;
        throw e;
      }
      throw e;
    }
  }, []);

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
    pickFromSource,
    appendAttachment,
    removeAttachment,
    removeAttachmentById,
    mapPickError,
    isFull: attachments.length >= MAX_NOTE_ATTACHMENTS,
  };
}
