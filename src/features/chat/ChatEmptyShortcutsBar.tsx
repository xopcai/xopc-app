/**
 * Horizontal shortcut chips above the composer on empty chat sessions.
 */
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { EMPTY_CHAT_SHORTCUTS, type EmptyChatShortcutId } from './chat-empty-shortcuts';

export const ChatEmptyShortcutsBar = memo(function ChatEmptyShortcutsBar({
  disabled,
  onPressShortcut,
}: {
  disabled?: boolean;
  onPressShortcut: (id: EmptyChatShortcutId) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const labels = m.chat.emptyShortcuts;

  const border = isDark ? 'rgba(180,180,190,0.35)' : 'rgba(120,120,128,0.35)';
  const chipBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#E5E5EA' : '#1C1C1E';

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {EMPTY_CHAT_SHORTCUTS.map((def) => (
          <Pressable
            key={def.id}
            disabled={disabled}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: border, backgroundColor: chipBg, opacity: disabled ? 0.45 : 1 },
              pressed && !disabled && { opacity: 0.88, backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7' },
            ]}
            onPress={() => onPressShortcut(def.id)}
            accessibilityRole="button"
            accessibilityLabel={labels[def.labelKey]}
          >
            <Icon source={def.icon} size={16} color={textColor} />
            <Text variant="labelMedium" style={[styles.chipLabel, { color: textColor }]}>
              {labels[def.labelKey]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
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
