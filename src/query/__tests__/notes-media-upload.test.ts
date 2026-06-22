import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../../api/client';
import { uploadNoteMedia } from '../notes';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  formatApiHttpError: vi.fn((status: number, statusText: string, message?: string) =>
    message ? `${status} ${statusText}: ${message}` : `${status} ${statusText}`,
  ),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe('uploadNoteMedia', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        attachment: {
          id: 'att-1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'photo.png',
          size: 4,
          relativePath: 'notes/note-1/att-1.png',
        },
      }),
    } as Response);
  });

  it('uploads the ImagePicker web File instead of treating localUri as missing content', async () => {
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    await expect(uploadNoteMedia('note-1', {
      localUri: 'blob:http://localhost/photo',
      file,
      name: 'photo.png',
      mimeType: 'image/png',
    })).resolves.toEqual(expect.objectContaining({ id: 'att-1' }));

    const [path, init] = mockedApiFetch.mock.calls[0];
    expect(path).toBe('/api/notes/note-1/media');
    expect(init?.body).toBeInstanceOf(FormData);
    const appended = (init?.body as FormData).get('file') as File;
    expect(appended.name).toBe('photo.png');
    expect(appended.type).toBe('image/png');
    expect(appended.size).toBe(4);
  });
});
