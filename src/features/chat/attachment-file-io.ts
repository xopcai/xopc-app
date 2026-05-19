import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import {
  arrayBufferToBase64,
  composerAttachmentFromBase64,
  type AttachmentPickSource,
} from './attachment-file-io-core';
import { MAX_WEBCHAT_ATTACHMENT_FILE_BYTES } from './chat-limits';
import type { ComposerAttachment } from './composer.types';
import { mimeTypeFromFileName } from './tool-result-file-paths';

export {
  composerAttachmentFromBase64,
  formatAttachmentSize,
  shouldOpenNativeImageEditor,
  type AttachmentPickSource,
} from './attachment-file-io-core';

const EDITABLE_IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 0.92,
};

export class AttachmentFileError extends Error {
  constructor(
    message: string,
    readonly code: 'too_large' | 'permission_denied' | 'cancelled' | 'read_failed',
    readonly fileName?: string,
  ) {
    super(message);
    this.name = 'AttachmentFileError';
  }
}

export async function readUriAsBase64(uri: string, fileName?: string): Promise<{ content: string; size: number }> {
  let res: Response;
  try {
    res = await fetch(uri);
  } catch {
    throw new AttachmentFileError('Failed to read file', 'read_failed', fileName);
  }
  if (!res.ok) {
    throw new AttachmentFileError('Failed to read file', 'read_failed', fileName);
  }
  const buffer = await res.arrayBuffer();
  const size = buffer.byteLength;
  if (size > MAX_WEBCHAT_ATTACHMENT_FILE_BYTES) {
    throw new AttachmentFileError('File too large', 'too_large', fileName);
  }
  if (size === 0) {
    throw new AttachmentFileError('Failed to read file', 'read_failed', fileName);
  }
  return { content: arrayBufferToBase64(buffer), size };
}

async function loadFromUri(uri: string, name: string, mimeType?: string): Promise<ComposerAttachment> {
  const { content, size } = await readUriAsBase64(uri, name);
  const resolvedMime = mimeType || mimeTypeFromFileName(name);
  return composerAttachmentFromBase64({ uri, name, mimeType: resolvedMime, content, size });
}

async function ensureCameraPermission(): Promise<void> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return;
  const requested = await ImagePicker.requestCameraPermissionsAsync();
  if (!requested.granted) {
    throw new AttachmentFileError('Camera permission denied', 'permission_denied');
  }
}

export async function pickAttachmentFromSource(source: AttachmentPickSource): Promise<ComposerAttachment | null> {
  if (source === 'camera') {
    await ensureCameraPermission();
    const result = await ImagePicker.launchCameraAsync(EDITABLE_IMAGE_PICKER_OPTIONS);
    if (result.canceled || !result.assets[0]?.uri) return null;
    const asset = result.assets[0];
    const name = asset.fileName || `photo-${Date.now()}.jpg`;
    return loadFromUri(asset.uri, name, asset.mimeType ?? 'image/jpeg');
  }

  if (source === 'photos') {
    const result = await ImagePicker.launchImageLibraryAsync(EDITABLE_IMAGE_PICKER_OPTIONS);
    if (result.canceled || !result.assets[0]?.uri) return null;
    const asset = result.assets[0];
    const name = asset.fileName || `image-${Date.now()}.jpg`;
    return loadFromUri(asset.uri, name, asset.mimeType ?? 'image/jpeg');
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  const name = asset.name || `file-${Date.now()}`;
  return loadFromUri(asset.uri, name, asset.mimeType ?? mimeTypeFromFileName(name));
}
