import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { ListOverflowMenu, type OverflowMenuItem } from './ListOverflowMenu';
import { XopcLogo } from './XopcLogo';

type FloatingHeaderAction = {
  icon: string;
  onPress: () => void;
};

interface FloatingHeaderProps {
  title?: string;
  showLogo?: boolean;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightActions?: FloatingHeaderAction[];
  overflowMenuItems?: OverflowMenuItem[];
  overflowMenuA11yLabel?: string;
  searchPlaceholder?: string;
  onSearchPress?: () => void;
}

export function FloatingHeader({
  title,
  showLogo,
  onBack,
  rightIcon,
  onRightPress,
  rightActions,
  overflowMenuItems,
  overflowMenuA11yLabel,
  searchPlaceholder,
  onSearchPress,
}: FloatingHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const backgroundColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.05)';
  const actions = rightActions ?? (rightIcon && onRightPress ? [{ icon: rightIcon, onPress: onRightPress }] : []);
  const hasOverflowMenu = (overflowMenuItems?.length ?? 0) > 0;
  const showRightCluster = actions.length > 0 || hasOverflowMenu;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable style={[styles.iconButton, { backgroundColor }]} onPress={onBack}>
          <Icon source="chevron-left" size={24} color={colors.text.secondary} />
        </Pressable>
      ) : showLogo ? (
        <View style={[styles.iconButton, styles.logoButton, { backgroundColor }]}>
          <XopcLogo size={32} />
        </View>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      {onSearchPress ? (
        <Pressable
          style={[styles.titlePill, styles.searchPill, { backgroundColor }]}
          onPress={onSearchPress}
          accessibilityRole="search"
          accessibilityLabel={searchPlaceholder ?? '搜索'}
        >
          <Icon source="magnify" size={20} color={colors.text.tertiary} />
          <Text numberOfLines={1} style={[styles.searchPlaceholder, { color: colors.text.tertiary }]}>
            {searchPlaceholder ?? '搜索'}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.titlePill, { backgroundColor }]}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
        </View>
      )}

      {showRightCluster ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable key={action.icon} style={[styles.iconButton, { backgroundColor }]} onPress={action.onPress}>
              <Icon source={action.icon} size={22} color={colors.text.secondary} />
            </Pressable>
          ))}
          {hasOverflowMenu ? (
            <ListOverflowMenu
              items={overflowMenuItems ?? []}
              accessibilityLabel={overflowMenuA11yLabel ?? 'More'}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoButton: {
    overflow: 'hidden',
    padding: 0,
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
  },
  titlePill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchPill: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
