import { memo } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

export type MessageAction = {
  icon: string;
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
};

export const MessageActionsBar = memo(function MessageActionsBar({
  actions,
  align,
}: {
  actions: MessageAction[];
  align: 'left' | 'right';
}) {
  const isDark = useColorScheme() === 'dark';
  const iconColor = isDark ? '#9CA3AF' : '#6B7280';

  if (actions.length === 0) return null;

  return (
    <View style={[styles.row, align === 'right' ? styles.rowRight : styles.rowLeft]}>
      {actions.map((action) => (
        <Pressable
          key={action.accessibilityLabel}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Icon source={action.icon} size={18} color={iconColor} />
          {action.label ? (
            <Text style={[styles.label, { color: iconColor }]}>{action.label}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  rowLeft: {
    alignSelf: 'flex-start',
  },
  rowRight: {
    alignSelf: 'flex-end',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionPressed: {
    opacity: 0.55,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
});
