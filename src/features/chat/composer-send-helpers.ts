import type { WireAttachment } from './composer.types';
import type { Message, MessageAttachment, MessageContent } from './messages.types';

export function wireAttachmentsToMessageAttachments(wire: WireAttachment[]): MessageAttachment[] {
  return wire.map((w, index) => ({
    id: `pending-${index}-${Date.now()}`,
    name: w.name,
    type: w.type,
    mimeType: w.mimeType,
    size: w.size,
    content: w.data,
    data: w.data,
    preview: w.type === 'image' || w.mimeType?.startsWith('image/') ? w.data : undefined,
  }));
}

export function buildUserMessageContent(text: string, wire?: WireAttachment[]): MessageContent[] {
  const blocks: MessageContent[] = [];
  const trimmed = text.trim();
  if (trimmed) {
    blocks.push({ type: 'text', text: trimmed });
  }
  for (const att of wire ?? []) {
    const isImage = att.type === 'image' || att.mimeType?.startsWith('image/') === true;
    if (!isImage || !att.data) continue;
    const mime = att.mimeType || 'image/png';
    const payload = att.data.replace(/\s/g, '');
    blocks.push({
      type: 'image',
      source: {
        data: payload.startsWith('data:') ? payload : `data:${mime};base64,${payload}`,
        media_type: mime,
      },
    });
  }
  return blocks;
}

export function buildOptimisticUserMessage(text: string, wire?: WireAttachment[]): Message {
  const attachments = wire?.length ? wireAttachmentsToMessageAttachments(wire) : undefined;
  const content = buildUserMessageContent(text, wire);
  const hasAttachments = Boolean(attachments?.length);
  return {
    role: hasAttachments ? 'user-with-attachments' : 'user',
    content: content.length ? content : [{ type: 'text', text: text.trim() || '' }],
    attachments,
    timestamp: Date.now(),
  };
}

export function canSendComposerDraft(text: string, attachmentCount: number): boolean {
  return text.trim().length > 0 || attachmentCount > 0;
}
