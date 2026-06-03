/**
 * Drawer pill background/border morph in lockstep with foreground color.
 *
 * Reanimated-driven: a single shared value drives `interpolateColor` for the
 * pill bg + border. The icon and text are rendered through render-prop
 * children that receive a JS-thread-resolved foreground colour AND an
 * animated opacity that briefly dips on severity change so colour snaps
 * inside Paper's `Icon` / `Text` are masked under the cross-fade. Net
 * effect: the entire pill (chrome + glyphs + label) appears to morph as
 * one unit, without us having to wrap third-party icon fonts.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ConnectionSeverity } from './connection-state';

const SEVERITY_ORDER: ConnectionSeverity[] = ['ok', 'warn', 'error', 'pending', 'idle'];

function severityIndex(s: ConnectionSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

const PALETTE_LIGHT = {
  bg: ['rgba(52,199,89,0.12)', 'rgba(245,158,11,0.14)', 'rgba(255,59,48,0.12)', 'rgba(59,130,246,0.12)', 'rgba(142,142,147,0.14)'],
  border: ['rgba(52,199,89,0.30)', 'rgba(245,158,11,0.32)', 'rgba(255,59,48,0.30)', 'rgba(59,130,246,0.30)', 'rgba(142,142,147,0.30)'],
  fg: ['#0F7B2C', '#92400E', '#991B1B', '#1E3A8A', '#3C3C43'],
};

const PALETTE_DARK = {
  bg: ['rgba(52,199,89,0.16)', 'rgba(245,158,11,0.18)', 'rgba(255,59,48,0.16)', 'rgba(59,130,246,0.16)', 'rgba(142,142,147,0.18)'],
  border: ['rgba(52,199,89,0.32)', 'rgba(245,158,11,0.34)', 'rgba(255,59,48,0.32)', 'rgba(59,130,246,0.32)', 'rgba(142,142,147,0.32)'],
  fg: ['#7BE995', '#FCD34D', '#FF6961', '#93C5FD', '#C7C7CC'],
};

const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };
/** During a severity flip, briefly dip the foreground opacity so the JS-side
 * colour swap on icon/text glyphs slips in under the bg/border morph. */
const FG_DIP_OUT = { duration: 110, easing: Easing.in(Easing.cubic) };
const FG_DIP_IN = { duration: 170, easing: Easing.out(Easing.cubic) };

export type AnimatedConnectionPillChildContext = {
  /** Resolved foreground colour for the current severity (JS-side). */
  color: string;
};

export type AnimatedConnectionPillProps = {
  severity: ConnectionSeverity;
  isDark: boolean;
  children: (ctx: AnimatedConnectionPillChildContext) => ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  textStyle?: TextStyle;
};

export const AnimatedConnectionPill = memo(function AnimatedConnectionPill({
  severity,
  isDark,
  children,
  style,
}: AnimatedConnectionPillProps) {
  const targetIndex = severityIndex(severity);
  const sv = useSharedValue(targetIndex);
  // 0 → fully visible, 1 → mid-dip. Only flips when severity changes.
  const dip = useSharedValue(0);

  useEffect(() => {
    sv.value = withTiming(targetIndex, TIMING);
    dip.value = withSequence(
      withTiming(1, FG_DIP_OUT),
      withDelay(20, withTiming(0, FG_DIP_IN)),
    );
  }, [sv, dip, targetIndex]);

  const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;
  const inputRange = SEVERITY_ORDER.map((_, i) => i);

  const animatedContainer = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sv.value, inputRange, palette.bg),
    borderColor: interpolateColor(sv.value, inputRange, palette.border),
  }));

  const fgOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(dip.value, [0, 1], [1, 0.35]),
  }));

  const fgColor = palette.fg[targetIndex];

  return (
    <Animated.View style={[styles.pill, animatedContainer, style]}>
      <Animated.View style={[styles.pillInner, fgOpacity]}>
        <View style={styles.row}>{children({ color: fgColor })}</View>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export type AnimatedPillIconName = string;
