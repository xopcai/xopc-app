/**
 * Top-of-screen status bar driven by the connection state machine. Mounted
 * once at root layout; only renders when the state is "interesting" (i.e.
 * anything other than ok-* or unconfigured-with-modal-shown). Surfaces the
 * primary action so the user can recover without diving into settings.
 *
 * On `offline-device` the action opens the OfflineDeviceHelpSheet — a
 * dedicated walk-through covering Mac sleep, computer off, network
 * disconnects, and gateway-app restart, plus a one-tap retry.
 */
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useResolvedIsDark } from '../../lib/stack-screen-theme';

import {
  copyForConnectionState,
  severityForConnectionState,
  useConnectionState,
} from './connection-state';
import { OfflineDeviceHelpSheet } from './OfflineDeviceHelpSheet';
import { runProbeRound } from './probe-coordinator';

export type GlobalConnectionStatusBarProps = {
  onOpenSettings?: () => void;
  onReconnect?: () => void;
};

export const GlobalConnectionStatusBar = memo(function GlobalConnectionStatusBar({
  onOpenSettings,
  onReconnect,
}: GlobalConnectionStatusBarProps) {
  const m = useMessages();
  const isDark = useResolvedIsDark();
  const state = useConnectionState();
  const severity = severityForConnectionState(state);
  const [helpVisible, setHelpVisible] = useState(false);

  const onPrimaryAction = useCallback(() => {
    switch (state.kind) {
      case 'token-invalid':
        onReconnect?.();
        return;
      case 'unconfigured':
        onOpenSettings?.();
        return;
      case 'offline-device':
        // Dedicated walk-through with retry + docs link.
        setHelpVisible(true);
        return;
      case 'degraded-tunnel-only':
      case 'offline-network':
      case 'no-route':
        void runProbeRound('manual', { force: true });
        return;
      default:
        return;
    }
  }, [state.kind, onOpenSettings, onReconnect]);

  if (severity === 'ok' || severity === 'idle') {
    return (
      <OfflineDeviceHelpSheet
        visible={helpVisible}
        onRequestClose={() => setHelpVisible(false)}
      />
    );
  }

  const stateCopy = copyForConnectionState(state, m.gateway.state);

  const palette =
    severity === 'error'
      ? {
          bg: isDark ? 'rgba(255,59,48,0.14)' : '#FEF2F2',
          border: isDark ? 'rgba(255,59,48,0.28)' : '#FECACA',
          fg: isDark ? '#FF6961' : '#991B1B',
          icon: isDark ? '#FF6961' : '#DC2626',
        }
      : severity === 'warn'
        ? {
            bg: isDark ? 'rgba(245,158,11,0.14)' : '#FFFBEB',
            border: isDark ? 'rgba(245,158,11,0.28)' : '#FDE68A',
            fg: isDark ? '#FCD34D' : '#92400E',
            icon: isDark ? '#FCD34D' : '#D97706',
          }
        : {
            bg: isDark ? 'rgba(59,130,246,0.14)' : '#EFF6FF',
            border: isDark ? 'rgba(59,130,246,0.28)' : '#BFDBFE',
            fg: isDark ? '#93C5FD' : '#1E3A8A',
            icon: isDark ? '#93C5FD' : '#2563EB',
          };

  const iconSource =
    severity === 'pending'
      ? null
      : state.kind === 'offline-network'
        ? 'wifi-off'
        : state.kind === 'offline-device'
          ? 'desktop-classic'
          : state.kind === 'token-invalid'
            ? 'lock-alert'
            : state.kind === 'degraded-tunnel-only'
              ? 'cloud-outline'
              : 'cloud-off-outline';

  const action = stateCopy.actionLabel;

  return (
    <>
      <Pressable
        onPress={onPrimaryAction}
        accessibilityRole={action ? 'button' : undefined}
        style={[
          styles.bar,
          { backgroundColor: palette.bg, borderBottomColor: palette.border },
        ]}
      >
        <View style={styles.iconWrap}>
          {severity === 'pending' ? (
            <ActivityIndicator size={14} color={palette.icon} />
          ) : iconSource ? (
            <Icon source={iconSource} size={16} color={palette.icon} />
          ) : null}
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.message, { color: palette.fg }]} numberOfLines={1}>
            {stateCopy.long}
          </Text>
          {stateCopy.detail ? (
            <Text style={[styles.detail, { color: palette.fg }]} numberOfLines={1}>
              {stateCopy.detail}
            </Text>
          ) : null}
        </View>
        {action ? (
          <Text style={[styles.action, { color: palette.fg }]}>{action}</Text>
        ) : null}
      </Pressable>
      <OfflineDeviceHelpSheet
        visible={helpVisible}
        onRequestClose={() => setHelpVisible(false)}
      />
    </>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 18,
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  detail: {
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.8,
  },
  action: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
