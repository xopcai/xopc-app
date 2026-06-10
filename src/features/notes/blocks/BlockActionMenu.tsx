import { memo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../theme';

export type BlockActionMenuItem = {
  key: string;
  icon: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export const BlockActionMenu = memo(function BlockActionMenu({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: BlockActionMenuItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
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
          <Text style={[styles.title, { color: colors.text.tertiary }]}>{title}</Text>
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              disabled={item.disabled}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle },
                pressed && !item.disabled && { backgroundColor: colors.surface.hover },
                item.disabled && { opacity: 0.45 },
              ]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Icon
                source={item.icon}
                size={21}
                color={item.destructive ? colors.semantic.error : colors.text.primary}
              />
              <Text
                style={[
                  styles.label,
                  { color: item.destructive ? colors.semantic.error : colors.text.primary },
                ]}
              >
                {item.label}
              </Text>
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
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});
