import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatingBottomPadding, radii, spacing, typography, useTheme } from '../theme';

export type OverflowMenuItem = {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type ListOverflowMenuProps = {
  items: OverflowMenuItem[];
  accessibilityLabel: string;
};

export function ListOverflowMenu({ items, accessibilityLabel }: ListOverflowMenuProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const triggerBg = colors.surface.input;

  const close = useCallback(() => setVisible(false), []);

  const handleItemPress = useCallback((item: OverflowMenuItem) => {
    close();
    item.onPress();
  }, [close]);

  if (items.length === 0) return null;

  return (
    <>
      <Pressable
        style={[styles.trigger, { backgroundColor: triggerBg }]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon source="dots-vertical" size={22} color={colors.text.secondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay.scrim }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        />
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface.panel,
              paddingBottom: floatingBottomPadding(insets.bottom),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border.strong }]} />
          <View style={styles.actionsRow}>
            {items.map((item) => {
              const iconColor = item.destructive
                ? colors.semantic.error
                : colors.text.secondary;
              const labelColor = item.destructive
                ? colors.semantic.error
                : colors.text.tertiary;
              const tileBg = isDark ? colors.surface.input : colors.surface.hover;

              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.action,
                    (item.disabled || pressed) && styles.actionPressed,
                    item.disabled && styles.actionDisabled,
                  ]}
                  onPress={() => handleItemPress(item)}
                  disabled={item.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={[styles.iconTile, { backgroundColor: tileBg }]}>
                    <Icon source={item.icon} size={22} color={iconColor} />
                  </View>
                  <Text numberOfLines={2} style={[styles.label, { color: labelColor }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: spacing.xxs,
    marginBottom: spacing.lg,
    opacity: 0.7,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: spacing.xl,
    paddingBottom: spacing.sm,
  },
  action: {
    alignItems: 'center',
    width: 72,
    gap: spacing.sm,
  },
  actionPressed: {
    opacity: 0.75,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.caption,
    fontWeight: '500',
    textAlign: 'center',
  },
});
