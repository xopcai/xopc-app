import { memo } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

type GatewayOfflineBannerProps = {
  visible: boolean;
};

export const GatewayOfflineBanner = memo(function GatewayOfflineBanner({
  visible,
}: GatewayOfflineBannerProps) {
  const m = useMessages();
  const isDark = useColorScheme() === 'dark';
  if (!visible) return null;
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
          borderBottomColor: isDark ? 'rgba(245, 158, 11, 0.24)' : '#FDE68A',
        },
      ]}
    >
      <Icon source="cloud-off-outline" size={16} color={isDark ? '#FCD34D' : '#D97706'} />
      <Text style={[styles.message, { color: isDark ? '#FDE68A' : '#92400E' }]} numberOfLines={2}>
        {m.gateway.offlineBanner}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
