import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../query/notes', () => ({
  captureNote: vi.fn(),
  updateNote: vi.fn(),
}));

vi.mock('../../chat/attachment-file-io', () => ({
  readUriAsBase64: vi.fn(),
}));

vi.mock('../../../api/agent-client', () => ({
  transcribeVoice: vi.fn(),
}));

vi.mock('../../chat/voiceRecording', () => ({
  inferRecordingMimeType: vi.fn(() => 'audio/mp4'),
}));

import { captureNote, updateNote } from '../../../query/notes';
import {
  captureNoteWithComposerAttachment,
  captureNoteWithQueuedVoice,
} from '../capture-note-media';

const mockedCaptureNote = vi.mocked(captureNote);
const mockedUpdateNote = vi.mocked(updateNote);

describe('capture note media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches an image capture with a markdown attachment reference', async () => {
    mockedCaptureNote.mockResolvedValue({
      note: {
        id: 'note-1',
        markdown: '',
        attachments: [{
          id: 'att-1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'photo[1].png',
          size: 4,
          relativePath: 'photo.png',
        }],
      },
    });
    mockedUpdateNote.mockResolvedValue({
      id: 'note-1',
      kind: 'media',
      status: 'inbox',
      markdown: '![photo\\[1\\].png](xopc-attachment://notes/note-1/att-1)',
      createdAt: 1,
      updatedAt: 2,
      capturedVia: { channel: 'app' },
    });

    await captureNoteWithComposerAttachment({
      id: 'local-1',
      type: 'image',
      name: 'photo[1].png',
      mimeType: 'image/png',
      size: 4,
      content: 'ZGF0YQ==',
    });

    expect(mockedCaptureNote).toHaveBeenCalledWith({
      text: '',
      kind: 'media',
      attachments: [{
        mimeType: 'image/png',
        fileName: 'photo[1].png',
        localUri: undefined,
        data: 'ZGF0YQ==',
      }],
    });
    expect(mockedUpdateNote).toHaveBeenCalledWith('note-1', {
      markdown: '![photo\\[1\\].png](xopc-attachment://notes/note-1/att-1)',
    });
  });

  it('patches a voice capture with transcript text plus a voice attachment link', async () => {
    mockedCaptureNote.mockResolvedValue({
      note: {
        id: 'note-voice',
        markdown: 'call mom',
        attachments: [{
          id: 'audio-1',
          type: 'audio',
          mimeType: 'audio/mp4',
          fileName: 'voice.m4a',
          size: 8,
          relativePath: 'voice.m4a',
          duration: 3,
        }],
      },
    });
    mockedUpdateNote.mockResolvedValue({
      id: 'note-voice',
      kind: 'voice',
      status: 'inbox',
      markdown: 'call mom\n\n[Voice memo 0:03](xopc-attachment://notes/note-voice/audio-1)',
      createdAt: 1,
      updatedAt: 2,
      capturedVia: { channel: 'app' },
    });

    await captureNoteWithQueuedVoice({
      content: 'YXVkaW8=',
      name: 'voice.m4a',
      mimeType: 'audio/mp4',
      durationMillis: 3200,
      transcript: 'call mom',
    });

    expect(mockedCaptureNote).toHaveBeenCalledWith({
      text: 'call mom',
      kind: 'voice',
      attachments: [{
        mimeType: 'audio/mp4',
        fileName: 'voice.m4a',
        localUri: undefined,
        data: 'YXVkaW8=',
        duration: 3,
      }],
    });
    expect(mockedUpdateNote).toHaveBeenCalledWith('note-voice', {
      markdown: 'call mom\n\n[Voice memo 0:03](xopc-attachment://notes/note-voice/audio-1)',
      kind: 'voice',
    });
  });
});
