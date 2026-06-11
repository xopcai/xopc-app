import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

type FloatingHeaderAction = {
  icon: string;
  onPress: () => void;
};

interface FloatingHeaderProps {
  title: string;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightActions?: FloatingHeaderAction[];
}

export function FloatingHeader({ title, onBack, rightIcon, onRightPress, rightActions }: FloatingHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const backgroundColor = isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const actions = rightActions ?? (rightIcon && onRightPress ? [{ icon: rightIcon, onPress: onRightPress }] : []);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable style={[styles.iconButton, { backgroundColor, borderColor }]} onPress={onBack}>
          <Icon source="chevron-left" size={24} color={colors.text.secondary} />
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      <View style={[styles.titlePill, { backgroundColor, borderColor }]}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      </View>

      {actions.length > 0 ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable key={action.icon} style={[styles.iconButton, { backgroundColor, borderColor }]} onPress={action.onPress}>
              <Icon source={action.icon} size={22} color={colors.text.secondary} />
            </Pressable>
          ))}
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
  },
  titlePill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
});
