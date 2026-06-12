import { memo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../../theme';
import type { AttachmentPickSource } from '../../chat/attachment-file-io';

export type EditorInsertMenuItem = {
  key: string;
  icon: string;
  label: string;
  source: AttachmentPickSource;
};

export const EditorInsertMenu = memo(function EditorInsertMenu({
  visible,
  items,
  onPick,
  onClose,
}: {
  visible: boolean;
  items: EditorInsertMenuItem[];
  onPick: (source: AttachmentPickSource) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={styles.anchor}>
        <View style={[styles.menu, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  anchor: {
    position: 'absolute',
    right: 16,
    bottom: 108,
    maxWidth: 220,
  },
  menu: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
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
