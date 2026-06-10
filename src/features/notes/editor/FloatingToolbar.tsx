import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { InlineFormat } from './inline-format';
import { useTheme } from '../../../theme';

export interface FloatingToolbarProps {
  visible: boolean;
  activeFormats: Set<InlineFormat>;
  onToggleFormat: (format: InlineFormat) => void;
  onDismiss: () => void;
}

interface ToolbarButton {
  format: InlineFormat;
  icon: string;
  label: string;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { format: 'bold', icon: 'format-bold', label: 'B' },
  { format: 'italic', icon: 'format-italic', label: 'I' },
  { format: 'strikethrough', icon: 'format-strikethrough', label: 'S' },
  { format: 'code', icon: 'code-tags', label: '<>' },
];

export const FloatingToolbar = memo(function FloatingToolbar({
  visible,
  activeFormats,
  onToggleFormat,
  onDismiss,
}: FloatingToolbarProps) {
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <View style={[styles.toolbar, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}>
      {TOOLBAR_BUTTONS.map((button) => {
        const isActive = activeFormats.has(button.format);
        return (
          <Pressable
            key={button.format}
            style={[
              styles.button,
              isActive && { backgroundColor: colors.accent.selectionBg },
            ]}
            onPress={() => onToggleFormat(button.format)}
          >
            <Icon
              source={button.icon}
              size={18}
              color={isActive ? colors.accent.primary : colors.text.primary}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
    alignSelf: 'center',
    marginBottom: 6,

    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  button: {
    width: 36,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
