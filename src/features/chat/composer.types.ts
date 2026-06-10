/** Wire attachment shape for POST /api/agent (keep in sync with gateway + web). */
export type WireAttachment = {
  type: string;
  mimeType?: string;
  data?: string;
  name?: string;
  size?: number;
  workspaceRelativePath?: string;
  durationSeconds?: number;
};

/** Pending attachment in the mobile composer before send. */
export type ComposerAttachment = {
  id: string;
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  size: number;
  /** Base64 payload without data-URI prefix. */
  content: string;
  /** Local file URI for thumbnails (file://) or remote preview URL. */
  localUri?: string;
  /** Gateway workspace path when the file is already on the server. */
  workspaceRelativePath?: string;
  durationSeconds?: number;
};

function resolveWireAttachmentType(att: ComposerAttachment): string {
  if (att.mimeType.startsWith('audio/')) return 'voice';
  if (att.type === 'image' || att.mimeType.startsWith('image/')) return 'image';
  return 'document';
}

export function composerAttachmentsToWire(attachments: ComposerAttachment[]): WireAttachment[] {
  return attachments
    .map((a) => {
      const data = a.content.replace(/\s/g, '') || undefined;
      const wire: WireAttachment = {
        type: resolveWireAttachmentType(a),
        mimeType: a.mimeType,
        name: a.name,
        size: a.size,
        ...(data ? { data } : {}),
        ...(a.workspaceRelativePath ? { workspaceRelativePath: a.workspaceRelativePath } : {}),
        ...(a.durationSeconds != null ? { durationSeconds: a.durationSeconds } : {}),
      };
      return wire;
    })
    .filter((a) => Boolean(a.data || a.workspaceRelativePath));
}
