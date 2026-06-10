import type { ComposerAttachment } from '../chat/composer.types';
import { capAttachments, MAX_WEBCHAT_ATTACHMENT_FILE_BYTES } from '../chat/chat-limits';
import type { NoteAttachment, NoteBlock } from '../../query/notes';
import type { NoteEditorAttachment } from './blocks/attachment.types';
import { blocksToMarkdown, collectBlockImages } from './blocks/convert/block-serialize';

export type NoteChatContextLabels = {
  imagePlaceholder: (alt: string) => string;
  voiceTranscript: (text: string) => string;
};

export type NoteChatMediaCollection = {
  attachments: ComposerAttachment[];
  droppedCount: number;
};

function attachmentDedupeKey(att: ComposerAttachment): string {
  const rel = att.workspaceRelativePath?.replace(/\\/g, '/').trim();
  if (rel) return `rel:${rel}`;
  const content = att.content.replace(/\s/g, '');
  if (content) return `b64:${content.slice(0, 64)}:${content.length}`;
  if (att.localUri) return `uri:${att.localUri}`;
  return `id:${att.id}`;
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isAudioMime(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

function noteAttachmentToComposer(att: NoteAttachment, localUri?: string): ComposerAttachment {
  const isImage = att.type === 'image' || isImageMime(att.mimeType);
  const isAudio = att.type === 'audio' || isAudioMime(att.mimeType);
  return {
    id: att.id,
    type: isImage ? 'image' : 'document',
    name: att.fileName,
    mimeType: att.mimeType,
    size: att.size,
    content: '',
    localUri: (isImage || isAudio) ? localUri : undefined,
    workspaceRelativePath: att.relativePath || undefined,
    durationSeconds: att.duration,
  };
}

function enrichEditorAttachment(
  att: NoteEditorAttachment,
  syncedAttachments?: NoteAttachment[],
): ComposerAttachment {
  const synced = syncedAttachments?.find((item) => item.id === att.id);
  return {
    ...att,
    workspaceRelativePath: att.workspaceRelativePath ?? synced?.relativePath,
    durationSeconds: att.durationSeconds ?? synced?.duration,
  };
}

/** Markdown-like note body for chat context — never embeds data URIs or file URLs. */
export function buildNoteChatContextText(
  blocks: NoteBlock[],
  labels: NoteChatContextLabels,
  options?: { voiceTranscripts?: string[] },
): string {
  const body = blocksToMarkdown(blocks)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => {
      const altMatch = match.match(/^!\[([^\]]*)\]/);
      const alt = altMatch?.[1]?.trim() || 'image';
      return labels.imagePlaceholder(alt || 'image');
    })
    .trim();

  const transcripts = (options?.voiceTranscripts ?? [])
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => labels.voiceTranscript(text));

  if (!transcripts.length) return body;
  if (!body) return transcripts.join('\n\n');
  return `${body}\n\n${transcripts.join('\n\n')}`;
}

export function extractVoiceTranscripts(syncedAttachments?: NoteAttachment[]): string[] {
  if (!syncedAttachments?.length) return [];
  return syncedAttachments
    .filter((att) => att.type === 'audio' || isAudioMime(att.mimeType))
    .map((att) => att.transcript?.trim() ?? '')
    .filter(Boolean);
}

async function attachmentFromImageRef(
  attachmentId: string,
  alt: string | undefined,
  syncedAttachments?: NoteAttachment[],
): Promise<ComposerAttachment | null> {
  const synced = syncedAttachments?.find((item) => item.id === attachmentId);
  if (synced) {
    return noteAttachmentToComposer(synced);
  }
  const name = alt?.trim() || 'image';
  return {
    id: attachmentId,
    type: 'image',
    name,
    mimeType: mimeTypeFromName(name),
    size: 0,
    content: '',
  };
}

function mimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function withinSizeLimit(att: ComposerAttachment): boolean {
  if (att.workspaceRelativePath && !att.content) return true;
  if (!att.content) return false;
  const bytes = Math.ceil((att.content.replace(/\s/g, '').length * 3) / 4);
  return bytes <= MAX_WEBCHAT_ATTACHMENT_FILE_BYTES;
}

function pushUnique(
  out: ComposerAttachment[],
  seen: Set<string>,
  att: ComposerAttachment | null | undefined,
): void {
  if (!att) return;
  const key = attachmentDedupeKey(att);
  if (seen.has(key)) return;
  if (!withinSizeLimit(att)) return;
  seen.add(key);
  out.push(att);
}

export async function collectNoteAttachmentsForChat(
  blocks: NoteBlock[],
  editorAttachments: NoteEditorAttachment[],
  syncedAttachments?: NoteAttachment[],
): Promise<NoteChatMediaCollection> {
  const raw: ComposerAttachment[] = [];
  const seen = new Set<string>();

  for (const image of collectBlockImages(blocks)) {
    pushUnique(raw, seen, await attachmentFromImageRef(image.attachmentId, image.alt, syncedAttachments));
  }

  for (const att of editorAttachments) {
    const enriched = enrichEditorAttachment(att, syncedAttachments);
    if (enriched.content) {
      pushUnique(raw, seen, enriched);
      continue;
    }
    if (enriched.workspaceRelativePath || enriched.localUri) {
      pushUnique(raw, seen, enriched);
    }
  }

  if (syncedAttachments?.length) {
    for (const att of syncedAttachments) {
      if (editorAttachments.some((item) => item.id === att.id)) continue;
      pushUnique(raw, seen, noteAttachmentToComposer(att));
    }
  }

  const capped = capAttachments(raw) ?? [];
  return {
    attachments: capped,
    droppedCount: Math.max(0, raw.length - capped.length),
  };
}

export { blocksToMarkdown };
