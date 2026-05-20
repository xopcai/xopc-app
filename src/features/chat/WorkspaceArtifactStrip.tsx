import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useGatewayStore } from '../../stores/gateway-store';
import { FilePreviewModal, type PreviewableFile } from './FilePreviewModal';
import type { ExtractedFilePath } from './tool-result-file-paths';
import { isImageMimeType } from './tool-result-file-paths';
import { resolveWorkspaceFileReference, type WorkspaceFileReference } from './workspace-api';

type ResolvedArtifact = ExtractedFilePath & { refInfo: WorkspaceFileReference };
type VisiblePath = ResolvedArtifact & { rel: string };

function normalizeRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function rawPath(rel: string, sessionKey?: string | null): string {
  const params = new URLSearchParams({ path: rel });
  const sk = sessionKey?.trim();
  if (sk) params.set('sessionKey', sk);
  return `/api/workspace/editor/raw?${params.toString()}`;
}

function toPreviewable(path: VisiblePath): PreviewableFile {
  return {
    name: path.fileName,
    mimeType: path.mimeType,
    workspaceRelativePath: path.rel,
    absolutePath: path.refInfo.absolutePath,
  };
}

function fileReferenceDescription(refInfo: WorkspaceFileReference, m: ReturnType<typeof useMessages>) {
  if (refInfo.scope === 'missing') return m.chat.fileReferenceMissingDescription;
  if (refInfo.scope === 'invalid') return m.chat.fileReferenceInvalidDescription;
  return m.chat.fileReferenceExternalDescription;
}

function ExternalArtifactCard({
  path,
  refInfo,
  border,
  chipBg,
  textColor,
  muted,
}: {
  path: ExtractedFilePath;
  refInfo: WorkspaceFileReference;
  border: string;
  chipBg: string;
  textColor: string;
  muted: string;
}) {
  const m = useMessages();
  const displayPath = refInfo.absolutePath ?? path.absolutePath;
  const isMissingOrInvalid = refInfo.scope === 'missing' || refInfo.scope === 'invalid';
  const icon = isMissingOrInvalid ? 'alert-circle-outline' : 'file-outline';
  const iconColor = isMissingOrInvalid ? '#F59E0B' : muted;

  const copyPath = () => {
    void Clipboard.setStringAsync(displayPath);
  };

  return (
    <View style={[styles.externalCard, { borderColor: border, backgroundColor: chipBg }]}>
      <View style={styles.externalHeader}>
        <Icon source={icon} size={16} color={iconColor} />
        <Text style={[styles.externalTitle, { color: textColor }]} numberOfLines={1}>
          {path.fileName || refInfo.displayName}
        </Text>
        {refInfo.scope === 'external' ? (
          <Text style={[styles.badge, { color: muted, borderColor: border }]}>
            {m.chat.fileReferenceExternalBadge}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.externalDescription, { color: muted }]}>
        {fileReferenceDescription(refInfo, m)}
      </Text>
      {refInfo.capabilities.includes('copyPath') ? (
        <Pressable
          style={({ pressed }) => [styles.copyButton, { borderColor: border }, pressed && styles.pressed]}
          onPress={copyPath}
          accessibilityRole="button"
          accessibilityLabel={m.chat.fileReferenceCopyPath}
        >
          <Icon source="content-copy" size={14} color={muted} />
          <Text style={[styles.copyText, { color: textColor }]}>{m.chat.fileReferenceCopyPath}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WorkspaceArtifactStrip({
  paths,
  sessionKey,
}: {
  paths: ExtractedFilePath[];
  sessionKey?: string | null;
}) {
  const isDark = useColorScheme() === 'dark';
  const apiUrl = useGatewayStore((s) => s.apiUrl);
  const token = useGatewayStore((s) => s.token);
  const [resolved, setResolved] = useState<ResolvedArtifact[] | null>(null);
  const [active, setActive] = useState<PreviewableFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!paths.length) {
      setResolved([]);
      return;
    }
    setResolved(null);
    void (async () => {
      const next: ResolvedArtifact[] = [];
      for (const p of paths) {
        const refInfo = await resolveWorkspaceFileReference(p.workspaceRelativePath || p.absolutePath, {
          sessionKey,
        });
        if (refInfo) {
          next.push({ ...p, refInfo });
        }
      }
      if (!cancelled) setResolved(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [paths, sessionKey]);

  const visible = resolved ?? [];
  const workspacePaths = useMemo(
    () =>
      visible
        .filter((p) => p.refInfo.scope === 'workspace' && Boolean(p.refInfo.workspaceRelativePath))
        .map((p) => ({ ...p, rel: normalizeRel(p.refInfo.workspaceRelativePath!) })),
    [visible],
  );
  const imagePaths = useMemo(() => workspacePaths.filter((p) => isImageMimeType(p.mimeType)), [workspacePaths]);
  const otherPaths = useMemo(() => workspacePaths.filter((p) => !isImageMimeType(p.mimeType)), [workspacePaths]);
  const nonWorkspacePaths = useMemo(() => visible.filter((p) => p.refInfo.scope !== 'workspace'), [visible]);

  if (!paths.length || resolved === null || visible.length === 0) return null;

  const border = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';
  const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB';
  const textColor = isDark ? '#E5E7EB' : '#374151';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <>
      <View style={styles.wrap}>
        {imagePaths.map((p) => (
          <Pressable
            key={p.absolutePath}
            style={({ pressed }) => [styles.thumb, { borderColor: border }, pressed && styles.pressed]}
            onPress={() => setActive(toPreviewable(p))}
            accessibilityRole="button"
            accessibilityLabel={`预览 ${p.fileName}`}
          >
            <Image
              source={{ uri: apiUrl(rawPath(p.rel, sessionKey)), headers }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
          </Pressable>
        ))}
        {otherPaths.map((p) => (
          <Pressable
            key={p.absolutePath}
            style={({ pressed }) => [styles.chip, { borderColor: border, backgroundColor: chipBg }, pressed && styles.pressed]}
            onPress={() => setActive(toPreviewable(p))}
            accessibilityRole="button"
            accessibilityLabel={`预览 ${p.fileName}`}
          >
            <Icon source="file-outline" size={16} color={muted} />
            <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>{p.fileName}</Text>
            <Icon source="eye-outline" size={14} color={muted} />
          </Pressable>
        ))}
        {nonWorkspacePaths.map((p) => (
          <ExternalArtifactCard
            key={p.absolutePath}
            path={p}
            refInfo={p.refInfo}
            border={border}
            chipBg={chipBg}
            textColor={textColor}
            muted={muted}
          />
        ))}
      </View>
      <FilePreviewModal
        visible={Boolean(active)}
        file={active}
        sessionKey={sessionKey}
        onClose={() => setActive(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumb: {
    width: 80,
    height: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  chip: {
    maxWidth: '100%',
    minHeight: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  externalCard: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  externalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  externalTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  externalDescription: {
    fontSize: 11,
    lineHeight: 16,
  },
  copyButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  copyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
