import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

interface BottomCommandBarProps {
  bottomInset: number;
  onSearch: () => void;
  onAskAi: () => void;
  onAskAiPressIn?: () => void;
  onCreate: () => void;
}

export function BottomCommandBar({ bottomInset, onSearch, onAskAi, onAskAiPressIn, onCreate }: BottomCommandBarProps) {
  const { colors, isDark } = useTheme();
  const controlBg = isDark ? colors.surface.input : colors.surface.panel;

  return (
    <View style={[styles.wrap, { paddingBottom: floatingBottomPadding(bottomInset) }]}>
      <Pressable style={[styles.iconButton, { backgroundColor: controlBg }]} onPress={onSearch}>
        <Icon source="magnify" size={22} color={colors.text.secondary} />
      </Pressable>

      <Pressable
        style={[styles.aiPill, { backgroundColor: controlBg }]}
        onPress={onAskAi}
        onPressIn={onAskAiPressIn}
      >
        <Icon source="creation-outline" size={18} color="#6D5DFB" />
        <Text style={[styles.aiText, { color: colors.text.tertiary }]} numberOfLines={1}>问 AI</Text>
      </Pressable>

      <Pressable style={[styles.iconButton, { backgroundColor: controlBg }]} onPress={onCreate}>
        <Icon source="square-edit-outline" size={21} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FLOATING_BOTTOM_OFFSET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  aiText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
