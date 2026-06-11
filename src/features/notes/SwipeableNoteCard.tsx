/**
 * Swipeable wrapper for NoteCard — left swipe reveals pin/unpin, archive, delete.
 *
 * Uses react-native-gesture-handler's ReanimatedSwipeable for native-driven animation.
 */
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Icon, Text } from 'react-native-paper';

import type { NoteIndexEntry } from '../../query/notes';
import { useMessages } from '../../i18n/messages';

export type SwipeAction = 'pin' | 'unpin' | 'archive' | 'delete';

export type SwipeableNoteCardProps = {
  note: NoteIndexEntry;
  isDark: boolean;
  onAction: (note: NoteIndexEntry, action: SwipeAction) => void;
  children: React.ReactNode;
};

const ACTION_WIDTH = 72;
const TOTAL_WIDTH = ACTION_WIDTH * 3;

type RightActionsProps = {
  translation: SharedValue<number>;
  note: NoteIndexEntry;
  isDark: boolean;
  onAction: (action: SwipeAction) => void;
  labels: { pin: string; unpin: string; archive: string; delete: string };
};

function RightActions({ translation, note, isDark, onAction, labels }: RightActionsProps) {
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
  const pinColor = isDark ? '#60A5FA' : '#2563EB';
  const archiveColor = isDark ? '#FBBF24' : '#D97706';
  const deleteColor = '#EF4444';

  return (
    <Reanimated.View style={[styles.rightActions, style]}>
      <Pressable style={[styles.actionButton, { backgroundColor: `${pinColor}18` }]} onPress={() => onAction(pinAction)}>
        <Icon source={pinIcon} size={20} color={pinColor} />
        <Text style={[styles.actionLabel, { color: pinColor }]}>{note.pinned ? labels.unpin : labels.pin}</Text>
      </Pressable>
      <Pressable style={[styles.actionButton, { backgroundColor: `${archiveColor}18` }]} onPress={() => onAction('archive')}>
        <Icon source="archive-outline" size={20} color={archiveColor} />
        <Text style={[styles.actionLabel, { color: archiveColor }]}>{labels.archive}</Text>
      </Pressable>
      <Pressable style={[styles.actionButton, { backgroundColor: `${deleteColor}18` }]} onPress={() => onAction('delete')}>
        <Icon source="delete-outline" size={20} color={deleteColor} />
        <Text style={[styles.actionLabel, { color: deleteColor }]}>{labels.delete}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

export function SwipeableNoteCard({ note, isDark, onAction, children }: SwipeableNoteCardProps) {
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

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => (
      <RightActions
        translation={translation}
        note={note}
        isDark={isDark}
        onAction={handleAction}
        labels={{ pin: pm.pin, unpin: pm.unpin, archive: pm.archive, delete: pm.delete }}
      />
    ),
    [handleAction, isDark, note, pm.archive, pm.delete, pm.pin, pm.unpin],
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH}
      overshootRight={false}
      friction={2}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  rightActions: {
    width: TOTAL_WIDTH,
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    borderRadius: 12,
    marginHorizontal: 2,
    marginVertical: 4,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
