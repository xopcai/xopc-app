import { memo, useCallback } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
} from 'react-native';

import { useTheme } from '../../../theme';
import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorImagePickResult,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
} from './editor-protocol';

export interface NoteEditorBridgeProps {
  noteId: string;
  markdown: string;
  attachmentSrcMap?: Record<string, string>;
  labels: NoteEditorLabels;
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange: (context: EditorSelectionContext) => void;
  onRequestImage: () => Promise<EditorImagePickResult>;
  onRequestAi: (request: EditorAiRequest) => Promise<EditorAiResponse | null>;
  onApplyAiMetadata: (metadata: EditorAiMetadata) => Promise<void>;
  onRequestWikiLink: (query: string) => Promise<EditorWikiLinkCandidate[]>;
}

function selectionContext(markdown: string, from: number, to: number): EditorSelectionContext {
  const start = Math.max(0, Math.min(from, to, markdown.length));
  const end = Math.max(0, Math.min(Math.max(from, to), markdown.length));
  const beforeBreak = markdown.lastIndexOf('\n\n', start - 1);
  const afterBreak = markdown.indexOf('\n\n', end);
  const blockStart = beforeBreak < 0 ? 0 : beforeBreak + 2;
  const blockEnd = afterBreak < 0 ? markdown.length : afterBreak;
  return {
    from: start,
    to: end,
    markdown: markdown.slice(start, end),
    currentBlockMarkdown: markdown.slice(blockStart, blockEnd),
    beforeMarkdown: markdown.slice(Math.max(0, blockStart - 1200), blockStart),
    afterMarkdown: markdown.slice(blockEnd, Math.min(markdown.length, blockEnd + 1200)),
  };
}

export const NoteEditorBridge = memo(function NoteEditorBridge({
  markdown,
  labels,
  onChangeMarkdown,
  onSelectionChange,
}: NoteEditorBridgeProps) {
  const { colors } = useTheme();

  const handleSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = event.nativeEvent.selection;
    onSelectionChange(selectionContext(markdown, start, end));
  }, [markdown, onSelectionChange]);

  return (
    <View style={styles.container}>
      <TextInput
        value={markdown}
        onChangeText={onChangeMarkdown}
        onSelectionChange={handleSelectionChange}
        placeholder={labels.placeholder}
        placeholderTextColor={colors.text.tertiary}
        multiline
        scrollEnabled
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect
        style={[
          styles.input,
          {
            backgroundColor: colors.surface.base,
            color: colors.text.primary,
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  input: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 120,
    fontSize: 17,
    lineHeight: 27,
  },
});
