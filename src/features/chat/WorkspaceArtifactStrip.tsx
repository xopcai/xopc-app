import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useGatewayStore } from '../../stores/gateway-store';
import { FilePreviewModal, type PreviewableFile } from './FilePreviewModal';
import type { ExtractedFilePath } from './tool-result-file-paths';
import { isImageMimeType } from './tool-result-file-paths';
import { resolveWorkspaceAbsoluteToRelative } from './workspace-api';

type VisiblePath = ExtractedFilePath & { rel: string };

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
  };
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
  const [resolved, setResolved] = useState<VisiblePath[] | null>(null);
  const [active, setActive] = useState<PreviewableFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!paths.length) {
      setResolved([]);
      return;
    }
    setResolved(null);
    void (async () => {
      const next: VisiblePath[] = [];
      for (const p of paths) {
        if (p.workspaceRelativePath) {
          next.push({ ...p, rel: normalizeRel(p.workspaceRelativePath) });
          continue;
        }
        const rel = await resolveWorkspaceAbsoluteToRelative(p.absolutePath, { sessionKey });
        if (rel) next.push({ ...p, rel: normalizeRel(rel) });
      }
      if (!cancelled) setResolved(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [paths, sessionKey]);

  const visible = resolved ?? [];
  const imagePaths = useMemo(() => visible.filter((p) => isImageMimeType(p.mimeType)), [visible]);
  const otherPaths = useMemo(() => visible.filter((p) => !isImageMimeType(p.mimeType)), [visible]);

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
  pressed: {
    opacity: 0.72,
  },
});
