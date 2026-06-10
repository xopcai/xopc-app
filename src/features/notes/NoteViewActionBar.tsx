import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

interface NoteViewActionBarProps {
  labels: {
    catalyst: string;
    openChat: string;
    more: string;
  };
  loading?: {
    catalyst?: boolean;
    openChat?: boolean;
  };
  onCatalyst: () => void;
  onOpenChat: () => void;
  onMore: () => void;
}

export function NoteViewActionBar({
  labels,
  loading,
  onCatalyst,
  onOpenChat,
  onMore,
}: NoteViewActionBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const barBg = isDark ? colors.surface.panel : '#FFFFFF';
  const iconColor = isDark ? colors.text.secondary : '#8E8E93';
  const labelColor = isDark ? colors.text.tertiary : '#AEAEB2';

  const items = [
    {
      key: 'catalyst',
      icon: loading?.catalyst ? 'loading' : 'creation-outline',
      label: labels.catalyst,
      onPress: onCatalyst,
    },
    {
      key: 'chat',
      icon: loading?.openChat ? 'loading' : 'chat-processing-outline',
      label: labels.openChat,
      onPress: onOpenChat,
    },
    { key: 'more', icon: 'dots-grid', label: labels.more, onPress: onMore },
  ] as const;

  return (
    <View style={[styles.wrap, { paddingBottom: floatingBottomPadding(insets.bottom) }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: barBg,
            shadowColor: '#000',
          },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Icon source={item.icon} size={18} color={iconColor} />
            <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FLOATING_BOTTOM_OFFSET,
    alignItems: 'center',
    paddingTop: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingVertical: 7,
    paddingHorizontal: 8,
    maxWidth: '96%',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 54,
    flexShrink: 1,
  },
  actionPressed: {
    opacity: 0.55,
  },
  label: {
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 13,
  },
});
