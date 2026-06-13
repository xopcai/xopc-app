import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Icon } from 'react-native-paper';

import { onSwipeableClose, onSwipeableWillOpen } from '../notes/swipe-open-registry';

const BUTTON_SIZE = 44;
const ACTION_GAP = 10;
const ACTION_COUNT = 2;
const TOTAL_WIDTH = ACTION_COUNT * BUTTON_SIZE + (ACTION_COUNT - 1) * ACTION_GAP;

type InboxSwipeAction = 'archive' | 'delete';

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
  onAction: (action: InboxSwipeAction) => void;
  labels: { archive: string; delete: string };
};

function RightActions({ translation, onAction, labels }: RightActionsProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          translation.value,
          [-TOTAL_WIDTH, 0],
          [0, TOTAL_WIDTH],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Reanimated.View style={[styles.rightActions, style]}>
      <CircularAction
        icon="archive-arrow-down-outline"
        color="#007AFF"
        label={labels.archive}
        onPress={() => onAction('archive')}
      />
      <CircularAction
        icon="trash-can-outline"
        color="#FF3B30"
        label={labels.delete}
        onPress={() => onAction('delete')}
      />
    </Reanimated.View>
  );
}

interface InboxSwipeableItemProps {
  archiveLabel: string;
  deleteLabel: string;
  onAction: (action: InboxSwipeAction) => void;
  children: React.ReactNode;
}

export function InboxSwipeableItem({
  archiveLabel,
  deleteLabel,
  onAction,
  children,
}: InboxSwipeableItemProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleAction = useCallback(
    (action: InboxSwipeAction) => {
      close();
      onAction(action);
    },
    [close, onAction],
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
      <RightActions
        translation={translation}
        onAction={handleAction}
        labels={{ archive: archiveLabel, delete: deleteLabel }}
      />
    ),
    [archiveLabel, deleteLabel, handleAction],
  );

  return (
    <View style={styles.row}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={TOTAL_WIDTH * 0.45}
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
    borderRadius: 20,
    overflow: 'hidden',
  },
  foreground: {
    width: '100%',
  },
  rightActions: {
    width: TOTAL_WIDTH,
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
