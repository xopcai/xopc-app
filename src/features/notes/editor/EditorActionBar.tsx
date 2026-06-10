import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { NoteBlockType } from '../note-blocks';
import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';

export interface EditorActionBarProps {
  activeBlockType: NoteBlockType | null;
  onConvertBlock: (type: NoteBlockType) => void;
  onInsertBlock: () => void;
  onOpenSlashMenu: () => void;
}

interface ActionItem {
  type: NoteBlockType | 'add' | 'slash';
  label: string;
  icon: string;
  action: 'convert' | 'insert' | 'slash';
}

export const EditorActionBar = memo(function EditorActionBar({
  activeBlockType,
  onConvertBlock,
  onInsertBlock,
  onOpenSlashMenu,
}: EditorActionBarProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const actions = useMemo<ActionItem[]>(() => [
    { type: 'add', label: pm.editorAddBlock, icon: 'plus', action: 'insert' },
    { type: 'slash', label: '/', icon: 'slash-forward', action: 'slash' },
    { type: 'paragraph', label: pm.editorBlockParagraph, icon: 'text', action: 'convert' },
    { type: 'heading', label: pm.editorBlockHeading, icon: 'format-header-2', action: 'convert' },
    { type: 'todo', label: pm.editorBlockTodo, icon: 'checkbox-marked-outline', action: 'convert' },
    { type: 'bulletList', label: pm.editorBlockBulletList, icon: 'format-list-bulleted', action: 'convert' },
    { type: 'quote', label: pm.editorBlockQuote, icon: 'format-quote-close', action: 'convert' },
    { type: 'code', label: pm.editorBlockCode, icon: 'code-tags', action: 'convert' },
  ], [pm]);

  const handlePress = (item: ActionItem) => {
    if (item.action === 'insert') {
      onInsertBlock();
    } else if (item.action === 'slash') {
      onOpenSlashMenu();
    } else {
      onConvertBlock(item.type as NoteBlockType);
    }
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface.panel, borderTopColor: colors.border.subtle }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {actions.map((item) => {
          const isActive = item.action === 'convert' && activeBlockType === item.type;
          return (
            <Pressable
              key={item.type}
              style={[
                styles.actionBtn,
                isActive && { backgroundColor: colors.accent.selectionBg },
              ]}
              onPress={() => handlePress(item)}
            >
              <Icon
                source={item.icon}
                size={18}
                color={isActive ? colors.accent.primary : colors.text.secondary}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: isActive ? colors.accent.primary : colors.text.secondary },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
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
    gap: 4,
    paddingHorizontal: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionLabel: {
    fontSize: 12,
  },
});
