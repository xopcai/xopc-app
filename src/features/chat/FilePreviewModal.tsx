import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ShareAutoRequest } from '../../api/share';
import { t, useMessages } from '../../i18n/messages';
import { useGatewayStore } from '../../stores/gateway-store';
import { useTheme } from '../../theme';
import { ShareSheet } from '../share/ShareSheet';
import { prefetchShare } from '../share/share-prefetch';
import { useCreateShare } from '../../query/shares';
import { HtmlPreviewPane } from './HtmlPreviewPane';
import { isHtmlFile } from './html-preview-source';
import { MarkdownView } from './MarkdownView';
import { mimeTypeFromFileName } from './tool-result-file-paths';
import { readWorkspaceFile, readWorkspaceFileBase64 } from './workspace-api';

export type PreviewableFile = {
  name: string;
  mimeType?: string;
  /** Base64 binary payload, without data URI prefix. */
  contentBase64?: string;
  /** Plain text payload. */
  textContent?: string;
  /** Workspace-relative path to load on demand. */
  workspaceRelativePath?: string;
  /** Remote HTTP(S) URI to load on demand (e.g. gateway inbound file). */
  remoteUri?: string;
  /** Gateway host absolute path, only for display/copy on mobile. */
  absolutePath?: string;
  /** Optional extracted text fallback for documents. */
  extractedText?: string;
};

export type FilePreviewModalProps = {
  visible: boolean;
  file: PreviewableFile | null;
  sessionKey?: string | null;
  agentId?: string | null;
  onClose: () => void;
};

type PreviewKind = 'image' | 'markdown' | 'html' | 'text' | 'binary';

type LoadedPreview = {
  kind: PreviewKind;
  mimeType: string;
  text: string | null;
  base64: string | null;
  absolutePath?: string;
  workspaceRelativePath?: string;
};

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function fileName(pathOrName: string): string {
  const parts = pathOrName.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? pathOrName;
}

function isImageFile(name: string, mimeType: string): boolean {
  const ext = extensionOf(name);
  return mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

function isMarkdownFile(name: string, mimeType: string): boolean {
  const ext = extensionOf(name);
  return ext === 'md' || ext === 'markdown' || mimeType === 'text/markdown';
}

function isTextFile(name: string, mimeType: string): boolean {
  if (isHtmlFile(name, mimeType)) return false;
  const ext = extensionOf(name);
  if (mimeType.startsWith('text/')) return true;
  return ['txt', 'json', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'xml', 'csv'].includes(ext);
}

function normalizeBase64Payload(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const m = value.match(/^data:[^;]+;base64,([\s\S]+)$/i);
  return (m?.[1] ?? value).replace(/\s/g, '');
}

function dataUri(mimeType: string, base64: string): string {
  return `data:${mimeType || 'application/octet-stream'};base64,${base64}`;
}

async function loadPreview(
  file: PreviewableFile,
  sessionKey?: string | null,
  agentId?: string | null,
): Promise<LoadedPreview> {
  const name = file.name || fileName(file.workspaceRelativePath ?? 'preview');
  const mimeType = file.mimeType || mimeTypeFromFileName(name);
  const absolutePath = file.absolutePath;
  const kind: PreviewKind = isImageFile(name, mimeType)
    ? 'image'
    : isMarkdownFile(name, mimeType)
      ? 'markdown'
      : isHtmlFile(name, mimeType)
        ? 'html'
        : isTextFile(name, mimeType)
          ? 'text'
          : 'binary';

  if (kind === 'image') {
    const direct = normalizeBase64Payload(file.contentBase64);
    if (direct) return { kind, mimeType, text: null, base64: direct, absolutePath };
    if (file.remoteUri) {
      const token = useGatewayStore.getState().token;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await fetch(file.remoteUri, headers ? { headers } : undefined);
      if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      return { kind, mimeType, text: null, base64: globalThis.btoa(binary), absolutePath };
    }
    if (file.workspaceRelativePath) {
      const loaded = await readWorkspaceFileBase64(file.workspaceRelativePath, { sessionKey, agentId });
      return { kind, mimeType, text: null, base64: loaded.contentBase64, absolutePath: loaded.absolutePath ?? absolutePath };
    }
    return { kind, mimeType, text: null, base64: null, absolutePath };
  }

  if (kind === 'html') {
    if (file.workspaceRelativePath) {
      return {
        kind,
        mimeType,
        text: null,
        base64: null,
        absolutePath,
        workspaceRelativePath: file.workspaceRelativePath,
      };
    }
    if (file.textContent != null) {
      return { kind, mimeType, text: file.textContent, base64: null, absolutePath };
    }
    const fromBase64 = normalizeBase64Payload(file.contentBase64);
    if (fromBase64) {
      try {
        return { kind, mimeType, text: globalThis.atob(fromBase64), base64: null, absolutePath };
      } catch {
        return { kind, mimeType, text: null, base64: null, absolutePath };
      }
    }
  }

  if (kind === 'markdown' || kind === 'text') {
    if (file.textContent != null) {
      return { kind, mimeType, text: file.textContent, base64: null, absolutePath };
    }
    if (file.workspaceRelativePath) {
      const loaded = await readWorkspaceFile(file.workspaceRelativePath, { sessionKey, agentId });
      return { kind, mimeType, text: loaded.content, base64: null, absolutePath: loaded.absolutePath ?? absolutePath };
    }
    const fromBase64 = normalizeBase64Payload(file.contentBase64);
    if (fromBase64) {
      try {
        return { kind, mimeType, text: globalThis.atob(fromBase64), base64: null, absolutePath };
      } catch {
        return { kind, mimeType, text: null, base64: null, absolutePath };
      }
    }
  }

  return {
    kind: 'binary',
    mimeType,
    text: file.extractedText ?? null,
    base64: normalizeBase64Payload(file.contentBase64),
    absolutePath,
  };
}

function buildShareRequestForFile(
  file: PreviewableFile,
  sessionKey?: string | null,
  agentId?: string | null,
): ShareAutoRequest | null {
  const rel = file.workspaceRelativePath?.trim();
  if (!rel) return null;
  return {
    path: rel.replace(/\\/g, '/').replace(/^\/+/, ''),
    audience: 'friend',
    ...(sessionKey?.trim() ? { sessionKey: sessionKey.trim() } : {}),
    ...(!sessionKey?.trim() && agentId?.trim() ? { agentId: agentId.trim() } : {}),
  };
}

function buildDownloadUrlForFile(
  file: PreviewableFile,
): string | null {
  return file.remoteUri ?? null;
}

export function FilePreviewModal({ visible, file, sessionKey, agentId, onClose }: FilePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const m = useMessages();
  const cm = m.chat;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareAutoRequest | null>(null);
  const createDownloadShare = useCreateShare();

  const title = useMemo(() => (file ? file.name || fileName(file.workspaceRelativePath ?? 'Preview') : ''), [file]);
  const shareRequest = useMemo(
    () => (file ? buildShareRequestForFile(file, sessionKey, agentId) : null),
    [agentId, file, sessionKey],
  );

  // Warm the share cache the moment the preview opens — by the time the user
  // taps the share button, the link is likely already created.
  useEffect(() => {
    if (!visible || !shareRequest) return;
    prefetchShare(shareRequest);
  }, [visible, shareRequest]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoaded(null);
    if (!visible || !file) return;
    setLoading(true);
    void loadPreview(file, sessionKey, agentId)
      .then((next) => {
        if (!cancelled) setLoaded(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, file, sessionKey, visible]);

  const canDownload = Boolean(file?.workspaceRelativePath || file?.remoteUri);
  const downloadFile = () => {
    if (!file) return;
    const remoteUrl = buildDownloadUrlForFile(file);
    if (remoteUrl) {
      void Linking.openURL(remoteUrl);
      return;
    }
    if (shareRequest) {
      void createDownloadShare.mutateAsync(shareRequest)
        .then((payload) => Linking.openURL(payload.share.lanUrl ?? payload.share.shareUrl))
        .catch(() => undefined);
    }
  };

  const surface = colors.surface.base;
  const textColor = colors.text.primary;
  const muted = colors.text.secondary;
  const border = colors.border.default;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: surface, paddingTop: insets.top }]}> 
        <View style={[styles.header, { borderBottomColor: border }]}> 
          <Text variant="titleMedium" numberOfLines={1} style={[styles.title, { color: textColor }]}> 
            {title}
          </Text>
          {canDownload ? (
            <IconButton
              icon="download-outline"
              size={20}
              iconColor={textColor}
              onPress={downloadFile}
              accessibilityLabel={m.chat.filePreviewDownload}
              disabled={createDownloadShare.isPending}
            />
          ) : null}
          {shareRequest ? (
            <IconButton
              icon="share-variant"
              size={20}
              iconColor={textColor}
              onPress={() => setShareTarget(shareRequest)}
              accessibilityLabel={m.chat.shareFile}
            />
          ) : null}
          <IconButton icon="close" size={22} iconColor={textColor} onPress={onClose} accessibilityLabel={cm.filePreviewClose} />
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={{ color: muted }}>{cm.filePreviewLoading}</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={[styles.error, { color: colors.semantic.errorBold }]}>
                {t(cm.filePreviewLoadFailed, { message: error })}
              </Text>
            </View>
          ) : loaded?.kind === 'image' && loaded.base64 ? (
            <ScrollView
              contentContainerStyle={styles.imageScroller}
              maximumZoomScale={4}
              minimumZoomScale={1}
              bouncesZoom
            >
              <Image source={{ uri: dataUri(loaded.mimeType, loaded.base64) }} style={styles.image} resizeMode="contain" />
            </ScrollView>
          ) : loaded?.kind === 'markdown' && loaded.text != null ? (
            <ScrollView contentContainerStyle={styles.textContent}>
              <MarkdownView content={loaded.text} />
            </ScrollView>
          ) : loaded?.kind === 'html' ? (
            <HtmlPreviewPane
              workspaceRelativePath={loaded.workspaceRelativePath ?? file?.workspaceRelativePath}
              htmlContent={loaded.text}
              sessionKey={sessionKey}
              agentId={agentId}
              mutedColor={muted}
            />
          ) : loaded?.kind === 'text' && loaded.text != null ? (
            <ScrollView contentContainerStyle={styles.textContent}>
              <Text selectable style={[styles.mono, { color: textColor }]}> 
                {loaded.text}
              </Text>
            </ScrollView>
          ) : loaded?.kind === 'binary' && loaded.text ? (
            <ScrollView contentContainerStyle={styles.textContent}>
              <Text style={[styles.notice, { color: muted }]}>{cm.filePreviewUnsupportedWithText}</Text>
              <Text selectable style={[styles.mono, { color: textColor }]}> 
                {loaded.text}
              </Text>
            </ScrollView>
          ) : (
            <View style={styles.center}>
              <Text style={[styles.notice, { color: muted }]}>{cm.filePreviewUnsupported}</Text>
              <Pressable style={[styles.closeButton, { borderColor: border }]} onPress={onClose} accessibilityRole="button">
                <Text style={{ color: textColor }}>{m.common.close}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
      <ShareSheet
        visible={Boolean(shareTarget)}
        request={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  imageScroller: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  image: {
    width: '100%',
    minHeight: 360,
  },
  textContent: {
    padding: 16,
  },
  mono: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Menlo',
  },
  notice: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  closeButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
});
