import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { Checkbox, Icon, Menu, Text } from 'react-native-paper';

import {
  createTextBlock,
  createTodoBlock,
  normalizeBlocks,
  type NoteBlock,
  type NoteBlockType,
  type TextNoteBlock,
} from '../note-blocks';
import { detectMarkdownShortcut, detectSlashCommand } from './markdown-shortcuts';
import { FloatingToolbar } from './FloatingToolbar';
import { detectActiveFormats, toggleInlineFormat, type InlineFormat } from './inline-format';
import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';

export interface NoteBlockEditorProps {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  onFocusBlock?: (blockId: string) => void;
  /** Called when user wants to send a todo item to Chat for task breakdown. */
  onSendToChat?: (text: string) => void;
  /** Request opening the slash command menu from the action bar. */
  onRequestSlashMenu?: () => void;
  /** Called whenever the editor handle changes so parent can wire up the action bar. */
  onHandleChange?: (handle: NoteBlockEditorHandle) => void;
}

/** Exposed imperative handle for parent to query active block state. */
export interface NoteBlockEditorHandle {
  activeBlockType: NoteBlockType | null;
  convertActiveBlock: (type: NoteBlockType) => void;
  insertAfterActive: () => void;
}

export const NoteBlockEditor = memo(function NoteBlockEditor({
  blocks,
  onChange,
  onFocusBlock,
  onSendToChat,
  onRequestSlashMenu,
  onHandleChange,
}: NoteBlockEditorProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id ?? '');
  const [menuBlockId, setMenuBlockId] = useState<string | null>(null);
  /** Block ID being moved — when set, shows drop targets between blocks */
  const [movingBlockId, setMovingBlockId] = useState<string | null>(null);
  /** Block ID for Turn Into sub-menu */
  const [turnIntoBlockId, setTurnIntoBlockId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  /** Track cursor position per block for Enter-to-split */
  const cursorPositions = useRef<Record<string, number>>({});
  /** Track full selection range per block for floating toolbar */
  const selectionRanges = useRef<Record<string, { start: number; end: number }>>({});
  /** Whether the floating toolbar should be visible */
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  /** Active inline formats for the current selection */
  const [activeInlineFormats, setActiveInlineFormats] = useState<Set<InlineFormat>>(new Set());

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
    // Focus the new block after render
    setTimeout(() => inputRefs.current[nextBlock.id]?.focus(), 50);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((blockId: string) => {
    if (blocks.length <= 1) return;
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

  /** Move a block to a specific index (used by tap-to-move mode). */
  const moveBlockToIndex = useCallback((blockId: string, targetIndex: number) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;
    const reordered = [...blocks];
    const [moved] = reordered.splice(sourceIndex, 1);
    // Adjust target if source was before target
    const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    reordered.splice(adjustedTarget, 0, moved);
    onChange(reordered);
    setMovingBlockId(null);
  }, [blocks, onChange]);

  const startMovingBlock = useCallback((blockId: string) => {
    setMenuBlockId(null);
    setMovingBlockId(blockId);
  }, []);

  const cancelMoving = useCallback(() => {
    setMovingBlockId(null);
  }, []);

  /** Duplicate a block right after it. */
  const duplicateBlock = useCallback((blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    const original = blocks[index];
    const now = Date.now();
    const cloned = { ...original, id: `block_${now}_${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now } as NoteBlock;
    const nextBlocks = [...blocks.slice(0, index + 1), cloned, ...blocks.slice(index + 1)];
    onChange(normalizeBlocks(nextBlocks));
    setMenuBlockId(null);
  }, [blocks, onChange]);

  /** Turn Into block types for sub-menu */
  const turnIntoTypes = useMemo(() => [
    { type: 'paragraph' as NoteBlockType, label: pm.editorBlockParagraph, icon: 'text' },
    { type: 'heading' as NoteBlockType, label: pm.editorBlockHeading, icon: 'format-header-2' },
    { type: 'todo' as NoteBlockType, label: pm.editorBlockTodo, icon: 'checkbox-marked-outline' },
    { type: 'bulletList' as NoteBlockType, label: pm.editorBlockBulletList, icon: 'format-list-bulleted' },
    { type: 'numberedList' as NoteBlockType, label: pm.editorBlockNumberedList, icon: 'format-list-numbered' },
    { type: 'quote' as NoteBlockType, label: pm.editorBlockQuote, icon: 'format-quote-close' },
    { type: 'code' as NoteBlockType, label: pm.editorBlockCode, icon: 'code-tags' },
    { type: 'divider' as NoteBlockType, label: pm.editorBlockDivider, icon: 'minus' },
  ], [pm]);

  /** Merge current block's text into the previous block and delete current. */
  const mergeBlockIntoPrevious = useCallback((blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index <= 0) return;
    const currentBlock = blocks[index];
    const previousBlock = blocks[index - 1];
    if (currentBlock.type === 'divider' || previousBlock.type === 'divider') {
      // Just delete the current divider or skip if previous is divider
      deleteBlock(blockId);
      setActiveBlockId(previousBlock.id);
      setTimeout(() => inputRefs.current[previousBlock.id]?.focus(), 50);
      return;
    }
    const currentText = currentBlock.text ?? '';
    const previousText = previousBlock.type === 'todo' ? previousBlock.text : previousBlock.text ?? '';
    const mergedText = previousText + currentText;
    const cursorTarget = previousText.length;
    // Update previous block text and delete current
    const nextBlocks = blocks
      .map((block) => {
        if (block.id !== previousBlock.id) return block;
        return { ...block, text: mergedText, updatedAt: Date.now() } as NoteBlock;
      })
      .filter((block) => block.id !== blockId);
    onChange(normalizeBlocks(nextBlocks));
    setActiveBlockId(previousBlock.id);
    cursorPositions.current[previousBlock.id] = cursorTarget;
    setTimeout(() => {
      const input = inputRefs.current[previousBlock.id];
      input?.focus();
      // Set cursor position at merge point
      input?.setNativeProps?.({ selection: { start: cursorTarget, end: cursorTarget } });
    }, 50);
  }, [blocks, deleteBlock, onChange]);

  /** Split block at cursor position into two blocks. */
  const splitBlockAtCursor = useCallback((blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    const block = blocks[index];
    if (block.type === 'divider') {
      insertBlockAfter(blockId);
      return;
    }
    const text = block.text ?? '';
    const cursor = cursorPositions.current[blockId] ?? text.length;
    const beforeText = text.slice(0, cursor);
    const afterText = text.slice(cursor);

    // Update current block with text before cursor
    const updatedCurrent = { ...block, text: beforeText, updatedAt: Date.now() } as NoteBlock;
    // Create new block with text after cursor (same type for lists/todos)
    const keepType = block.type === 'todo' || block.type === 'bulletList' || block.type === 'numberedList';
    const newBlock = keepType
      ? (block.type === 'todo' ? createTodoBlock(afterText) : createTextBlock(block.type, afterText))
      : createTextBlock('paragraph', afterText);

    const nextBlocks = [
      ...blocks.slice(0, index),
      updatedCurrent,
      newBlock,
      ...blocks.slice(index + 1),
    ];
    onChange(normalizeBlocks(nextBlocks));
    setActiveBlockId(newBlock.id);
    cursorPositions.current[newBlock.id] = 0;
    setTimeout(() => {
      const input = inputRefs.current[newBlock.id];
      input?.focus();
      input?.setNativeProps?.({ selection: { start: 0, end: 0 } });
    }, 50);
  }, [blocks, insertBlockAfter, onChange]);

  /** Change indent level for list blocks. */
  const indentBlock = useCallback((blockId: string, direction: 'indent' | 'outdent') => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    if (block.type !== 'bulletList' && block.type !== 'numberedList') return;
    const currentIndent = (block as TextNoteBlock).indent ?? 0;
    const nextIndent = direction === 'indent'
      ? Math.min(currentIndent + 1, 3)
      : Math.max(currentIndent - 1, 0);
    if (nextIndent === currentIndent) return;
    updateBlock(blockId, { indent: nextIndent } as Partial<NoteBlock>);
  }, [blocks, updateBlock]);

  const convertBlock = useCallback((blockId: string, type: NoteBlockType, text?: string) => {
    onChange(blocks.map((block) => {
      if (block.id !== blockId) return block;
      const blockText = text ?? (block.type === 'divider' ? '' : block.text);
      if (type === 'todo') return { ...createTodoBlock(blockText), id: block.id };
      if (type === 'divider') {
        const now = Date.now();
        return { id: block.id, type: 'divider' as const, createdAt: now, updatedAt: now };
      }
      return { ...createTextBlock(type as Exclude<NoteBlockType, 'todo' | 'divider'>, blockText), id: block.id };
    }));
    setMenuBlockId(null);
  }, [blocks, onChange]);

  const convertActiveBlock = useCallback((type: NoteBlockType) => {
    const targetId = activeBlockId || blocks[0]?.id;
    if (!targetId) return;
    convertBlock(targetId, type);
  }, [activeBlockId, blocks, convertBlock]);

  const insertAfterActive = useCallback(() => {
    const targetId = activeBlockId || blocks[blocks.length - 1]?.id;
    if (targetId) insertBlockAfter(targetId);
  }, [activeBlockId, blocks, insertBlockAfter]);

  // Expose active block state for EditorActionBar
  const activeBlock = useMemo(
    () => blocks.find((block) => block.id === activeBlockId),
    [activeBlockId, blocks],
  );

  // Notify parent about active block state changes for EditorActionBar
  const handleRef = useRef(onHandleChange);
  handleRef.current = onHandleChange;
  const activeBlockType = activeBlock?.type ?? null;

  // biome-ignore lint: intentional — sync handle to parent on each relevant change
  useMemo(() => {
    handleRef.current?.({ activeBlockType, convertActiveBlock, insertAfterActive });
  }, [activeBlockType, convertActiveBlock, insertAfterActive]);

  const handleFocus = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    onFocusBlock?.(blockId);
  }, [onFocusBlock]);

  // ── Keyboard behavior ────────────────────────────────────

  const handleSelectionChange = useCallback((blockId: string, event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = event.nativeEvent.selection;
    cursorPositions.current[blockId] = start;
    selectionRanges.current[blockId] = { start, end };

    // Show floating toolbar when text is selected (start !== end)
    const block = blocks.find((b) => b.id === blockId);
    if (start !== end && block && block.type !== 'divider') {
      const blockText = block.type === 'todo' ? block.text : (block.text ?? '');
      setActiveInlineFormats(detectActiveFormats(blockText, start, end));
      setShowFloatingToolbar(true);
    } else {
      setShowFloatingToolbar(false);
    }
  }, [blocks]);

  // ── Inline formatting ──────────────────────────────────────

  const handleToggleInlineFormat = useCallback((format: InlineFormat) => {
    const block = blocks.find((b) => b.id === activeBlockId);
    if (!block || block.type === 'divider') return;

    const blockText = block.text ?? '';
    const range = selectionRanges.current[activeBlockId] ?? { start: 0, end: 0 };
    const result = toggleInlineFormat(blockText, range.start, range.end, format);

    // Update block text
    updateBlock(activeBlockId, { text: result.text } as Partial<NoteBlock>);

    // Update selection tracking
    selectionRanges.current[activeBlockId] = { start: result.selectionStart, end: result.selectionEnd };
    cursorPositions.current[activeBlockId] = result.selectionStart;

    // Update active formats for the new selection
    setActiveInlineFormats(detectActiveFormats(result.text, result.selectionStart, result.selectionEnd));

    // Restore cursor/selection position after state update
    setTimeout(() => {
      const input = inputRefs.current[activeBlockId];
      input?.setNativeProps?.({ selection: { start: result.selectionStart, end: result.selectionEnd } });
    }, 50);
  }, [activeBlockId, blocks, updateBlock]);

  const handleDismissFloatingToolbar = useCallback(() => {
    setShowFloatingToolbar(false);
  }, []);

  // ── Keyboard behavior ────────────────────────────────────

  const handleKeyPress = useCallback((blockId: string, event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const { key } = event.nativeEvent;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    // Backspace on empty block → merge into previous
    if (key === 'Backspace') {
      const text = block.type === 'divider' ? '' : (block.text ?? '');
      const cursor = cursorPositions.current[blockId] ?? 0;
      if (text.length === 0 || cursor === 0) {
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index > 0) {
          event.preventDefault?.();
          mergeBlockIntoPrevious(blockId);
        }
      }
      return;
    }

    // Tab / Shift+Tab → indent / outdent list blocks
    if (key === 'Tab') {
      event.preventDefault?.();
      // Note: on native, Tab keypress doesn't carry shiftKey easily.
      // We use Tab = indent. Users can outdent via action bar or Shift+Tab on web.
      indentBlock(blockId, 'indent');
      return;
    }
  }, [blocks, indentBlock, mergeBlockIntoPrevious]);

  // ── Markdown shortcut detection ──────────────────────────

  const handleTextChange = useCallback((blockId: string, rawText: string, currentType: NoteBlockType) => {
    // Check for slash command trigger
    const slashQuery = detectSlashCommand(rawText);
    if (slashQuery !== null && currentType === 'paragraph') {
      // Clear the "/" text and open slash menu
      updateBlock(blockId, { text: '' } as Partial<NoteBlock>);
      onRequestSlashMenu?.();
      return;
    }

    // Check for markdown shortcut (only on paragraph blocks)
    const shortcut = detectMarkdownShortcut(rawText, currentType);
    if (shortcut) {
      convertBlock(blockId, shortcut.targetType, shortcut.remainingText);
      return;
    }

    // Normal text update — handle bullet prefix stripping
    const text = currentType === 'bulletList' && rawText.startsWith('• ')
      ? rawText.slice(2)
      : rawText;
    updateBlock(blockId, { text } as Partial<NoteBlock>);
  }, [convertBlock, onRequestSlashMenu, updateBlock]);

  // ── Placeholder text ─────────────────────────────────────

  const getPlaceholder = useCallback((block: NoteBlock, isFirst: boolean): string => {
    if (block.type === 'heading') return pm.editorPlaceholderHeading;
    if (block.type === 'todo') return pm.editorPlaceholderTodo;
    if (isFirst && block.type === 'paragraph') return pm.editorPlaceholderSlash;
    return pm.editorPlaceholderText;
  }, [pm]);

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Floating inline format toolbar */}
      <FloatingToolbar
        visible={showFloatingToolbar && !movingBlockId && !turnIntoBlockId}
        activeFormats={activeInlineFormats}
        onToggleFormat={handleToggleInlineFormat}
        onDismiss={handleDismissFloatingToolbar}
      />

      {/* Moving mode banner */}
      {movingBlockId && (
        <Pressable style={[styles.movingBanner, { backgroundColor: colors.accent.selectionBg }]} onPress={cancelMoving}>
          <Icon source="cursor-move" size={16} color={colors.accent.primary} />
          <Text style={{ color: colors.accent.primary, fontSize: 13, flex: 1 }}>{pm.editorMoveBlock}</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{pm.editorMoveTapCancel}</Text>
        </Pressable>
      )}

      {/* Blocks */}
      <View style={styles.blocks}>
        {blocks.map((block, index) => {
          const isBeingMoved = movingBlockId === block.id;

          return (
            <View key={block.id}>
              {/* Drop target BEFORE this block (only in moving mode, not before the moving block itself) */}
              {movingBlockId && !isBeingMoved && (() => {
                const movingIndex = blocks.findIndex((b) => b.id === movingBlockId);
                // Don't show drop target right before or after the moving block (no-op positions)
                if (index === movingIndex || index === movingIndex + 1) return null;
                return (
                  <Pressable
                    style={[styles.dropTarget, { borderColor: colors.accent.primary }]}
                    onPress={() => moveBlockToIndex(movingBlockId, index)}
                  >
                    <View style={[styles.dropLine, { backgroundColor: colors.accent.primary }]} />
                  </Pressable>
                );
              })()}

              <View
                style={[
                  styles.blockRow,
                  activeBlockId === block.id && !movingBlockId && { backgroundColor: colors.accent.selectionBg, borderRadius: 8 },
                  isBeingMoved && { backgroundColor: colors.accent.selectionBg, borderRadius: 8, opacity: 0.6 },
                ]}
              >
                {/* Block handle */}
                {movingBlockId ? (
                  // In moving mode: block handle is either "being moved" indicator or a drop target
                  <View style={styles.blockHandle}>
                    <Icon
                      source={isBeingMoved ? 'cursor-move' : 'dots-vertical'}
                      size={16}
                      color={isBeingMoved ? colors.accent.primary : colors.text.tertiary}
                    />
                  </View>
                ) : (
                  <View style={styles.handleGroup}>
                    {/* + button — visible only on active block */}
                    {activeBlockId === block.id ? (
                      <Pressable
                        style={styles.addBtn}
                        onPress={() => {
                          insertBlockAfter(block.id);
                          onRequestSlashMenu?.();
                        }}
                        accessibilityLabel={pm.editorAddBlock}
                      >
                        <Icon source="plus" size={14} color={colors.text.tertiary} />
                      </Pressable>
                    ) : (
                      <View style={styles.addBtnSpacer} />
                    )}
                    <Menu
                      visible={menuBlockId === block.id}
                      onDismiss={() => setMenuBlockId(null)}
                      anchor={
                        <Pressable
                          style={styles.blockHandle}
                          onPress={() => setMenuBlockId(block.id)}
                          onLongPress={() => startMovingBlock(block.id)}
                          delayLongPress={300}
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
                    <Menu.Item
                      leadingIcon="swap-horizontal"
                      title={pm.editorTurnInto}
                      onPress={() => { setMenuBlockId(null); setTurnIntoBlockId(block.id); }}
                    />
                    <Menu.Item
                      leadingIcon="content-copy"
                      title={pm.editorDuplicate}
                      onPress={() => duplicateBlock(block.id)}
                    />
                    <Menu.Item
                      leadingIcon="cursor-move"
                      title={pm.editorMoveBlock}
                      onPress={() => startMovingBlock(block.id)}
                    />
                    {blocks.length > 1 && (
                      <Menu.Item
                        leadingIcon="delete-outline"
                        title={pm.editorDeleteBlock}
                        onPress={() => { setMenuBlockId(null); deleteBlock(block.id); }}
                      />
                    )}
                  </Menu>
                  </View>
                )}

            {/* Block content */}
            {block.type === 'todo' ? (
              <View style={styles.todoRow}>
                <Checkbox.Android
                  status={block.checked ? 'checked' : 'unchecked'}
                  onPress={() => updateBlock(block.id, { checked: !block.checked } as Partial<NoteBlock>)}
                  color={colors.accent.primary}
                />
                <TextInput
                  ref={(ref) => { inputRefs.current[block.id] = ref; }}
                  style={[styles.input, styles.flexInput, { color: colors.text.primary }]}
                  value={block.text}
                  onFocus={() => handleFocus(block.id)}
                  onChangeText={(text) => updateBlock(block.id, { text } as Partial<NoteBlock>)}
                  onKeyPress={(e) => handleKeyPress(block.id, e)}
                  onSelectionChange={(e) => handleSelectionChange(block.id, e)}
                  onSubmitEditing={() => splitBlockAtCursor(block.id)}
                  placeholder={getPlaceholder(block, index === 0)}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  blurOnSubmit={false}
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
                ref={(ref) => { inputRefs.current[block.id] = ref; }}
                style={[
                  styles.input,
                  block.type === 'heading' && styles.headingInput,
                  block.type === 'quote' && [styles.quoteInput, { borderLeftColor: colors.accent.primary }],
                  block.type === 'code' && [styles.codeInput, { backgroundColor: colors.surface.input }],
                  (block.type === 'bulletList' || block.type === 'numberedList') && styles.listInput,
                  (block.type === 'bulletList' || block.type === 'numberedList') && (block as TextNoteBlock).indent
                    ? { paddingLeft: 4 + ((block as TextNoteBlock).indent ?? 0) * 20 }
                    : null,
                  { color: colors.text.primary },
                ]}
                value={block.type === 'bulletList' ? `• ${block.text}` : block.text}
                onFocus={() => handleFocus(block.id)}
                onChangeText={(raw) => handleTextChange(block.id, raw, block.type)}
                onKeyPress={(e) => handleKeyPress(block.id, e)}
                onSelectionChange={(e) => handleSelectionChange(block.id, e)}
                onSubmitEditing={() => splitBlockAtCursor(block.id)}
                placeholder={getPlaceholder(block, index === 0)}
                placeholderTextColor={colors.text.tertiary}
                multiline
                blurOnSubmit={false}
                textAlignVertical="top"
              />
            )}
          </View>

              {/* Drop target AFTER the last block */}
              {movingBlockId && index === blocks.length - 1 && !isBeingMoved && (() => {
                const movingIndex = blocks.findIndex((b) => b.id === movingBlockId);
                if (index === movingIndex) return null;
                return (
                  <Pressable
                    style={[styles.dropTarget, { borderColor: colors.accent.primary }]}
                    onPress={() => moveBlockToIndex(movingBlockId, blocks.length)}
                  >
                    <View style={[styles.dropLine, { backgroundColor: colors.accent.primary }]} />
                  </Pressable>
                );
              })()}
            </View>
          );
        })}
      </View>

      {/* Turn Into sub-menu */}
      {turnIntoBlockId && (
        <View style={styles.turnIntoOverlay}>
          <Pressable style={styles.turnIntoBackdrop} onPress={() => setTurnIntoBlockId(null)} />
          <View style={[styles.turnIntoMenu, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }]}>
            <Text style={[styles.turnIntoTitle, { color: colors.text.secondary }]}>{pm.editorTurnInto}</Text>
            <View style={styles.turnIntoGrid}>
              {turnIntoTypes.map((item) => {
                const currentBlock = blocks.find((b) => b.id === turnIntoBlockId);
                const isActive = currentBlock?.type === item.type;
                return (
                  <Pressable
                    key={item.type}
                    style={[
                      styles.turnIntoItem,
                      isActive && { backgroundColor: colors.accent.selectionBg },
                    ]}
                    onPress={() => {
                      convertBlock(turnIntoBlockId, item.type);
                      setTurnIntoBlockId(null);
                    }}
                  >
                    <Icon source={item.icon} size={20} color={isActive ? colors.accent.primary : colors.text.secondary} />
                    <Text style={{ color: isActive ? colors.accent.primary : colors.text.primary, fontSize: 12 }} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  blocks: { gap: 2 },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  blockHandle: {
    width: 24,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  handleGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addBtn: {
    width: 20,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    opacity: 0.6,
  },
  addBtnSpacer: {
    width: 20,
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
  listInput: { paddingLeft: 4 },
  todoRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  flexInput: { minHeight: 42 },
  chatBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, marginVertical: 16 },
  movingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  dropTarget: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  dropLine: {
    height: 2,
    borderRadius: 1,
  },
  turnIntoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    zIndex: 90,
    justifyContent: 'flex-end',
  },
  turnIntoBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  turnIntoMenu: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  turnIntoTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  turnIntoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  turnIntoItem: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    width: '23%' as unknown as number,
  },
});
