import { memo, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { ComposerAttachment } from './composer.types';
import { FilePreviewModal, type PreviewableFile } from './FilePreviewModal';

function attachmentToPreviewable(att: ComposerAttachment): PreviewableFile {
  return {
    name: att.name,
    mimeType: att.mimeType,
    contentBase64: att.content,
  };
}

function thumbnailUri(att: ComposerAttachment): string | null {
  if (att.localUri) return att.localUri;
  if (att.type === 'image' && att.content) {
    return `data:${att.mimeType};base64,${att.content}`;
  }
  return null;
}

export const ComposerAttachmentStrip = memo(function ComposerAttachmentStrip({
  attachments,
  onRemove,
  removeLabel,
  readOnly = false,
}: {
  attachments: ComposerAttachment[];
  onRemove: (index: number) => void;
  removeLabel: string;
  readOnly?: boolean;
}) {
  const scheme = useColorScheme();
  const [preview, setPreview] = useState<PreviewableFile | null>(null);
  const border = scheme === 'dark' ? '#3A3A3C' : '#E5E5EA';
  const chipBg = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
  const muted = scheme === 'dark' ? '#8E8E93' : '#6D6D70';

  const items = useMemo(() => attachments.filter(Boolean), [attachments]);
  if (!items.length) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((att, index) => {
          const uri = thumbnailUri(att);
          return (
            <View key={att.id} style={[styles.tileWrap, { borderColor: border }]}>
              <Pressable
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                onPress={() => setPreview(attachmentToPreviewable(att))}
                accessibilityRole="button"
                accessibilityLabel={att.name}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.docTile, { backgroundColor: chipBg }]}>
                    <Icon source="file-outline" size={28} color={muted} />
                    <Text style={[styles.docName, { color: muted }]} numberOfLines={2}>
                      {att.name}
                    </Text>
                  </View>
                )}
              </Pressable>
              {!readOnly ? (
                <Pressable
                  style={styles.removeHit}
                  onPress={() => onRemove(index)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={removeLabel}
                >
                  <View style={styles.removeBadge}>
                    <Icon source="close" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <FilePreviewModal visible={Boolean(preview)} file={preview} onClose={() => setPreview(null)} />
    </>
  );
});

const TILE = 72;

const styles = StyleSheet.create({
  scroll: {
    maxHeight: TILE + 16,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  tileWrap: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  tile: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  docTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 4,
  },
  docName: {
    fontSize: 10,
    textAlign: 'center',
  },
  removeHit: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 2,
  },
  removeBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
