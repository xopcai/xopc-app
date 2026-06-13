import { describe, expect, it } from 'vitest';

import { composerAttachmentsToWire } from '../../chat/composer.types';
import { MAX_CHAT_ATTACHMENTS } from '../../chat/chat-limits';
import { createImageBlock, createTextBlock, type NoteBlock } from '../note-blocks';
import {
  buildNoteChatContextText,
  collectNoteAttachmentsForChat,
  extractVoiceTranscripts,
} from '../note-to-chat-payload';
import type { NoteEditorAttachment } from '../editor/note-attachment.types';
import type { NoteAttachment } from '../../../query/notes';

const labels = {
  imagePlaceholder: (alt: string) => `[Image: ${alt}]`,
  voiceTranscript: (text: string) => `[Voice transcript: ${text}]`,
};

describe('buildNoteChatContextText', () => {
  it('keeps markdown structure without embedding image data URIs', () => {
    const blocks: NoteBlock[] = [
      Object.assign(createTextBlock('heading', 'Title'), { level: 2 }),
      { id: 'img', type: 'image', src: 'data:image/png;base64,abc123', alt: 'screenshot', createdAt: 1, updatedAt: 1 },
      createTextBlock('paragraph', 'Body text'),
    ];
    const text = buildNoteChatContextText(blocks, labels);
    expect(text).toContain('## Title');
    expect(text).toContain('[Image: screenshot]');
    expect(text).toContain('Body text');
    expect(text).not.toContain('base64');
    expect(text).not.toContain('data:image');
  });

  it('appends voice transcripts after body text', () => {
    const blocks = [createTextBlock('paragraph', 'Notes')];
    const text = buildNoteChatContextText(blocks, labels, {
      voiceTranscripts: ['Buy milk'],
    });
    expect(text).toBe('Notes\n\n[Voice transcript: Buy milk]');
  });
});

describe('extractVoiceTranscripts', () => {
  it('returns trimmed transcripts from audio attachments', () => {
    const attachments: NoteAttachment[] = [
      {
        id: 'a1',
        type: 'audio',
        mimeType: 'audio/m4a',
        fileName: 'voice.m4a',
        size: 1,
        relativePath: 'inbound/n/voice.m4a',
        transcript: '  hello  ',
      },
    ];
    expect(extractVoiceTranscripts(attachments)).toEqual(['hello']);
  });
});

describe('collectNoteAttachmentsForChat', () => {
  it('collects inline image blocks as composer attachments', async () => {
    const blocks: NoteBlock[] = [
      createImageBlock('data:image/png;base64,YWJj', 'pic'),
    ];
    const result = await collectNoteAttachmentsForChat(blocks, [], []);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].type).toBe('image');
    expect(result.attachments[0].content).toBe('YWJj');
    expect(result.droppedCount).toBe(0);
  });

  it('dedupes inline images that also exist in the attachment strip', async () => {
    const blocks: NoteBlock[] = [
      createImageBlock('data:image/png;base64,YWJj', 'pic'),
    ];
    const editor: NoteEditorAttachment[] = [{
      id: 'att1',
      type: 'image',
      name: 'pic.png',
      mimeType: 'image/png',
      size: 3,
      content: 'YWJj',
    }];
    const result = await collectNoteAttachmentsForChat(blocks, editor, []);
    expect(result.attachments).toHaveLength(1);
  });

  it('uses workspaceRelativePath for synced attachments without local base64', async () => {
    const synced: NoteAttachment[] = [{
      id: 'remote',
      type: 'file',
      mimeType: 'application/pdf',
      fileName: 'doc.pdf',
      size: 100,
      relativePath: 'inbound/n/doc.pdf',
    }];
    const result = await collectNoteAttachmentsForChat([], [], synced);
    expect(result.attachments[0].workspaceRelativePath).toBe('inbound/n/doc.pdf');
    expect(result.attachments[0].content).toBe('');
  });

  it('enriches editor attachments with synced relative paths', async () => {
    const editor: NoteEditorAttachment[] = [{
      id: 'remote',
      type: 'document',
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 100,
      content: '',
      localUri: 'https://gw.example/api/workspace/inbound-file?rel=inbound%2Fn%2Fdoc.pdf',
    }];
    const synced: NoteAttachment[] = [{
      id: 'remote',
      type: 'file',
      mimeType: 'application/pdf',
      fileName: 'doc.pdf',
      size: 100,
      relativePath: 'inbound/n/doc.pdf',
    }];
    const result = await collectNoteAttachmentsForChat([], editor, synced);
    expect(result.attachments[0].workspaceRelativePath).toBe('inbound/n/doc.pdf');
  });

  it('caps attachments to MAX_CHAT_ATTACHMENTS', async () => {
    const editor: NoteEditorAttachment[] = Array.from({ length: MAX_CHAT_ATTACHMENTS + 2 }, (_, index) => ({
      id: `att-${index}`,
      type: 'document' as const,
      name: `file-${index}.txt`,
      mimeType: 'text/plain',
      size: 4,
      content: btoa(`file-${index}`),
    }));
    const result = await collectNoteAttachmentsForChat([], editor, []);
    expect(result.attachments).toHaveLength(MAX_CHAT_ATTACHMENTS);
    expect(result.droppedCount).toBe(2);
  });
});

describe('composerAttachmentsToWire for note media', () => {
  it('maps audio attachments to voice wire type with workspace path', () => {
    const wire = composerAttachmentsToWire([
      {
        id: 'v1',
        type: 'document',
        name: 'voice.m4a',
        mimeType: 'audio/mp4',
        size: 100,
        content: '',
        workspaceRelativePath: 'inbound/n/voice.m4a',
        durationSeconds: 12,
      },
    ]);
    expect(wire).toEqual([
      {
        type: 'voice',
        mimeType: 'audio/mp4',
        name: 'voice.m4a',
        size: 100,
        workspaceRelativePath: 'inbound/n/voice.m4a',
        durationSeconds: 12,
      },
    ]);
  });
});
