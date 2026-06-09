import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Checkbox, Icon, Text } from 'react-native-paper';

import {
  createTextBlock,
  createTodoBlock,
  normalizeBlocks,
  type NoteBlock,
  type NoteBlockType,
} from '../note-blocks';

const BLOCK_TYPES: { type: NoteBlockType; label: string; icon: string }[] = [
  { type: 'paragraph', label: '正文', icon: 'text' },
  { type: 'heading', label: '标题', icon: 'format-header-2' },
  { type: 'todo', label: '待办', icon: 'checkbox-marked-outline' },
  { type: 'bulletList', label: '列表', icon: 'format-list-bulleted' },
  { type: 'quote', label: '引用', icon: 'format-quote-close' },
  { type: 'code', label: '代码', icon: 'code-tags' },
];

export interface NoteBlockEditorProps {
  blocks: NoteBlock[];
  isDark: boolean;
  onChange: (blocks: NoteBlock[]) => void;
  onFocusBlock?: (blockId: string) => void;
}

export const NoteBlockEditor = memo(function NoteBlockEditor({
  blocks,
  isDark,
  onChange,
  onFocusBlock,
}: NoteBlockEditorProps) {
  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id ?? '');
  const textColor = isDark ? '#E5E7EB' : '#1C1C1E';
  const mutedColor = '#8E8E93';
  const surface = isDark ? '#1C1C1E' : '#FFFFFF';
  const border = isDark ? '#3A3A3C' : '#E5E5EA';

  const updateBlock = useCallback((blockId: string, patch: Partial<NoteBlock>) => {
    onChange(normalizeBlocks(blocks.map((block) => {
      if (block.id !== blockId) return block;
      return { ...block, ...patch, id: block.id, updatedAt: Date.now() } as NoteBlock;
    })));
  }, [blocks, onChange]);

  const insertBlockAfter = useCallback((blockId: string, type: NoteBlockType = 'paragraph') => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const nextBlock = type === 'todo' ? createTodoBlock() : createTextBlock(type as Exclude<NoteBlockType, 'todo' | 'divider'>);
    const nextBlocks = index === -1
      ? [...blocks, nextBlock]
      : [...blocks.slice(0, index + 1), nextBlock, ...blocks.slice(index + 1)];
    onChange(normalizeBlocks(nextBlocks));
    setActiveBlockId(nextBlock.id);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((blockId: string) => {
    const nextBlocks = normalizeBlocks(blocks.filter((block) => block.id !== blockId));
    onChange(nextBlocks);
    setActiveBlockId(nextBlocks[0]?.id ?? '');
  }, [blocks, onChange]);

  const convertActiveBlock = useCallback((type: NoteBlockType) => {
    const targetId = activeBlockId || blocks[0]?.id;
    if (!targetId) return;
    onChange(blocks.map((block) => {
      if (block.id !== targetId) return block;
      const text = block.type === 'divider' ? '' : block.text;
      if (type === 'todo') return { ...createTodoBlock(text), id: block.id };
      return { ...createTextBlock(type as Exclude<NoteBlockType, 'todo' | 'divider'>, text), id: block.id };
    }));
  }, [activeBlockId, blocks, onChange]);

  const handleFocus = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    onFocusBlock?.(blockId);
  }, [onFocusBlock]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
        {BLOCK_TYPES.map((item) => (
          <Pressable
            key={item.type}
            style={[styles.toolbarChip, { backgroundColor: surface, borderColor: border }]}
            onPress={() => convertActiveBlock(item.type)}
          >
            <Icon source={item.icon} size={16} color={mutedColor} />
            <Text style={{ color: textColor, fontSize: 12 }}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.blocks}>
        {blocks.map((block) => (
          <View key={block.id} style={styles.blockRow}>
            <Pressable style={styles.blockHandle} onPress={() => insertBlockAfter(block.id)} onLongPress={() => deleteBlock(block.id)}>
              <Icon source="plus" size={16} color={mutedColor} />
            </Pressable>

            {block.type === 'todo' ? (
              <View style={styles.todoRow}>
                <Checkbox.Android
                  status={block.checked ? 'checked' : 'unchecked'}
                  onPress={() => updateBlock(block.id, { checked: !block.checked } as Partial<NoteBlock>)}
                />
                <TextInput
                  style={[styles.input, styles.flexInput, { color: textColor }]}
                  value={block.text}
                  onFocus={() => handleFocus(block.id)}
                  onChangeText={(text) => updateBlock(block.id, { text } as Partial<NoteBlock>)}
                  onSubmitEditing={() => insertBlockAfter(block.id)}
                  placeholder="待办事项"
                  placeholderTextColor={mutedColor}
                  multiline
                />
              </View>
            ) : block.type === 'divider' ? (
              <View style={[styles.divider, { backgroundColor: border }]} />
            ) : (
              <TextInput
                style={[
                  styles.input,
                  block.type === 'heading' && styles.headingInput,
                  block.type === 'quote' && [styles.quoteInput, { borderLeftColor: border }],
                  block.type === 'code' && [styles.codeInput, { backgroundColor: surface }],
                  { color: textColor },
                ]}
                value={block.text}
                onFocus={() => handleFocus(block.id)}
                onChangeText={(text) => updateBlock(block.id, { text } as Partial<NoteBlock>)}
                onSubmitEditing={() => insertBlockAfter(block.id)}
                placeholder={block.type === 'heading' ? '标题' : '输入内容'}
                placeholderTextColor={mutedColor}
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
  toolbar: { gap: 8, paddingBottom: 12 },
  toolbarChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  blocks: { gap: 4 },
  blockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  blockHandle: { width: 28, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 15, lineHeight: 22, paddingVertical: 6, paddingHorizontal: 0 },
  headingInput: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  quoteInput: { borderLeftWidth: 3, paddingLeft: 10, fontStyle: 'italic' },
  codeInput: { borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Menlo' },
  todoRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  flexInput: { minHeight: 42 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, marginVertical: 16 },
});
