import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MarkdownView } from '../chat/MarkdownView';
import { useTheme } from '../../theme';

import { blocksToMarkdown, blocksToReadableText, type NoteBlock } from './note-blocks';

type NoteBodyPreviewProps = {
  blocks: NoteBlock[];
  emptyLabel: string;
};

export const NoteBodyPreview = memo(function NoteBodyPreview({
  blocks,
  emptyLabel,
}: NoteBodyPreviewProps) {
  const { colors } = useTheme();
  const markdown = useMemo(() => blocksToMarkdown(blocks), [blocks]);
  const plain = useMemo(() => blocksToReadableText(blocks).trim(), [blocks]);

  if (!plain) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <MarkdownView content={markdown} allowTrailingMargin />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 12 },
  emptyWrap: { flex: 1, minHeight: 120, justifyContent: 'center' },
  emptyText: { fontSize: 15, lineHeight: 22 },
});
