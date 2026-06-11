import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import type { UnifiedEditor } from './types';

export interface EditorActionBarProps {
  editor: UnifiedEditor | null;
}

interface ActionItem {
  id: string;
  icon: string;
  action: (editor: UnifiedEditor) => void;
}

export const EditorActionBar = memo(function EditorActionBar({
  editor,
}: EditorActionBarProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const actions = useMemo<ActionItem[]>(() => [
    { id: 'bold', icon: 'format-bold', action: (e) => e.toggleBold() },
    { id: 'italic', icon: 'format-italic', action: (e) => e.toggleItalic() },
    { id: 'strike', icon: 'format-strikethrough', action: (e) => e.toggleStrike() },
    { id: 'code', icon: 'code-tags', action: (e) => e.toggleCode() },
    { id: 'heading', icon: 'format-header-2', action: (e) => e.toggleHeading(2) },
    { id: 'bullet', icon: 'format-list-bulleted', action: (e) => e.toggleBulletList() },
    { id: 'number', icon: 'format-list-numbered', action: (e) => e.toggleOrderedList() },
    { id: 'task', icon: 'checkbox-marked-outline', action: (e) => e.toggleTaskList() },
    { id: 'quote', icon: 'format-quote-close', action: (e) => e.toggleBlockquote() },
    { id: 'codeblock', icon: 'code-braces', action: (e) => e.toggleCodeBlock() },
    { id: 'divider', icon: 'minus', action: (e) => e.setHorizontalRule() },
    { id: 'undo', icon: 'undo', action: (e) => e.undo() },
    { id: 'redo', icon: 'redo', action: (e) => e.redo() },
  ], []);

  const handlePress = useCallback((item: ActionItem) => {
    if (!editor) return;
    item.action(editor);
    editor.focus();
  }, [editor]);

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface.panel, borderTopColor: colors.border.subtle }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {actions.map((item) => (
          <Pressable
            key={item.id}
            style={styles.actionBtn}
            onPress={() => handlePress(item)}
          >
            <Icon
              source={item.icon}
              size={18}
              color={colors.text.secondary}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  scrollContent: {
    gap: 2,
    paddingHorizontal: 4,
  },
  actionBtn: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
