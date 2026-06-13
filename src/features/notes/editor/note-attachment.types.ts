import type { ComposerAttachment } from '../../chat/composer.types';
import type { NoteAttachment } from '../../../query/notes';
import { workspaceRelativePathToApiPath } from '../../chat/workspace-file-url';

/** Pending attachment stored on a local note snapshot before sync. */
export type NoteEditorAttachment = ComposerAttachment;

export function noteAttachmentToEditor(att: NoteAttachment, apiUrl: (path: string) => string): NoteEditorAttachment {
  const isImage = att.type === 'image' || att.mimeType.startsWith('image/');
  const isAudio = att.type === 'audio' || att.mimeType.startsWith('audio/');
  const remoteUri = att.relativePath
    ? apiUrl(workspaceRelativePathToApiPath(att.relativePath))
    : undefined;
  return {
    id: att.id,
    type: isImage ? 'image' : 'document',
    name: att.fileName,
    mimeType: att.mimeType,
    size: att.size,
    content: '',
    localUri: (isImage || isAudio) ? remoteUri : undefined,
  };
}

export function editorAttachmentToSync(att: NoteEditorAttachment) {
  const isImage = att.type === 'image' || att.mimeType.startsWith('image/');
  const isAudio = att.mimeType.startsWith('audio/');
  return {
    id: att.id,
    type: isImage ? 'image' as const : isAudio ? 'audio' as const : 'file' as const,
    mimeType: att.mimeType,
    fileName: att.name,
    size: att.size,
    data: att.content || undefined,
  };
}
