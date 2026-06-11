import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { NoteIndexEntry, NoteKind } from '../../query/notes';
import { useTheme } from '../../theme';

const KIND_ICONS: Record<NoteKind, string> = {
  thought: 'lightbulb-outline',
  todo: 'checkbox-marked-outline',
  voice: 'microphone',
  media: 'image',
  bookmark: 'link',
  mixed: 'lightbulb-outline',
  task: 'checkbox-marked-circle-outline',
};

export type NoteCardProps = {
  note: NoteIndexEntry;
  onPress: (note: NoteIndexEntry) => void;
  onLongPress: (note: NoteIndexEntry) => void;
};

export function NoteCard({ note, onPress, onLongPress }: NoteCardProps) {
  const { colors } = useTheme();

  const iconName = KIND_ICONS[note.kind] || 'lightbulb-outline';
  const time = new Date(note.createdAt).toLocaleString(undefined, {
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
          backgroundColor: pressed ? colors.surface.hover : colors.surface.panel,
          borderColor: colors.border.subtle,
        },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <View style={styles.topRow}>
        <View style={[styles.kindBadge, { backgroundColor: colors.accent.selectionBg }]}>
          <Icon source={iconName} size={16} color={colors.accent.primary} />
        </View>
        <Text
          style={[styles.snippet, { color: colors.text.primary }]}
          numberOfLines={3}
        >
          {note.snippet || '(no text)'}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {note.pinned && (
          <View style={[styles.tag, { backgroundColor: colors.accent.selectionBg }]}>
            <Icon source="pin" size={11} color={colors.accent.primary} />
          </View>
        )}
        {note.tags?.map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.surface.input }]}>
            <Text style={[styles.tagText, { color: colors.text.secondary }]}>{tag}</Text>
          </View>
        ))}
        <Text style={[styles.time, { color: colors.text.tertiary }]}>{time}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
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
  snippet: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 38,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
  },
  time: {
    marginLeft: 'auto',
    fontSize: 11,
  },
});
