import {
  composerAttachmentFromBase64,
  newAttachmentId,
} from '../chat/attachment-file-io-core';
import type { ComposerAttachment } from '../chat/composer.types';
import { capAttachments, MAX_CHAT_ATTACHMENTS, MAX_WEBCHAT_ATTACHMENT_FILE_BYTES } from '../chat/chat-limits';
import type { NoteAttachment } from '../../query/notes';
import type { NoteEditorAttachment } from './editor/note-attachment.types';
import type { NoteBlock } from './note-blocks';

export type NoteChatContextLabels = {
  imagePlaceholder: (alt: string) => string;
  voiceTranscript: (text: string) => string;
};

export type NoteChatMediaCollection = {
  attachments: ComposerAttachment[];
  droppedCount: number;
};

function coalesceText(text: string | undefined | null): string {
  return text ?? '';
}

function parseDataUri(src: string): { mimeType: string; content: string } | null {
  const match = src.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1],
    content: match[2].replace(/\s/g, ''),
  };
}

function relativePathFromGatewayUrl(src: string): string | null {
  try {
    const url = new URL(src, 'https://local.invalid');
    if (!url.pathname.includes('inbound-file') && !url.pathname.includes('tts-file')) {
      return null;
    }
    const rel = url.searchParams.get('rel');
    return rel ? decodeURIComponent(rel) : null;
  } catch {
    return null;
  }
}

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

function composerTypeFromMime(mimeType: string): ComposerAttachment['type'] {
  return isImageMime(mimeType) ? 'image' : 'document';
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

function blockToChatContextLine(block: NoteBlock, labels: NoteChatContextLabels): string {
  if (block.type === 'divider') return '\n---\n';
  if (block.type === 'image') {
    const alt = block.alt?.trim() || 'image';
    return labels.imagePlaceholder(alt);
  }
  if (block.type === 'heading') {
    const prefix = '#'.repeat(block.level ?? 2);
    return `${prefix} ${block.text}`;
  }
  if (block.type === 'todo') return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
  if (block.type === 'bulletList') return `- ${block.text}`;
  if (block.type === 'numberedList') return `1. ${block.text}`;
  if (block.type === 'quote') return `> ${block.text}`;
  if (block.type === 'code') return `\`\`\`\n${block.text}\n\`\`\``;
  return block.text;
}

/** Markdown-like note body for chat context — never embeds data URIs or file URLs. */
export function buildNoteChatContextText(
  blocks: NoteBlock[],
  labels: NoteChatContextLabels,
  options?: { voiceTranscripts?: string[] },
): string {
  const body = blocks
    .map((block) => blockToChatContextLine(block, labels))
    .filter((line) => coalesceText(line).trim().length > 0)
    .join('\n\n')
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

async function attachmentFromImageBlock(block: Extract<NoteBlock, { type: 'image' }>): Promise<ComposerAttachment | null> {
  const src = block.src.trim();
  if (!src) return null;

  const dataUri = parseDataUri(src);
  if (dataUri) {
    const name = block.alt?.trim() || 'image.png';
    const size = Math.ceil((dataUri.content.length * 3) / 4);
    return composerAttachmentFromBase64({
      uri: src,
      name,
      mimeType: dataUri.mimeType,
      content: dataUri.content,
      size,
    });
  }

  const relativePath = relativePathFromGatewayUrl(src);
  if (relativePath) {
    const name = block.alt?.trim() || relativePath.split('/').pop() || 'image';
    const mimeType = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return {
      id: newAttachmentId(name),
      type: 'image',
      name,
      mimeType,
      size: 0,
      content: '',
      localUri: src.startsWith('http') ? src : undefined,
      workspaceRelativePath: relativePath,
    };
  }

  if (src.startsWith('file://') || src.startsWith('content://') || src.startsWith('blob:')) {
    const name = block.alt?.trim() || 'image.jpg';
    const { readUriAsBase64 } = await import('../chat/attachment-file-io');
    const { content, size } = await readUriAsBase64(src, name);
    return composerAttachmentFromBase64({
      uri: src,
      name,
      mimeType: mimeTypeFromName(name),
      content,
      size,
    });
  }

  return null;
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

/**
 * Collect note media for chat composer attachments (inline images + attachment strip + synced files).
 */
export async function collectNoteAttachmentsForChat(
  blocks: NoteBlock[],
  editorAttachments: NoteEditorAttachment[],
  syncedAttachments?: NoteAttachment[],
): Promise<NoteChatMediaCollection> {
  const raw: ComposerAttachment[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (block.type !== 'image') continue;
    pushUnique(raw, seen, await attachmentFromImageBlock(block));
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
