import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { NoteIndexEntry, NoteKind } from '../../query/notes';

const KIND_ICONS: Record<NoteKind, string> = {
  thought: 'lightbulb-outline',
  todo: 'checkbox-marked-outline',
  voice: 'microphone',
  media: 'image',
  bookmark: 'link',
  mixed: 'lightbulb-outline',
};

export type NoteCardProps = {
  note: NoteIndexEntry;
  isDark: boolean;
  onPress: (note: NoteIndexEntry) => void;
  onLongPress: (note: NoteIndexEntry) => void;
};

export function NoteCard({ note, isDark, onPress, onLongPress }: NoteCardProps) {
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E5EA';
  const textPrimary = isDark ? '#E5E7EB' : '#1F2937';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const tagBg = isDark ? '#374151' : '#F3F4F6';
  const pinColor = isDark ? '#60A5FA' : '#2563EB';

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
        { backgroundColor: pressed ? (isDark ? '#2C2C2E' : '#F5F5F5') : cardBg, borderColor: cardBorder },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <View style={styles.topRow}>
        <Icon source={iconName} size={20} color={textSecondary} />
        <Text
          style={[styles.snippet, { color: textPrimary }]}
          numberOfLines={3}
        >
          {note.snippet || '(no text)'}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {note.pinned && (
          <View style={[styles.tag, { backgroundColor: `${pinColor}18` }]}>
            <Icon source="pin" size={12} color={pinColor} />
          </View>
        )}
        {note.tags?.map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: tagBg }]}>
            <Text style={[styles.tagText, { color: textSecondary }]}>{tag}</Text>
          </View>
        ))}
        <Text style={[styles.time, { color: textSecondary }]}>{time}</Text>
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
