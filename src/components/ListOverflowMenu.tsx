import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, Menu } from 'react-native-paper';

import { useTheme } from '../theme';

export type OverflowMenuItem = {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type ListOverflowMenuProps = {
  items: OverflowMenuItem[];
  accessibilityLabel: string;
};

export function ListOverflowMenu({ items, accessibilityLabel }: ListOverflowMenuProps) {
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const backgroundColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.05)';

  if (items.length === 0) return null;

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Pressable
          style={[styles.button, { backgroundColor }]}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Icon source="dots-vertical" size={22} color={colors.text.secondary} />
        </Pressable>
      }
    >
      {items.map((item) => (
        <Menu.Item
          key={item.key}
          leadingIcon={item.icon}
          title={item.label}
          disabled={item.disabled}
          onPress={() => {
            setVisible(false);
            item.onPress();
          }}
        />
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
