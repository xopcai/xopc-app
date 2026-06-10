/**
 * SwipeHintBanner — lightweight hint banner showing swipe discoverability.
 *
 * Displays a short message like "Swipe left to archive" at the top of a
 * list screen. Auto-dismisses after the user has seen it once (stored via MMKV).
 */

import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../i18n/messages';
import { useTheme } from '../theme';

export type SwipeHintBannerProps = {
  /** MMKV key to track whether the user has seen this hint. */
  seenKey: string;
  /** Whether the user has already seen this hint (from MMKV). */
  hasSeen: boolean;
  /** Callback to mark the hint as seen (writes to MMKV). */
  onMarkSeen: () => void;
};

export const SwipeHintBanner = memo(function SwipeHintBanner({
  seenKey,
  hasSeen,
  onMarkSeen,
}: SwipeHintBannerProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const li = m.listInteraction;

  if (hasSeen) return null;

  return (
    <Pressable
      onPress={onMarkSeen}
      accessibilityRole="button"
      accessibilityLabel={li.swipeHintGeneric}
      testID={`swipe-hint-${seenKey}`}
    >
      <View style={[styles.banner, { backgroundColor: colors.accent.selectionBg }]}>
        <Icon source="gesture-swipe-left" size={16} color={colors.accent.primary} />
        <Text style={[styles.text, { color: colors.accent.primary }]}>
          {li.swipeHintArchive}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
});
