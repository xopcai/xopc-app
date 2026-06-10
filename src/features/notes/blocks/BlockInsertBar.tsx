import { Fragment, memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../../theme';

export interface BlockInsertAction {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  groupLabel?: string;
}

export interface BlockInsertBarProps {
  actions: BlockInsertAction[];
  disabled?: boolean;
}

export const BlockInsertBar = memo(function BlockInsertBar({
  actions,
  disabled = false,
}: BlockInsertBarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.bar, { borderTopColor: colors.border.subtle, backgroundColor: colors.surface.base }]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scroll}
      >
        {actions.map((action, index) => {
          const showGroup = Boolean(action.groupLabel && action.groupLabel !== actions[index - 1]?.groupLabel);
          return (
            <Fragment key={action.key}>
              {showGroup ? (
                <Text style={[styles.groupLabel, { color: colors.text.tertiary }]} accessibilityElementsHidden importantForAccessibility="no">
                  {action.groupLabel}
                </Text>
              ) : null}
              <Pressable
                disabled={disabled || action.disabled}
                onPress={action.onPress}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: pressed && !(disabled || action.disabled) ? colors.surface.hover : colors.surface.panel,
                    borderColor: colors.border.default,
                    opacity: disabled || action.disabled ? 0.45 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.groupLabel ? `${action.groupLabel}: ${action.label}` : action.label}
                accessibilityState={{ disabled: Boolean(disabled || action.disabled) }}
              >
                <Icon source={action.icon} size={18} color={colors.text.primary} />
              </Pressable>
            </Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
  },
  groupLabel: {
    marginLeft: 4,
    marginRight: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
