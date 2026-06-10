import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Text } from 'react-native-paper';

import { MarkdownView } from '../../chat/MarkdownView';
import { useTheme } from '../../../theme';
import { INSERT_BAR_HEIGHT } from '../blocks/note-layout';
import { BlockInsertBar, type BlockInsertAction } from '../blocks/BlockInsertBar';

export type MarkdownEditorMode = 'live' | 'source' | 'preview';

export interface MarkdownNoteEditorProps {
  markdown: string;
  previewMarkdown?: string;
  mode: MarkdownEditorMode;
  placeholder: string;
  accessibilityLabel: string;
  focusSelection?: { start: number; end: number; tick: number };
  toolbarActions: BlockInsertAction[];
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange?: (start: number, end: number) => void;
}

export const MarkdownNoteEditor = memo(function MarkdownNoteEditor({
  markdown,
  previewMarkdown,
  mode,
  placeholder,
  accessibilityLabel,
  focusSelection,
  toolbarActions,
  onChangeMarkdown,
  onSelectionChange,
}: MarkdownNoteEditorProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const handledFocusSelectionKeyRef = useRef('');
  const [editingLivePreview, setEditingLivePreview] = useState(false);
  const [programmaticSelection, setProgrammaticSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  const handleSelectionChange = useCallback((event: { nativeEvent: { selection: { start: number; end: number } } }) => {
    setProgrammaticSelection(undefined);
    onSelectionChange?.(event.nativeEvent.selection.start, event.nativeEvent.selection.end);
  }, [onSelectionChange]);

  const handleChangeText = useCallback((nextMarkdown: string) => {
    onChangeMarkdown(nextMarkdown);
  }, [onChangeMarkdown]);

  const focusEditor = useCallback(() => {
    setEditingLivePreview(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const showEditor = mode === 'source' || (mode === 'live' && (editingLivePreview || !markdown.trim()));
  const showToolbar = mode === 'source' || (mode === 'live' && editingLivePreview);
  const sourceEditing = mode === 'source';

  useEffect(() => {
    if (!focusSelection) return;
    const nextSelection = clampSelection(focusSelection, markdown.length);
    const key = `${nextSelection.start}:${nextSelection.end}:${focusSelection.tick}`;
    if (handledFocusSelectionKeyRef.current === key) return;
    handledFocusSelectionKeyRef.current = key;
    setProgrammaticSelection(nextSelection);
    onSelectionChange?.(nextSelection.start, nextSelection.end);
    setEditingLivePreview(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [focusSelection, markdown.length, onSelectionChange]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface.base }]}> 
      {showEditor ? (
        <TextInput
          ref={inputRef}
          value={markdown}
          selection={programmaticSelection}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          onFocus={() => setEditingLivePreview(true)}
          onBlur={() => setEditingLivePreview(false)}
          multiline
          textAlignVertical="top"
          autoCapitalize={sourceEditing ? 'none' : 'sentences'}
          autoCorrect={!sourceEditing}
          spellCheck={!sourceEditing}
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          style={[styles.input, { color: colors.text.primary }]}
        />
      ) : (
        <Pressable style={styles.previewShell} onPress={mode === 'live' ? focusEditor : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.previewContent}
            showsVerticalScrollIndicator={false}
          >
            {markdown.trim() ? (
              <MarkdownView content={previewMarkdown ?? markdown} />
            ) : (
              <View style={styles.emptyPreview}>
                <Icon source="file-document-outline" size={32} color={colors.text.tertiary} />
                <Text style={{ color: colors.text.tertiary }}>{placeholder}</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      )}

      {showToolbar ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={[styles.toolbar, { backgroundColor: colors.surface.base }]}> 
          <BlockInsertBar actions={toolbarActions} />
        </KeyboardStickyView>
      ) : null}
    </View>
  );
});

function clampSelection(selection: { start: number; end: number }, length: number) {
  const start = Math.max(0, Math.min(selection.start, length));
  const end = Math.max(0, Math.min(selection.end, length));
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: INSERT_BAR_HEIGHT + 32,
    fontSize: 16,
    lineHeight: 24,
  },
  previewShell: {
    flex: 1,
  },
  previewContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  emptyPreview: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
