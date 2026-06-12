/**
 * Swipeable wrapper for NoteCard — left swipe reveals pin/unpin, archive, delete.
 *
 * Uses react-native-gesture-handler's ReanimatedSwipeable for native-driven animation.
 */
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

import type { NoteIndexEntry } from '../../query/notes';
import { useMessages } from '../../i18n/messages';

import { onSwipeableClose, onSwipeableWillOpen } from './swipe-open-registry';

export type SwipeAction = 'pin' | 'unpin' | 'archive' | 'delete';

export type SwipeableNoteCardProps = {
  note: NoteIndexEntry;
  onAction: (note: NoteIndexEntry, action: SwipeAction) => void;
  children: React.ReactNode;
};

const BUTTON_SIZE = 44;
const ACTION_GAP = 10;
const ACTION_COUNT = 3;
const TOTAL_WIDTH = ACTION_COUNT * BUTTON_SIZE + (ACTION_COUNT - 1) * ACTION_GAP;

const ACTION_COLORS = {
  pin: '#34C759',
  archive: '#007AFF',
  delete: '#FF3B30',
} as const;

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
  note: NoteIndexEntry;
  onAction: (action: SwipeAction) => void;
  labels: { pin: string; unpin: string; archive: string; delete: string };
};

function RightActions({ translation, note, onAction, labels }: RightActionsProps) {
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

  const pinAction: SwipeAction = note.pinned ? 'unpin' : 'pin';
  const pinIcon = note.pinned ? 'pin-off' : 'pin';
  const pinLabel = note.pinned ? labels.unpin : labels.pin;

  return (
    <Reanimated.View style={[styles.rightActions, style]}>
      <CircularAction
        icon={pinIcon}
        color={ACTION_COLORS.pin}
        label={pinLabel}
        onPress={() => onAction(pinAction)}
      />
      <CircularAction
        icon="archive-arrow-down-outline"
        color={ACTION_COLORS.archive}
        label={labels.archive}
        onPress={() => onAction('archive')}
      />
      <CircularAction
        icon="trash-can-outline"
        color={ACTION_COLORS.delete}
        label={labels.delete}
        onPress={() => onAction('delete')}
      />
    </Reanimated.View>
  );
}

export function SwipeableNoteCard({ note, onAction, children }: SwipeableNoteCardProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const m = useMessages();
  const pm = m.notesPage;

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleAction = useCallback(
    (action: SwipeAction) => {
      close();
      onAction(note, action);
    },
    [close, note, onAction],
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
        note={note}
        onAction={handleAction}
        labels={{ pin: pm.pin, unpin: pm.unpin, archive: pm.archive, delete: pm.delete }}
      />
    ),
    [handleAction, note, pm.archive, pm.delete, pm.pin, pm.unpin],
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
    borderRadius: 14,
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
