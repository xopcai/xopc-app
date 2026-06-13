import type { ComposerAttachment } from '../chat/composer.types';
import { readUriAsBase64 } from '../chat/attachment-file-io';
import { newAttachmentId } from '../chat/attachment-file-io-core';
import { inferRecordingMimeType } from '../chat/voiceRecording';
import { transcribeVoice } from '../../api/agent-client';
import {
  captureNote,
  type NoteKind,
} from '../../query/notes';
import { editorAttachmentToSync } from './editor/note-attachment.types';

function kindForComposerAttachment(att: ComposerAttachment): NoteKind {
  if (att.type === 'image' || att.mimeType.startsWith('image/')) return 'media';
  return 'mixed';
}

export function voiceAttachmentToSync(params: {
  content: string;
  name: string;
  mimeType: string;
  size: number;
  durationMillis: number;
  transcript?: string;
}) {
  return {
    id: newAttachmentId(params.name),
    type: 'audio' as const,
    mimeType: params.mimeType,
    fileName: params.name,
    size: params.size,
    data: params.content,
    duration: Math.max(1, Math.round(params.durationMillis / 1000)),
    ...(params.transcript ? { transcript: params.transcript } : {}),
  };
}

export async function captureNoteWithComposerAttachment(
  attachment: ComposerAttachment,
  text?: string,
): Promise<{ note: { id: string } }> {
  return captureNote({
    text: text?.trim() ?? '',
    kind: kindForComposerAttachment(attachment),
    attachments: [editorAttachmentToSync(attachment)],
  });
}

export async function captureNoteWithVoice(payload: {
  uri: string;
  durationMillis: number;
  mimeType: string;
}): Promise<{ note: { id: string } }> {
  const mimeType = payload.mimeType || inferRecordingMimeType(payload.uri);
  const name = mimeType.includes('mpeg') ? 'voice.mp3' : 'voice.m4a';
  const { content, size } = await readUriAsBase64(payload.uri, name);

  let transcript: string | undefined;
  try {
    const result = await transcribeVoice(payload.uri, mimeType);
    transcript = (result.refined || result.raw).trim() || undefined;
  } catch {
    /* STT optional — still save the recording */
  }

  return captureNote({
    text: transcript ?? '',
    kind: 'voice',
    attachments: [
      voiceAttachmentToSync({
        content,
        name,
        mimeType,
        size,
        durationMillis: payload.durationMillis,
        transcript,
      }),
    ],
  });
}
