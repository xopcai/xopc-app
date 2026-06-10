/**
 * SwipeableRow — shared swipeable list item wrapper.
 *
 * Renders right-side action buttons (archive, delete, pin, etc.) behind the
 * content row. Uses react-native-gesture-handler's Swipeable with RN Animated.
 *
 * Design spec (AGENTS.md):
 * - Circular action buttons 44×44
 * - Color semantics: green=pin, blue=archive, red=delete
 * - Mutually exclusive open (via swipe-open-registry)
 * - Disabled when selectionMode is active
 */

import { memo, useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { Swipeable } from 'react-native-gesture-handler';

import {
  registerSwipeOpen,
  unregisterSwipeOpen,
} from './swipe-open-registry';

// ── Type alias matching gesture-handler's internal definition ──
type AnimatedInterpolation = ReturnType<Animated.Value['interpolate']>;

// ── Action types ────────────────────────────────────────────

export type SwipeActionColor = 'green' | 'blue' | 'red';

export type SwipeAction = {
  key: string;
  icon: string;
  color: SwipeActionColor;
  label: string;
  destructive?: boolean;
};

export const ACTION_COLOR_MAP: Record<SwipeActionColor, string> = {
  green: '#34C759',
  blue: '#007AFF',
  red: '#FF3B30',
};

// ── Props ────────────────────────────────────────────────────

export type SwipeableRowProps = {
  actions: SwipeAction[];
  onActionPress: (action: SwipeAction) => void;
  enabled?: boolean;
  children: React.ReactNode;
};

// ── Button width constant ────────────────────────────────────

const ACTION_WIDTH = 64; // total width per action button (44 circle + 20 padding)

// ── Component ────────────────────────────────────────────────

export const SwipeableRow = memo(function SwipeableRow({
  actions,
  onActionPress,
  enabled = true,
  children,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleClose = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleSwipeableOpen = useCallback(() => {
    registerSwipeOpen(handleClose);
  }, [handleClose]);

  const handleSwipeableClose = useCallback(() => {
    unregisterSwipeOpen(handleClose);
  }, [handleClose]);

  const renderRightActions = useCallback(
    (progress: AnimatedInterpolation, _drag: AnimatedInterpolation) => {
      const totalWidth = actions.length * ACTION_WIDTH;

      return (
        <View style={[styles.actionsContainer, { width: totalWidth }]}>
          {actions.map((action) => {
            const bgColor = ACTION_COLOR_MAP[action.color];

            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.actionButtonWrap,
                  { backgroundColor: bgColor },
                  {
                    opacity: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              >
                <Pressable
                  style={styles.actionButton}
                  onPress={() => {
                    swipeableRef.current?.close();
                    onActionPress(action);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Icon source={action.icon} size={20} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.actionLabel}>{action.label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      );
    },
    [actions, onActionPress],
  );

  if (!enabled) {
    return <View>{children}</View>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      onSwipeableOpen={handleSwipeableOpen}
      onSwipeableClose={handleSwipeableClose}
    >
      {children}
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButtonWrap: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
