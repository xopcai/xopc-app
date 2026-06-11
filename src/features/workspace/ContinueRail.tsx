import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { NoteIndexEntry } from '../../query/notes';
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

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>继续</Text>
      {items.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface.panel }]}> 
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>还没有最近打开的笔记</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, { backgroundColor: colors.surface.panel }]}
              onPress={() => onItemPress(item)}
            >
              <Icon source={iconForKind(item.kind)} size={20} color="#6D5DFB" />
              <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text.primary }]}>
                {item.snippet || '无标题'}
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
