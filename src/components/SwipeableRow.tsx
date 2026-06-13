import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Icon } from 'react-native-paper';

import { onSwipeableClose, onSwipeableWillOpen } from './swipe-open-registry';

const BUTTON_SIZE = 44;
const ACTION_GAP = 10;

const ACTION_COLOR_MAP = {
  green: '#34C759',
  blue: '#007AFF',
  red: '#FF3B30',
} as const;

export type SwipeRowActionColor = keyof typeof ACTION_COLOR_MAP;

export type SwipeRowAction = {
  key: string;
  icon: string;
  label: string;
  color: SwipeRowActionColor;
  onPress: () => void;
};

type SwipeableRowProps = {
  actions: SwipeRowAction[];
  borderRadius?: number;
  enabled?: boolean;
  children: React.ReactNode;
};

function swipeWidth(actionCount: number): number {
  return actionCount * BUTTON_SIZE + Math.max(0, actionCount - 1) * ACTION_GAP;
}

type CircularActionProps = {
  icon: string;
  color: string;
  label: string;
  onPress: () => void;
};

function CircularAction({ icon, color, label, onPress }: CircularActionProps) {
  return (
    <Pressable
      style={[styles.circleButton, { backgroundColor: color }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon source={icon} size={20} color="#FFFFFF" />
    </Pressable>
  );
}

type RightActionsProps = {
  translation: SharedValue<number>;
  totalWidth: number;
  actions: SwipeRowAction[];
};

function RightActions({ translation, totalWidth, actions }: RightActionsProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          translation.value,
          [-totalWidth, 0],
          [0, totalWidth],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Reanimated.View style={[styles.rightActions, { width: totalWidth }, style]}>
      {actions.map((action) => (
        <CircularAction
          key={action.key}
          icon={action.icon}
          color={ACTION_COLOR_MAP[action.color]}
          label={action.label}
          onPress={action.onPress}
        />
      ))}
    </Reanimated.View>
  );
}

export function SwipeableRow({
  actions,
  borderRadius = 14,
  enabled = true,
  children,
}: SwipeableRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const totalWidth = useMemo(() => swipeWidth(actions.length), [actions.length]);

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const resolvedActions = useMemo(
    () =>
      actions.map((action) => ({
        ...action,
        onPress: () => {
          close();
          action.onPress();
        },
      })),
    [actions, close],
  );

  const handleWillOpen = useCallback(() => {
    if (swipeableRef.current) {
      onSwipeableWillOpen(swipeableRef.current);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (swipeableRef.current) {
      onSwipeableClose(swipeableRef.current);
    }
  }, []);

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <RightActions translation={translation} totalWidth={totalWidth} actions={resolvedActions} />
    ),
    [resolvedActions, totalWidth],
  );

  if (!enabled || actions.length === 0) {
    return <View style={{ borderRadius, overflow: 'hidden' }}>{children}</View>;
  }

  return (
    <View style={[styles.row, { borderRadius }]}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={totalWidth * 0.45}
        overshootRight={false}
        friction={1.8}
        onSwipeableWillOpen={handleWillOpen}
        onSwipeableClose={handleClose}
      >
        <View style={styles.foreground}>{children}</View>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    overflow: 'hidden',
  },
  foreground: {
    width: '100%',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: ACTION_GAP,
    paddingLeft: 4,
  },
  circleButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
