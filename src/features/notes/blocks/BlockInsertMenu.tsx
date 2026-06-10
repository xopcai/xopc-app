import { memo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../theme';
import type { AttachmentPickSource } from '../../chat/attachment-file-io';

export type BlockInsertMenuItem = {
  key: string;
  icon: string;
  label: string;
  source: AttachmentPickSource;
};

export const BlockInsertMenu = memo(function BlockInsertMenu({
  visible,
  items,
  onPick,
  onClose,
}: {
  visible: boolean;
  items: BlockInsertMenuItem[];
  onPick: (source: AttachmentPickSource) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (items.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[
            styles.menu,
            {
              backgroundColor: colors.surface.panel,
              borderColor: colors.border.default,
              marginBottom: insets.bottom + 8,
            },
          ]}
        >
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle },
                pressed && { backgroundColor: colors.surface.hover },
              ]}
              onPress={() => {
                onClose();
                onPick(item.source);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Icon source={item.icon} size={22} color={colors.text.primary} />
              <Text style={[styles.label, { color: colors.text.primary }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  menu: {
    marginHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
});
