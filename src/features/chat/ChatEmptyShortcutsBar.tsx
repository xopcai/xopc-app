/**
 * Goal shortcut chip above the composer on empty chat sessions.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { EMPTY_CHAT_GOAL_SHORTCUT } from './chat-empty-shortcuts';

export const ChatEmptyShortcutsBar = memo(function ChatEmptyShortcutsBar({
  disabled,
  onPressGoal,
}: {
  disabled?: boolean;
  onPressGoal: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const label = m.chat.emptyShortcuts.goal;

  const border = isDark ? 'rgba(180,180,190,0.35)' : 'rgba(120,120,128,0.35)';
  const chipBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#E5E5EA' : '#1C1C1E';

  return (
    <View style={styles.wrap}>
      <Pressable
        disabled={disabled}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: border, backgroundColor: chipBg, opacity: disabled ? 0.45 : 1 },
          pressed && !disabled && { opacity: 0.88, backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7' },
        ]}
        onPress={onPressGoal}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Icon source={EMPTY_CHAT_GOAL_SHORTCUT.icon} size={16} color={textColor} />
        <Text variant="labelMedium" style={[styles.chipLabel, { color: textColor }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontWeight: '500',
  },
});
