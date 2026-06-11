import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Icon, Text } from 'react-native-paper';

import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, useTheme } from '../../theme';

import { useOptionalWorkspaceTransition } from './workspace-transition-context';

interface BottomCommandBarProps {
  bottomInset: number;
  onSearch: () => void;
  onAskAi: () => void;
  onAskAiPressIn?: () => void;
  onCreate: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BottomCommandBar({ bottomInset, onSearch, onAskAi, onAskAiPressIn, onCreate }: BottomCommandBarProps) {
  const { colors, isDark } = useTheme();
  const transition = useOptionalWorkspaceTransition();
  const controlBg = isDark ? colors.surface.input : colors.surface.panel;
  const pillRef = useRef<RNView>(null);

  const measurePill = useCallback(async () => {
    return new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      pillRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    });
  }, []);

  useEffect(() => {
    if (!transition) return;
    transition.registerPillMeasurer(measurePill);
    return () => transition.registerPillMeasurer(null);
  }, [measurePill, transition]);

  const phase = transition?.phase;
  const pillHiddenStyle = useAnimatedStyle(() => {
    if (!transition) return { opacity: 1 };
    // Keep the home pill hidden until the overlay transition fully settles,
    // so it does not overlap the morphing ghost on close.
    return { opacity: phase === 'closed' ? 1 : 0 };
  }, [phase, transition]);

  const barHiddenStyle = useAnimatedStyle(() => {
    if (!transition) return { opacity: 1, transform: [{ translateY: 0 }] };
    const openAmount = transition.progress.value;
    return {
      opacity: 1 - openAmount * 0.85,
      transform: [{ translateY: openAmount * 40 }],
    };
  }, [transition]);

  return (
    <Animated.View style={[styles.wrap, { paddingBottom: floatingBottomPadding(bottomInset) }, barHiddenStyle]}>
      <Pressable style={[styles.iconButton, { backgroundColor: controlBg }]} onPress={onSearch}>
        <Icon source="magnify" size={22} color={colors.text.secondary} />
      </Pressable>

      <View ref={pillRef} collapsable={false} style={styles.aiPillWrap}>
        <AnimatedPressable
          style={[styles.aiPill, { backgroundColor: controlBg }, pillHiddenStyle]}
          onPress={onAskAi}
          onPressIn={onAskAiPressIn}
          accessibilityRole="button"
          accessibilityLabel="问 AI"
        >
          <Icon source="creation-outline" size={18} color="#6D5DFB" />
          <Text style={[styles.aiText, { color: colors.text.tertiary }]} numberOfLines={1}>问 AI</Text>
        </AnimatedPressable>
      </View>

      <Pressable style={[styles.iconButton, { backgroundColor: controlBg }]} onPress={onCreate}>
        <Icon source="square-edit-outline" size={21} color={colors.text.secondary} />
      </Pressable>
    </Animated.View>
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
  aiPillWrap: {
    flex: 1,
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
