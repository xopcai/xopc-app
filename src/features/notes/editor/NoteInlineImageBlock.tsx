import { memo, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { FilePreviewModal, type PreviewableFile } from '../../chat/FilePreviewModal';
import { useMessages } from '../../../i18n/messages';
import { useGatewayStore } from '../../../stores/gateway-store';
import { useTheme } from '../../../theme';
import type { ImageNoteBlock } from '../note-blocks';

const IMAGE_MAX_HEIGHT = 280;

function imagePreviewFile(block: ImageNoteBlock): PreviewableFile {
  const name = block.alt?.trim() || 'image.jpg';
  if (block.src.startsWith('data:')) {
    const match = block.src.match(/^data:([^;]+);base64,(.+)$/);
    return {
      name,
      mimeType: match?.[1] ?? 'image/jpeg',
      contentBase64: match?.[2],
    };
  }
  return {
    name,
    mimeType: 'image/jpeg',
    remoteUri: block.src,
  };
}

function imageSource(block: ImageNoteBlock, authHeaders?: Record<string, string>) {
  if (block.src.startsWith('data:') || block.src.startsWith('file:')) {
    return { uri: block.src };
  }
  if (block.src.startsWith('http://') || block.src.startsWith('https://')) {
    return { uri: block.src, headers: authHeaders };
  }
  return { uri: block.src };
}

export const NoteInlineImageBlock = memo(function NoteInlineImageBlock({
  block,
  editable,
  onRemove,
  onContinueBelow,
}: {
  block: ImageNoteBlock;
  editable: boolean;
  onRemove?: () => void;
  onContinueBelow?: () => void;
}) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;
  const token = useGatewayStore((s) => s.token);
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );
  const previewFile = useMemo(() => imagePreviewFile(block), [block]);
  const source = useMemo(() => imageSource(block, authHeaders), [authHeaders, block]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setPreviewOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={pm.editorImageTapToPreview}
        style={[
          styles.imageFrame,
          {
            backgroundColor: colors.surface.input,
            borderColor: colors.border.subtle,
            maxHeight: expanded ? undefined : IMAGE_MAX_HEIGHT,
          },
        ]}
      >
        <Image
          source={source}
          style={[styles.image, expanded ? styles.imageExpanded : styles.imageCollapsed]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        {!expanded ? (
          <Pressable
            style={[styles.expandBtn, { backgroundColor: colors.surface.panel }]}
            onPress={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={pm.editorImageExpand}
          >
            <Icon source="unfold-more-horizontal" size={16} color={colors.text.secondary} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.expandBtn, { backgroundColor: colors.surface.panel }]}
            onPress={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={pm.editorImageCollapse}
          >
            <Icon source="unfold-less-horizontal" size={16} color={colors.text.secondary} />
          </Pressable>
        )}
      </Pressable>

      {block.alt?.trim() ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]} numberOfLines={2}>
          {block.alt.trim()}
        </Text>
      ) : null}

      {editable ? (
        <View style={styles.editRow}>
          <Pressable
            style={styles.editAction}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={pm.editorImageRemove}
          >
            <Icon source="delete-outline" size={18} color={colors.text.secondary} />
            <Text style={[styles.editActionText, { color: colors.text.secondary }]}>
              {pm.editorImageRemove}
            </Text>
          </Pressable>
          <Pressable
            style={styles.editAction}
            onPress={onContinueBelow}
            accessibilityRole="button"
            accessibilityLabel={pm.editorContinueBelow}
          >
            <Icon source="format-text" size={18} color={colors.accent.primary} />
            <Text style={[styles.editActionText, { color: colors.accent.primary }]}>
              {pm.editorContinueBelow}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FilePreviewModal
        visible={previewOpen}
        file={previewFile}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 8,
  },
  imageFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
  },
  imageCollapsed: {
    minHeight: 120,
    maxHeight: IMAGE_MAX_HEIGHT,
  },
  imageExpanded: {
    minHeight: 120,
  },
  expandBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontSize: 13,
    marginTop: 6,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingVertical: 4,
  },
  editActionText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
