import { memo } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { FollowUpSuggestionDisplay } from './follow-up-anchor';
import { useMessages } from '../../i18n/messages';

export const ChatFollowUpChips = memo(function ChatFollowUpChips({
  suggestions,
  disabled,
  onPick,
}: {
  suggestions: FollowUpSuggestionDisplay[];
  disabled?: boolean;
  onPick: (id: FollowUpSuggestionDisplay['id']) => void;
}) {
  const m = useMessages();
  const isDark = useColorScheme() === 'dark';
  const pillText = isDark ? '#F5F5F7' : '#1C1C1E';
  const borderColor = isDark ? 'rgba(180,180,190,0.35)' : 'rgba(120,120,128,0.35)';
  const chipBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const chipBgPressed = isDark ? '#2C2C2E' : '#F5F5F7';

  if (suggestions.length === 0) return null;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="list"
      accessibilityLabel={m.chat.followUpSuggestionsAria}
    >
      {suggestions.map((item) => (
        <Pressable
          key={item.id}
          disabled={disabled}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor,
              backgroundColor: pressed && !disabled ? chipBgPressed : chipBg,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
          onPress={() => onPick(item.id)}
        >
          <Text style={[styles.chipText, { color: pillText }]} numberOfLines={3}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    width: '92%',
    maxWidth: '92%',
    marginTop: -4,
    marginBottom: 8,
    gap: 8,
  },
  chip: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  chipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left',
  },
});
