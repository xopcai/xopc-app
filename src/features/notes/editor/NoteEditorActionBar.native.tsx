import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { radii, spacing, useTheme } from '../../../theme';

export type NativeEditorAction = {
  key: string;
  label: string;
  icon: string;
  featured?: boolean;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export const NoteEditorActionBar = memo(function NoteEditorActionBar({
  actions,
}: {
  actions: NativeEditorAction[];
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.toolbar,
        {
          backgroundColor: isDark ? colors.surface.panel : colors.surface.base,
          borderColor: colors.border.default,
          shadowColor: colors.text.primary,
        },
      ]}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbarContent}
      >
        {actions.map((action) => {
          const selected = action.featured || action.active;
          return (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                styles.toolButton,
                {
                  backgroundColor: selected ? colors.accent.selectionBg : colors.surface.input,
                  borderColor: selected ? colors.accent.primary : colors.border.default,
                  opacity: action.disabled ? 0.42 : pressed ? 0.68 : 1,
                },
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={4}
            >
              <Icon
                source={action.icon}
                size={19}
                color={selected ? colors.accent.primary : colors.text.secondary}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    marginHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  toolbarContent: {
    minHeight: 48,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
