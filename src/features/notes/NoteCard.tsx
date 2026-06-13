import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { ListSelectionCheckbox } from '../../components/ListSelectionCheckbox';
import { LIST_DELAY_LONG_PRESS } from '../../constants/list-interaction';
import { useMessages } from '../../i18n/messages';
import type { NoteIndexEntry, NoteStatus } from '../../query/notes';
import { useTheme } from '../../theme';

import { NOTE_KIND_ICONS, noteKindLabel } from './note-list-display';
import { resolveNoteListPreview } from './note-title';
import { readLocalNote } from './notes-local';

function statusLabel(
  status: NoteStatus,
  labels: Record<'filterInbox' | 'filterProcessed' | 'filterArchived', string>,
): string | null {
  switch (status) {
    case 'inbox':
      return labels.filterInbox;
    case 'processed':
      return null;
    case 'archived':
      return labels.filterArchived;
    default:
      return null;
  }
}

export type NoteCardProps = {
  note: NoteIndexEntry;
  onPress: (note: NoteIndexEntry) => void;
  onLongPress: (note: NoteIndexEntry) => void;
  selectionMode?: boolean;
  selected?: boolean;
};

export function NoteCard({
  note,
  onPress,
  onLongPress,
  selectionMode = false,
  selected = false,
}: NoteCardProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const iconName = NOTE_KIND_ICONS[note.kind] || 'lightbulb-outline';
  const cachedNote = useMemo(() => readLocalNote(note.id), [note.id]);
  const preview = useMemo(
    () => resolveNoteListPreview(note, { untitled: pm.untitledNote, cachedNote }),
    [cachedNote, note, pm.untitledNote],
  );

  const displayTitle = useMemo(() => {
    if (preview.title !== pm.untitledNote) return preview.title;
    return noteKindLabel(note.kind, pm);
  }, [note.kind, pm, preview.title]);

  const kindLabel = noteKindLabel(note.kind, pm);
  const statusText = statusLabel(note.status, pm);
  const updatedAt = note.updatedAt ?? note.createdAt;
  const time = new Date(updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePress = useCallback(() => onPress(note), [note, onPress]);
  const handleLongPress = useCallback(() => onLongPress(note), [note, onLongPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected
            ? colors.accent.selectionBg
            : pressed
              ? colors.surface.hover
              : colors.surface.panel,
        },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={LIST_DELAY_LONG_PRESS}
      accessibilityState={selectionMode ? { selected } : undefined}
    >
      <View style={styles.topRow}>
        {selectionMode ? (
          <ListSelectionCheckbox selected={selected} size={28} />
        ) : (
          <View style={[styles.kindBadge, { backgroundColor: colors.accent.selectionBg }]}>
            <Icon source={iconName} size={16} color={colors.accent.primary} />
          </View>
        )}
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: colors.text.primary }]}
            numberOfLines={2}
          >
            {displayTitle}
          </Text>
          {!!preview.subtitle && (
            <Text
              style={[styles.subtitle, { color: colors.text.secondary }]}
              numberOfLines={2}
            >
              {preview.subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.metaRow}>
        {!!kindLabel && (
          <View style={[styles.chip, { backgroundColor: colors.accent.selectionBg }]}>
            <Text style={[styles.chipText, { color: colors.accent.primary }]}>{kindLabel}</Text>
          </View>
        )}
        {!!statusText && (
          <View style={[styles.chip, { backgroundColor: colors.surface.input }]}>
            <Text style={[styles.chipText, { color: colors.text.secondary }]}>{statusText}</Text>
          </View>
        )}
        {note.kind === 'task' && note.taskDone != null && (
          <View style={[styles.chip, { backgroundColor: colors.surface.input }]}>
            <Icon
              source={note.taskDone ? 'check-circle-outline' : 'circle-outline'}
              size={12}
              color={note.taskDone ? colors.semantic.success : colors.text.tertiary}
            />
            <Text style={[styles.chipText, { color: colors.text.secondary }]}>
              {note.taskDone ? pm.done : pm.kindTodo}
            </Text>
          </View>
        )}
        {note.pinned && (
          <View style={[styles.chip, { backgroundColor: colors.accent.selectionBg }]}>
            <Icon source="pin" size={11} color={colors.accent.primary} />
          </View>
        )}
        {note.tags?.map((tag) => (
          <View key={tag} style={[styles.chip, { backgroundColor: colors.surface.input }]}>
            <Text style={[styles.chipText, { color: colors.text.secondary }]}>{tag}</Text>
          </View>
        ))}
        <Text style={[styles.time, { color: colors.text.tertiary }]}>{time}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  kindBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 38,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  time: {
    marginLeft: 'auto',
    fontSize: 11,
  },
});
