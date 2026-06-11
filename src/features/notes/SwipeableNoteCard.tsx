/**
 * Swipeable wrapper for NoteCard — left swipe reveals pin/unpin, archive, delete.
 *
 * Uses react-native-gesture-handler's Swipeable for native-driven animation.
 */
import { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
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

export function SwipeableNoteCard({ note, isDark, onAction, children }: SwipeableNoteCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
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
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const totalWidth = ACTION_WIDTH * 3;
      const translateX = dragX.interpolate({
        inputRange: [-totalWidth, 0],
        outputRange: [0, totalWidth],
        extrapolate: 'clamp',
      });

      const pinAction: SwipeAction = note.pinned ? 'unpin' : 'pin';
      const pinIcon = note.pinned ? 'pin-off' : 'pin';
      const pinColor = isDark ? '#60A5FA' : '#2563EB';
      const archiveColor = isDark ? '#FBBF24' : '#D97706';
      const deleteColor = '#EF4444';

      return (
        <Animated.View style={[styles.rightActions, { transform: [{ translateX }] }]}>
          <Pressable style={[styles.actionButton, { backgroundColor: `${pinColor}18` }]} onPress={() => handleAction(pinAction)}>
            <Icon source={pinIcon} size={20} color={pinColor} />
            <Text style={[styles.actionLabel, { color: pinColor }]}>{note.pinned ? pm.unpin : pm.pin}</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, { backgroundColor: `${archiveColor}18` }]} onPress={() => handleAction('archive')}>
            <Icon source="archive-outline" size={20} color={archiveColor} />
            <Text style={[styles.actionLabel, { color: archiveColor }]}>{pm.archive}</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, { backgroundColor: `${deleteColor}18` }]} onPress={() => handleAction('delete')}>
            <Icon source="delete-outline" size={20} color={deleteColor} />
            <Text style={[styles.actionLabel, { color: deleteColor }]}>{pm.delete}</Text>
          </Pressable>
        </Animated.View>
      );
    },
    [handleAction, isDark, note.pinned, pm.archive, pm.delete, pm.pin, pm.unpin],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH}
      overshootRight={false}
      friction={2}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  rightActions: {
    width: ACTION_WIDTH * 3,
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
