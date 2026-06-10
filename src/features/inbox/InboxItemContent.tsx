import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import type { NoteIndexEntry } from '../../query/notes';
import { useTheme } from '../../theme';
import { resolveNoteListDisplay } from '../notes/note-list-display';
import { readLocalNote } from '../notes/notes-local';

export type InboxItemContentProps = {
  note: NoteIndexEntry;
};

export function InboxItemContent({ note }: InboxItemContentProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const im = m.inboxPage;
  const pm = m.notesPage;

  const display = useMemo(
    () => resolveNoteListDisplay(note, {
      untitled: pm.untitledNote,
      cachedNote: readLocalNote(note.id),
      kindLabels: pm,
      emptyHints: im.itemHints,
      timeLabels: im.time,
    }),
    [im.itemHints, im.time, note, pm],
  );

  return (
    <View style={styles.copy}>
      <Text numberOfLines={2} style={[styles.title, { color: colors.text.primary }]}>
        {display.title}
      </Text>
      {!!display.subtitle && (
        <Text numberOfLines={2} style={[styles.subtitle, { color: colors.text.secondary }]}>
          {display.subtitle}
        </Text>
      )}
      <Text numberOfLines={1} style={[styles.meta, { color: colors.text.tertiary }]}>
        {display.metaLine}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
});
