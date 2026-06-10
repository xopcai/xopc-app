import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { resolveNoteListTitle } from '../notes/note-title';
import { readLocalNote } from '../notes/notes-local';
import type { NoteIndexEntry } from '../../query/notes';
import { useMessages } from '../../i18n/messages';
import { useTheme } from '../../theme';

interface ContinueRailProps {
  items: NoteIndexEntry[];
  onItemPress: (item: NoteIndexEntry) => void;
}

function iconForKind(kind: NoteIndexEntry['kind']): string {
  if (kind === 'task') return 'checkbox-marked-circle-outline';
  if (kind === 'voice') return 'microphone-outline';
  if (kind === 'media') return 'image-outline';
  if (kind === 'bookmark') return 'bookmark-outline';
  return 'file-document-outline';
}

export function ContinueRail({ items, onItemPress }: ContinueRailProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const hm = m.homePage;
  const accent = colors.accent.primary;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{hm.sectionContinue}</Text>
      {items.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface.panel }]}> 
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{hm.noRecentOpened}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, { backgroundColor: colors.surface.panel }]}
              onPress={() => onItemPress(item)}
            >
              <Icon source={iconForKind(item.kind)} size={20} color={accent} />
              <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text.primary }]}> 
                {resolveNoteListTitle(item, hm.untitled, readLocalNote(item.id))}
              </Text>
              {!!item.snippet && (
                <Text numberOfLines={2} style={[styles.cardSummary, { color: colors.text.tertiary }]}>{item.snippet}</Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  rail: { gap: 12, paddingRight: 16 },
  card: { width: 164, minHeight: 112, borderRadius: 20, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSummary: { fontSize: 12, lineHeight: 17 },
  emptyCard: { borderRadius: 18, padding: 16 },
  emptyText: { fontSize: 13, fontWeight: '500' },
});
