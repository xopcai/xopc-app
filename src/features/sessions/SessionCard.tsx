/**
 * Session list card — tap to open; long-press for multi-select;
 * swipe left for quick actions (archive / delete).
 */
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { ListSelectionCheckbox } from '../../components/ListSelectionCheckbox';
import { SwipeableRow, type SwipeAction } from '../../components/SwipeableRow';
import { LIST_DELAY_LONG_PRESS } from '../../constants/list-interaction';
import { t, useMessages } from '../../i18n/messages';
import { sessionDisplayName } from '../../lib/session-helpers';
import type { SessionListItem } from '../../query/sessions';
import { useTheme } from '../../theme';

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

type SessionCardProps = {
  session: SessionListItem;
  onPress: () => void;
  onLongPress?: () => void;
  onSwipeAction?: (action: SwipeAction) => void;
  selectionMode?: boolean;
  selected?: boolean;
};

export const SessionCard = memo(function SessionCard({
  session,
  onPress,
  onLongPress,
  onSwipeAction,
  selectionMode = false,
  selected = false,
}: SessionCardProps) {
  const { colors, isDark } = useTheme();
  const m = useMessages();
  const sa = m.sessionActions;

  const isPinned = session.status === 'pinned';
  const isArchived = session.status === 'archived';
  const title = useMemo(() => sessionDisplayName(session), [session]);
  const time = useMemo(() => relativeTime(session.updatedAt), [session.updatedAt]);

  const handlePress = useCallback(() => onPress(), [onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.();
  }, [onLongPress]);

  const swipeActions: SwipeAction[] = useMemo(() => [
    isArchived
      ? { key: 'archive', icon: 'archive-arrow-up-outline', color: 'blue', label: sa.unarchive }
      : { key: 'archive', icon: 'archive-arrow-down-outline', color: 'blue', label: sa.archive },
    { key: 'delete', icon: 'trash-can-outline', color: 'red', label: sa.delete, destructive: true },
  ], [isArchived, sa.archive, sa.delete, sa.unarchive]);

  const handleSwipeAction = useCallback((action: SwipeAction) => {
    onSwipeAction?.(action);
  }, [onSwipeAction]);

  const cardContent = (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={LIST_DELAY_LONG_PRESS}
      android_ripple={{ color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
      accessibilityState={selectionMode ? { selected } : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.accent.selectionBg : colors.surface.panel,
          borderColor: selected ? colors.accent.primary : colors.border.default,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.row}>
        {selectionMode ? (
          <ListSelectionCheckbox selected={selected} size={28} />
        ) : null}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            {isPinned ? (
              <Icon source="pin" size={14} color={colors.accent.primary} />
            ) : null}
            {isArchived ? (
              <Icon source="archive" size={14} color={colors.text.secondary} />
            ) : null}
            <Text
              variant="titleSmall"
              numberOfLines={1}
              style={[styles.title, isArchived && styles.archivedTitle]}
            >
              {title}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={[styles.meta, { color: colors.text.tertiary }]}>
              {t(m.sessions.messagesCount, { count: session.messageCount })}
            </Text>
            <Text variant="bodySmall" style={[styles.metaDot, { color: colors.text.tertiary }]}>
              ·
            </Text>
            <Text variant="bodySmall" style={[styles.meta, { color: colors.text.tertiary }]}>
              {time}
            </Text>
          </View>
        </View>
        {!selectionMode ? (
          <Icon source="chevron-right" size={20} color={colors.text.tertiary} />
        ) : null}
      </View>
    </Pressable>
  );

  // Wrap with SwipeableRow only when not in selection mode
  if (!selectionMode && onSwipeAction) {
    return (
      <SwipeableRow
        actions={swipeActions}
        onActionPress={handleSwipeAction}
        enabled={!selectionMode}
      >
        {cardContent}
      </SwipeableRow>
    );
  }

  return cardContent;
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
  },
  archivedTitle: {
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
  },
  metaDot: {
    fontSize: 12,
  },
});
