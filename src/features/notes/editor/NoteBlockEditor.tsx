import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Checkbox, Icon, Menu, Text } from 'react-native-paper';

import {
  createTextBlock,
  createTodoBlock,
  normalizeBlocks,
  type NoteBlock,
  type NoteBlockType,
} from '../note-blocks';
import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';

export interface NoteBlockEditorProps {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  onFocusBlock?: (blockId: string) => void;
  /** Called when user wants to send a todo item to Chat for task breakdown. */
  onSendToChat?: (text: string) => void;
}

export const NoteBlockEditor = memo(function NoteBlockEditor({
  blocks,
  onChange,
  onFocusBlock,
  onSendToChat,
}: NoteBlockEditorProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id ?? '');
  const [menuBlockId, setMenuBlockId] = useState<string | null>(null);

  const blockTypes = useMemo(() => [
    { type: 'paragraph' as NoteBlockType, label: pm.editorBlockParagraph, icon: 'text' },
    { type: 'heading' as NoteBlockType, label: pm.editorBlockHeading, icon: 'format-header-2' },
    { type: 'todo' as NoteBlockType, label: pm.editorBlockTodo, icon: 'checkbox-marked-outline' },
    { type: 'bulletList' as NoteBlockType, label: pm.editorBlockBulletList, icon: 'format-list-bulleted' },
    { type: 'quote' as NoteBlockType, label: pm.editorBlockQuote, icon: 'format-quote-close' },
    { type: 'code' as NoteBlockType, label: pm.editorBlockCode, icon: 'code-tags' },
  ], [pm]);

  // ── Block operations ─────────────────────────────────────

  const updateBlock = useCallback((blockId: string, patch: Partial<NoteBlock>) => {
    onChange(normalizeBlocks(blocks.map((block) => {
      if (block.id !== blockId) return block;
      return { ...block, ...patch, id: block.id, updatedAt: Date.now() } as NoteBlock;
    })));
  }, [blocks, onChange]);

  const insertBlockAfter = useCallback((blockId: string, type: NoteBlockType = 'paragraph') => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const nextBlock = type === 'todo'
      ? createTodoBlock()
      : createTextBlock(type as Exclude<NoteBlockType, 'todo' | 'divider'>);
    const nextBlocks = index === -1
      ? [...blocks, nextBlock]
      : [...blocks.slice(0, index + 1), nextBlock, ...blocks.slice(index + 1)];
    onChange(normalizeBlocks(nextBlocks));
    setActiveBlockId(nextBlock.id);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((blockId: string) => {
    if (blocks.length <= 1) return; // Don't delete last block
    const nextBlocks = normalizeBlocks(blocks.filter((block) => block.id !== blockId));
    onChange(nextBlocks);
    setActiveBlockId(nextBlocks[0]?.id ?? '');
  }, [blocks, onChange]);

  const moveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...blocks];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    onChange(reordered);
  }, [blocks, onChange]);

  const convertBlock = useCallback((blockId: string, type: NoteBlockType) => {
    onChange(blocks.map((block) => {
      if (block.id !== blockId) return block;
      const text = block.type === 'divider' ? '' : block.text;
      if (type === 'todo') return { ...createTodoBlock(text), id: block.id };
      return { ...createTextBlock(type as Exclude<NoteBlockType, 'todo' | 'divider'>, text), id: block.id };
    }));
    setMenuBlockId(null);
  }, [blocks, onChange]);

  const convertActiveBlock = useCallback((type: NoteBlockType) => {
    const targetId = activeBlockId || blocks[0]?.id;
    if (!targetId) return;
    convertBlock(targetId, type);
  }, [activeBlockId, blocks, convertBlock]);

  const handleFocus = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    onFocusBlock?.(blockId);
  }, [onFocusBlock]);

  // ── Placeholder text ─────────────────────────────────────

  const getPlaceholder = useCallback((block: NoteBlock): string => {
    if (block.type === 'heading') return pm.editorPlaceholderHeading;
    if (block.type === 'todo') return pm.editorPlaceholderTodo;
    return pm.editorPlaceholderText;
  }, [pm]);

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Toolbar — block type conversion chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
        {blockTypes.map((item) => (
          <Pressable
            key={item.type}
            style={[styles.toolbarChip, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}
            onPress={() => convertActiveBlock(item.type)}
          >
            <Icon source={item.icon} size={16} color={colors.text.tertiary} />
            <Text style={{ color: colors.text.primary, fontSize: 12 }}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Blocks */}
      <View style={styles.blocks}>
        {blocks.map((block, index) => (
          <View
            key={block.id}
            style={[
              styles.blockRow,
              activeBlockId === block.id && { backgroundColor: colors.accent.selectionBg, borderRadius: 8 },
            ]}
          >
            {/* Block handle — opens context menu */}
            <Menu
              visible={menuBlockId === block.id}
              onDismiss={() => setMenuBlockId(null)}
              anchor={
                <Pressable
                  style={styles.blockHandle}
                  onPress={() => setMenuBlockId(block.id)}
                  accessibilityLabel={pm.editorAddBlock}
                >
                  <Icon source="dots-vertical" size={16} color={colors.text.tertiary} />
                </Pressable>
              }
            >
              <Menu.Item
                leadingIcon="plus"
                title={pm.editorAddBlock}
                onPress={() => { setMenuBlockId(null); insertBlockAfter(block.id); }}
              />
              {index > 0 && (
                <Menu.Item
                  leadingIcon="arrow-up"
                  title="↑"
                  onPress={() => { setMenuBlockId(null); moveBlock(block.id, 'up'); }}
                />
              )}
              {index < blocks.length - 1 && (
                <Menu.Item
                  leadingIcon="arrow-down"
                  title="↓"
                  onPress={() => { setMenuBlockId(null); moveBlock(block.id, 'down'); }}
                />
              )}
              {blocks.length > 1 && (
                <Menu.Item
                  leadingIcon="delete-outline"
                  title={pm.editorDeleteBlock}
                  onPress={() => { setMenuBlockId(null); deleteBlock(block.id); }}
                />
              )}
            </Menu>

            {/* Block content */}
            {block.type === 'todo' ? (
              <View style={styles.todoRow}>
                <Checkbox.Android
                  status={block.checked ? 'checked' : 'unchecked'}
                  onPress={() => updateBlock(block.id, { checked: !block.checked } as Partial<NoteBlock>)}
                  color={colors.accent.primary}
                />
                <TextInput
                  style={[styles.input, styles.flexInput, { color: colors.text.primary }]}
                  value={block.text}
                  onFocus={() => handleFocus(block.id)}
                  onChangeText={(text) => updateBlock(block.id, { text } as Partial<NoteBlock>)}
                  onSubmitEditing={() => insertBlockAfter(block.id, 'todo')}
                  placeholder={getPlaceholder(block)}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                />
                {onSendToChat && block.text.trim().length > 0 && (
                  <Pressable
                    style={styles.chatBtn}
                    onPress={() => onSendToChat(block.text)}
                    accessibilityLabel={pm.editorSendToChat}
                  >
                    <Icon source="chat-processing-outline" size={16} color={colors.accent.primary} />
                  </Pressable>
                )}
              </View>
            ) : block.type === 'divider' ? (
              <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
            ) : (
              <TextInput
                style={[
                  styles.input,
                  block.type === 'heading' && styles.headingInput,
                  block.type === 'quote' && [styles.quoteInput, { borderLeftColor: colors.accent.primary }],
                  block.type === 'code' && [styles.codeInput, { backgroundColor: colors.surface.input }],
                  block.type === 'bulletList' && styles.bulletInput,
                  { color: colors.text.primary },
                ]}
                value={block.type === 'bulletList' ? `• ${block.text}` : block.text}
                onFocus={() => handleFocus(block.id)}
                onChangeText={(raw) => {
                  const text = block.type === 'bulletList' && raw.startsWith('• ')
                    ? raw.slice(2)
                    : raw;
                  updateBlock(block.id, { text } as Partial<NoteBlock>);
                }}
                onSubmitEditing={() => insertBlockAfter(block.id, block.type as NoteBlockType)}
                placeholder={getPlaceholder(block)}
                placeholderTextColor={colors.text.tertiary}
                multiline
                textAlignVertical="top"
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { gap: 8, paddingBottom: 12, paddingHorizontal: 4 },
  toolbarChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  blocks: { gap: 2 },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  blockHandle: {
    width: 28,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 6,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
  },
  headingInput: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  quoteInput: { borderLeftWidth: 3, paddingLeft: 10, fontStyle: 'italic' },
  codeInput: { borderRadius: 8, paddingHorizontal: 10, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  bulletInput: { paddingLeft: 4 },
  todoRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  flexInput: { minHeight: 42 },
  chatBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, marginVertical: 16 },
});
