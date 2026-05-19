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
  /** Local file URI for thumbnails (file://). */
  localUri?: string;
};

export function composerAttachmentsToWire(attachments: ComposerAttachment[]): WireAttachment[] {
  return attachments.map((a) => ({
    type: a.type,
    mimeType: a.mimeType,
    data: a.content,
    name: a.name,
    size: a.size,
  }));
}
