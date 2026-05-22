import { memo } from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Icon, Text } from 'react-native-paper';

type GatewayUnreachableTipProps = {
  message: string;
  onPress: () => void;
};

export const GatewayUnreachableTip = memo(function GatewayUnreachableTip({
  message,
  onPress,
}: GatewayUnreachableTipProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <Pressable
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? 'rgba(255, 69, 58, 0.12)' : '#FEF2F2',
          borderColor: isDark ? 'rgba(255, 69, 58, 0.28)' : '#FECACA',
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Icon source="wifi-off" size={16} color={isDark ? '#FF6961' : '#DC2626'} />
      <Text style={[styles.message, { color: isDark ? '#FF6961' : '#991B1B' }]} numberOfLines={3}>
        {message}
      </Text>
      <Icon source="chevron-right" size={18} color={isDark ? '#FF6961' : '#DC2626'} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
