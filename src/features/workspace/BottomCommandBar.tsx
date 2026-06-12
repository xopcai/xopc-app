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
  const controlSurface = {
    backgroundColor: colors.surface.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.12 : 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  };
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

  const pillHiddenStyle = useAnimatedStyle(() => {
    if (!transition) return { opacity: 1 };
    // Crossfade with the morphing ghost — real pill shows only when progress ≈ 0.
    return { opacity: transition.progress.value < 0.04 ? 1 : 0 };
  }, [transition]);

  const barHiddenStyle = useAnimatedStyle(() => {
    if (!transition) return { opacity: 1 };
    const openAmount = transition.progress.value;
    return {
      opacity: 1 - openAmount * 0.85,
    };
  }, [transition]);

  return (
    <Animated.View style={[styles.wrap, { paddingBottom: floatingBottomPadding(bottomInset) }, barHiddenStyle]}>
      <Pressable style={[styles.iconButton, controlSurface]} onPress={onSearch}>
        <Icon source="magnify" size={22} color={colors.text.secondary} />
      </Pressable>

      <View ref={pillRef} collapsable={false} style={styles.aiPillWrap}>
        <AnimatedPressable
          style={[styles.aiPill, controlSurface, pillHiddenStyle]}
          onPress={onAskAi}
          onPressIn={onAskAiPressIn}
          accessibilityRole="button"
          accessibilityLabel="问 AI"
        >
          <Icon source="creation-outline" size={22} color="#6D5DFB" />
          <Text style={[styles.aiText, { color: colors.text.secondary }]} numberOfLines={1}>问 AI</Text>
        </AnimatedPressable>
      </View>

      <Pressable style={[styles.iconButton, controlSurface]} onPress={onCreate}>
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
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  aiText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
