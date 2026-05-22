/**
 * Drawer sidebar gateway connection summary — full active URL, route kind, online status.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';

import { useActiveGatewayDisplay } from './use-active-gateway-display';
import { useGatewayHealth } from './use-gateway-health';
import { connectionKindLabel, useGatewayConnectionView } from './use-gateway-connection-view';

export const DrawerGatewayConnection = memo(function DrawerGatewayConnection({
  onPress,
}: {
  onPress?: () => void;
}) {
  const isDark = useResolvedIsDark();
  const m = useMessages();
  const g = m.gateway;
  const gatewayDisplay = useActiveGatewayDisplay();
  const connectionView = useGatewayConnectionView();
  const { gatewayOnline } = useGatewayHealth();

  const text = isDark ? '#F5F5F7' : '#1C1C1E';
  const muted = isDark ? '#8E8E93' : '#6D6D70';
  const onlineColor = gatewayOnline ? '#34C759' : '#FF453A';

  if (!gatewayDisplay.configured) {
    return (
      <Pressable
        style={styles.wrap}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        <Text style={[styles.address, { color: muted }]} numberOfLines={2}>
          {m.sessions.gatewayNotConfigured}
        </Text>
      </Pressable>
    );
  }

  const address =
    connectionView.activeUrl ||
    connectionView.tunnelUrl ||
    connectionView.lanUrl ||
    gatewayDisplay.subtitle;

  const routeLabel = connectionKindLabel(connectionView.connectionKind, g);
  const statusLabel = gatewayOnline ? m.chat.gatewayStatusOnline : m.chat.gatewayStatusOffline;

  return (
    <Pressable
      style={styles.wrap}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={[styles.address, { color: text }]} selectable numberOfLines={2}>
        {address}
      </Text>
      <View style={styles.metaRow}>
        <View style={[styles.statusDot, { backgroundColor: onlineColor }]} />
        <Text style={[styles.meta, { color: muted }]} numberOfLines={1}>
          {routeLabel} · {statusLabel}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    marginBottom: 12,
    gap: 4,
  },
  address: {
    fontSize: 12,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});
