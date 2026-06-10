import type { ComposerAttachment } from '../chat/composer.types';
import { readUriAsBase64 } from '../chat/attachment-file-io';
import { inferRecordingMimeType } from '../chat/voiceRecording';
import { transcribeVoice } from '../../api/agent-client';
import {
  captureNote,
  type CaptureNoteAttachment,
  type NoteKind,
} from '../../query/notes';

export type QueuedVoiceCapture = {
  content: string;
  name: string;
  mimeType: string;
  localUri?: string;
  durationMillis: number;
  transcript?: string;
};

function kindForComposerAttachment(att: ComposerAttachment): NoteKind {
  if (att.type === 'image' || att.mimeType.startsWith('image/')) return 'media';
  return 'mixed';
}

function captureAttachmentFromComposer(att: ComposerAttachment): CaptureNoteAttachment {
  return {
    mimeType: att.mimeType,
    fileName: att.name,
    localUri: att.localUri,
    data: att.content || undefined,
  };
}

export function voiceCaptureAttachment(params: {
  content: string;
  name: string;
  mimeType: string;
  localUri?: string;
  durationMillis: number;
}): CaptureNoteAttachment {
  return {
    mimeType: params.mimeType,
    fileName: params.name,
    localUri: params.localUri,
    data: params.content,
    duration: Math.max(1, Math.round(params.durationMillis / 1000)),
  };
}

export async function captureNoteWithComposerAttachment(
  attachment: ComposerAttachment,
  text?: string,
): Promise<{ note: { id: string } }> {
  return captureNote({
    text: text?.trim() ?? '',
    kind: kindForComposerAttachment(attachment),
    attachments: [captureAttachmentFromComposer(attachment)],
  });
}

export async function captureNoteWithVoice(payload: {
  uri: string;
  durationMillis: number;
  mimeType: string;
}): Promise<{ note: { id: string } }> {
  const queued = await prepareVoiceCapturePayload(payload);
  return captureNoteWithQueuedVoice(queued);
}

export async function prepareVoiceCapturePayload(payload: {
  uri: string;
  durationMillis: number;
  mimeType: string;
}): Promise<QueuedVoiceCapture> {
  const mimeType = payload.mimeType || inferRecordingMimeType(payload.uri);
  const name = mimeType.includes('mpeg') ? 'voice.mp3' : 'voice.m4a';
  const { content } = await readUriAsBase64(payload.uri, name);

  let transcript: string | undefined;
  try {
    const result = await transcribeVoice(payload.uri, mimeType);
    transcript = (result.refined || result.raw).trim() || undefined;
  } catch {
    /* STT optional — still save the recording */
  }

  return {
    content,
    name,
    mimeType,
    localUri: payload.uri,
    durationMillis: payload.durationMillis,
    transcript,
  };
}

export async function captureNoteWithQueuedVoice(
  payload: QueuedVoiceCapture,
): Promise<{ note: { id: string } }> {
  return captureNote({
    text: payload.transcript ?? '',
    kind: 'voice',
    attachments: [
      voiceCaptureAttachment({
        content: payload.content,
        name: payload.name,
        mimeType: payload.mimeType,
        localUri: payload.localUri,
        durationMillis: payload.durationMillis,
      }),
    ],
  });
}
