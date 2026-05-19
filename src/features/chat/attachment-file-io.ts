import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import {
  composerAttachmentFromBase64,
  formatAttachmentSize,
} from './attachment-file-io-core';
import { MAX_WEBCHAT_ATTACHMENT_FILE_BYTES } from './chat-limits';
import type { ComposerAttachment } from './composer.types';
import { mimeTypeFromFileName } from './tool-result-file-paths';

export { composerAttachmentFromBase64, formatAttachmentSize } from './attachment-file-io-core';

export type AttachmentPickSource = 'camera' | 'photos' | 'document';

export class AttachmentFileError extends Error {
  constructor(
    message: string,
    readonly code: 'too_large' | 'permission_denied' | 'cancelled' | 'read_failed',
  ) {
    super(message);
    this.name = 'AttachmentFileError';
  }
}

export async function readUriAsBase64(uri: string): Promise<{ content: string; size: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  const size =
    info.exists && 'size' in info && typeof (info as { size?: number }).size === 'number'
      ? (info as { size: number }).size
      : 0;
  if (size > MAX_WEBCHAT_ATTACHMENT_FILE_BYTES) {
    throw new AttachmentFileError('File too large', 'too_large');
  }
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const resolvedSize = size || Math.ceil((content.replace(/\s/g, '').length * 3) / 4);
  if (resolvedSize > MAX_WEBCHAT_ATTACHMENT_FILE_BYTES) {
    throw new AttachmentFileError('File too large', 'too_large');
  }
  return { content, size: resolvedSize };
}

async function loadFromUri(uri: string, name: string, mimeType?: string): Promise<ComposerAttachment> {
  const { content, size } = await readUriAsBase64(uri);
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

async function ensureMediaLibraryPermission(): Promise<void> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return;
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!requested.granted) {
    throw new AttachmentFileError('Photo library permission denied', 'permission_denied');
  }
}

export async function pickAttachmentFromSource(source: AttachmentPickSource): Promise<ComposerAttachment | null> {
  if (source === 'camera') {
    await ensureCameraPermission();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.92,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]?.uri) return null;
    const asset = result.assets[0];
    const name = asset.fileName || `photo-${Date.now()}.jpg`;
    return loadFromUri(asset.uri, name, asset.mimeType ?? 'image/jpeg');
  }

  if (source === 'photos') {
    await ensureMediaLibraryPermission();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.92,
      allowsEditing: true,
    });
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
