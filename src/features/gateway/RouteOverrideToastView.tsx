/**
 * Snackbar that renders a leading icon driven by the override-toast state
 * machine. Pending shows a spinner; ok/error fade-swaps the icon while the
 * Snackbar stays mounted so the user sees the toast morph in place.
 */
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Icon, Snackbar } from 'react-native-paper';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useResolvedIsDark } from '../../lib/stack-screen-theme';

import type { RouteOverrideToast } from './use-route-override-toast';

export type RouteOverrideToastViewProps = {
  toast: RouteOverrideToast;
  onDismiss: () => void;
};

export const RouteOverrideToastView = memo(function RouteOverrideToastView({
  toast,
  onDismiss,
}: RouteOverrideToastViewProps) {
  const isDark = useResolvedIsDark();

  // We always render the Snackbar so its enter animation can play once; the
  // children inside cross-fade as the status morphs. Visibility is bound to
  // toast presence; we keep the same `key` for the whole pending → resolved
  // lifecycle so Paper doesn't re-mount and reset its slide-in.
  if (!toast) {
    return (
      <Snackbar visible={false} onDismiss={onDismiss}>
        {''}
      </Snackbar>
    );
  }

  const tint =
    toast.status === 'error'
      ? isDark
        ? '#FF6961'
        : '#FCA5A5'
      : toast.status === 'ok'
        ? isDark
          ? '#7BE995'
          : '#86EFAC'
        : isDark
          ? '#93C5FD'
          : '#BFDBFE';

  return (
    <Snackbar
      key={toast.key}
      visible
      onDismiss={onDismiss}
      // Hook owns the lifetime; we pick a large value so Paper's internal
      // timer never preempts the morph from pending → resolved.
      duration={120_000}
    >
      <View style={styles.row}>
        <Animated.View
          key={`icon-${toast.status}-${toast.icon}`}
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={styles.iconWrap}
        >
          {toast.icon === 'spinner' ? (
            <ActivityIndicator size={14} color={tint} />
          ) : (
            <Icon source={iconSource(toast.icon)} size={16} color={tint} />
          )}
        </Animated.View>
        <Animated.Text
          key={`msg-${toast.message}`}
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={styles.message}
          numberOfLines={2}
        >
          {toast.message}
        </Animated.Text>
      </View>
    </Snackbar>
  );
});

function iconSource(icon: NonNullable<RouteOverrideToast>['icon']): string {
  switch (icon) {
    case 'check':
      return 'check-circle-outline';
    case 'error':
      return 'alert-circle-outline';
    case 'lan':
      return 'lan-connect';
    case 'cloud':
      return 'cloud-check-outline';
    default:
      return 'progress-clock';
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontSize: 14,
  },
});
