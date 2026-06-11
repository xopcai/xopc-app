import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../theme';

interface BottomCommandBarProps {
  bottomInset: number;
  onSearch: () => void;
  onAskAi: () => void;
  onCreate: () => void;
}

export function BottomCommandBar({ bottomInset, onSearch, onAskAi, onCreate }: BottomCommandBarProps) {
  const { colors, isDark } = useTheme();
  const pillBg = isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF';
  const iconButtonBg = isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <Pressable style={[styles.iconButton, { backgroundColor: iconButtonBg, borderColor }]} onPress={onSearch}>
        <Icon source="magnify" size={22} color={colors.text.secondary} />
      </Pressable>

      <Pressable style={[styles.aiPill, { backgroundColor: pillBg, borderColor }]} onPress={onAskAi}>
        <Icon source="creation-outline" size={18} color="#6D5DFB" />
        <Text style={[styles.aiText, { color: colors.text.tertiary }]} numberOfLines={1}>问 AI</Text>
      </Pressable>

      <Pressable style={[styles.iconButton, { backgroundColor: iconButtonBg, borderColor }]} onPress={onCreate}>
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
    bottom: 0,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  aiPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  aiText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
