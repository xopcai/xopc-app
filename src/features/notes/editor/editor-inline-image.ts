import type { ComposerAttachment } from '../../chat/composer.types';

export function inlineImageDataUri(attachment: ComposerAttachment): string {
  if (attachment.localUri?.startsWith('data:')) return attachment.localUri;
  if (attachment.content) {
    return `data:${attachment.mimeType};base64,${attachment.content.replace(/\s/g, '')}`;
  }
  if (attachment.localUri) return attachment.localUri;
  return '';
}

export function isInlineImageSource(source: 'camera' | 'photos' | 'document'): boolean {
  return source === 'camera' || source === 'photos';
}
