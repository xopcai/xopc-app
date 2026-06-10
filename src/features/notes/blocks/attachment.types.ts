import type { ComposerAttachment } from '../../chat/composer.types';
import type { NoteAttachment } from '../../../query/notes';
import { workspaceRelativePathToApiPath } from '../../chat/workspace-file-url';

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
    workspaceRelativePath: att.relativePath,
    durationSeconds: att.duration,
  };
}
