import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

interface NoteViewActionBarProps {
  pinned?: boolean;
  labels: {
    share: string;
    pin: string;
    unpin: string;
    delete: string;
    more: string;
  };
  onShare: () => void;
  onPin: () => void;
  onDelete: () => void;
  onMore: () => void;
}

export function NoteViewActionBar({
  pinned = false,
  labels,
  onShare,
  onPin,
  onDelete,
  onMore,
}: NoteViewActionBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const barBg = isDark ? colors.surface.panel : '#FFFFFF';

  const items = [
    { key: 'share', icon: 'share-variant-outline', label: labels.share, onPress: onShare },
    {
      key: 'pin',
      icon: pinned ? 'pin-off' : 'pin-outline',
      label: pinned ? labels.unpin : labels.pin,
      onPress: onPin,
    },
    { key: 'delete', icon: 'delete-outline', label: labels.delete, onPress: onDelete, destructive: true },
    { key: 'more', icon: 'dots-grid', label: labels.more, onPress: onMore },
  ] as const;

  return (
    <View style={[styles.wrap, { paddingBottom: floatingBottomPadding(insets.bottom) }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: barBg,
            borderColor: colors.border.subtle,
            shadowColor: '#000',
          },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={styles.action}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Icon
              source={item.icon}
              size={22}
              color={'destructive' in item && item.destructive ? colors.semantic.error : colors.text.secondary}
            />
            <Text
              style={[
                styles.label,
                {
                  color: 'destructive' in item && item.destructive
                    ? colors.semantic.error
                    : colors.text.tertiary,
                },
              ]}
            >
              {item.label}
            </Text>
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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 52,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
