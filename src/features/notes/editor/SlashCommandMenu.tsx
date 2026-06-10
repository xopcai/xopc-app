import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { NoteBlockType } from '../note-blocks';
import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';

export interface SlashCommandItem {
  type: NoteBlockType;
  label: string;
  icon: string;
  keywords: string[];
}

export interface SlashCommandMenuProps {
  visible: boolean;
  onSelect: (type: NoteBlockType) => void;
  onDismiss: () => void;
}

export const SlashCommandMenu = memo(function SlashCommandMenu({
  visible,
  onSelect,
  onDismiss,
}: SlashCommandMenuProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;
  const [filter, setFilter] = useState('');

  const commands = useMemo<SlashCommandItem[]>(() => [
    { type: 'paragraph', label: pm.editorBlockParagraph, icon: 'text', keywords: ['text', 'paragraph', '正文', 'p'] },
    { type: 'heading', label: pm.editorBlockHeading, icon: 'format-header-2', keywords: ['heading', 'h1', 'h2', 'h3', '标题', 'title'] },
    { type: 'todo', label: pm.editorBlockTodo, icon: 'checkbox-marked-outline', keywords: ['todo', 'task', 'checkbox', '待办', 'check'] },
    { type: 'bulletList', label: pm.editorBlockBulletList, icon: 'format-list-bulleted', keywords: ['bullet', 'list', 'ul', '列表'] },
    { type: 'numberedList', label: pm.editorBlockNumberedList, icon: 'format-list-numbered', keywords: ['number', 'ordered', 'ol', '编号', 'numbered'] },
    { type: 'quote', label: pm.editorBlockQuote, icon: 'format-quote-close', keywords: ['quote', 'blockquote', '引用'] },
    { type: 'code', label: pm.editorBlockCode, icon: 'code-tags', keywords: ['code', 'snippet', '代码'] },
    { type: 'divider', label: pm.editorBlockDivider, icon: 'minus', keywords: ['divider', 'hr', 'line', '分割线', '分隔'] },
  ], [pm]);

  const filtered = useMemo(() => {
    if (!filter) return commands;
    const query = filter.toLowerCase();
    return commands.filter((command) =>
      command.label.toLowerCase().includes(query) ||
      command.keywords.some((keyword) => keyword.includes(query)),
    );
  }, [commands, filter]);

  const handleSelect = useCallback((type: NoteBlockType) => {
    setFilter('');
    onSelect(type);
  }, [onSelect]);

  const handleDismiss = useCallback(() => {
    setFilter('');
    onDismiss();
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <View style={[styles.menu, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}>
        <View style={[styles.searchRow, { borderBottomColor: colors.border.subtle }]}>
          <Icon source="magnify" size={16} color={colors.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text.primary }]}
            value={filter}
            onChangeText={setFilter}
            placeholder={pm.editorSlashFilter}
            placeholderTextColor={colors.text.tertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (filtered.length > 0) handleSelect(filtered[0].type);
            }}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.type}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: colors.accent.selectionBg },
              ]}
              onPress={() => handleSelect(item.type)}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surface.input }]}>
                <Icon source={item.icon} size={18} color={colors.text.secondary} />
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 14 }}>{item.label}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>{pm.editorSlashNoMatch}</Text>
            </View>
          }
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menu: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 280,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  list: {
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
});
