import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTheme } from '../../../theme';
import type { UnifiedEditor } from './types';

export interface EditorActionBarProps {
  editor: UnifiedEditor | null;
  onAiPress?: () => void;
  onSlashPress?: () => void;
  onVoicePress?: () => void;
  voiceActive?: boolean;
  voiceDisabled?: boolean;
  voiceLabel?: string;
  onImagePress?: () => void;
  onAttachmentPress?: () => void;
  insertDisabled?: boolean;
  imageLabel?: string;
  attachmentLabel?: string;
}

interface ActionItem {
  id: string;
  icon: string;
  action: (editor: UnifiedEditor) => void;
}

export const EditorActionBar = memo(function EditorActionBar({
  editor,
  onAiPress,
  onSlashPress,
  onVoicePress,
  voiceActive = false,
  voiceDisabled = false,
  voiceLabel,
  onImagePress,
  onAttachmentPress,
  insertDisabled = false,
  imageLabel,
  attachmentLabel,
}: EditorActionBarProps) {
  const { colors } = useTheme();
  const disabled = !editor;

  const actions = useMemo<ActionItem[]>(() => [
    { id: 'bold', icon: 'format-bold', action: (e) => e.toggleBold() },
    { id: 'italic', icon: 'format-italic', action: (e) => e.toggleItalic() },
    { id: 'strike', icon: 'format-strikethrough', action: (e) => e.toggleStrike() },
    { id: 'code', icon: 'code-tags', action: (e) => e.toggleCode() },
    { id: 'h1', icon: 'format-header-1', action: (e) => e.toggleHeading(1) },
    { id: 'h2', icon: 'format-header-2', action: (e) => e.toggleHeading(2) },
    { id: 'h3', icon: 'format-header-3', action: (e) => e.toggleHeading(3) },
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
        {onSlashPress && (
          <Pressable style={styles.actionBtn} onPress={onSlashPress}>
            <Icon source="slash-forward" size={20} color={colors.accent.primary} />
          </Pressable>
        )}
        {onImagePress && (
          <Pressable
            style={[styles.actionBtn, insertDisabled && styles.disabled]}
            onPress={onImagePress}
            disabled={insertDisabled}
            accessibilityRole="button"
            accessibilityLabel={imageLabel}
          >
            <Icon
              source="image-outline"
              size={20}
              color={insertDisabled ? colors.text.tertiary : colors.accent.primary}
            />
          </Pressable>
        )}
        {onAttachmentPress && (
          <Pressable
            style={[styles.actionBtn, insertDisabled && styles.disabled]}
            onPress={onAttachmentPress}
            disabled={insertDisabled}
            accessibilityRole="button"
            accessibilityLabel={attachmentLabel}
          >
            <Icon
              source="paperclip"
              size={20}
              color={insertDisabled ? colors.text.tertiary : colors.accent.primary}
            />
          </Pressable>
        )}
        {onVoicePress && (
          <Pressable
            style={[styles.actionBtn, voiceDisabled && styles.disabled]}
            onPress={onVoicePress}
            disabled={voiceDisabled}
            accessibilityRole="button"
            accessibilityLabel={voiceLabel}
          >
            <Icon
              source={voiceActive ? 'stop' : 'microphone-outline'}
              size={20}
              color={voiceActive ? '#FF3B30' : voiceDisabled ? colors.text.tertiary : colors.accent.primary}
            />
          </Pressable>
        )}
        {onAiPress && (
          <Pressable style={styles.actionBtn} onPress={onAiPress}>
            <Icon source="creation-outline" size={20} color={colors.accent.primary} />
          </Pressable>
        )}
        {actions.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.actionBtn, disabled && styles.disabled]}
            onPress={() => handlePress(item)}
            disabled={disabled}
          >
            <Icon
              source={item.icon}
              size={18}
              color={disabled ? colors.text.tertiary : colors.text.secondary}
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
  disabled: {
    opacity: 0.45,
  },
});
