import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Checkbox, Icon, Text } from 'react-native-paper';

import type { NoteBlock } from '../../../query/notes';
import { useTheme } from '../../../theme';
import { NOTE_EDITOR_HORIZONTAL_INSET } from './note-layout';

export interface BlockRowProps {
  block: NoteBlock;
  listIndex: number;
  depth?: number;
  placeholder?: string;
  inputRef?: RefObject<View | null>;
  imageUri?: string;
  selected?: boolean;
  shouldFocus?: number;
  onFocusRequestHandled?: (blockId: string) => void;
  onChangeText: (blockId: string, text: string) => void;
  onToggleTodo: (blockId: string, checked: boolean) => void;
  onSubmitNewBlock: (blockId: string) => void;
  onBackspaceEmpty: (blockId: string) => void;
  onSelectionChange?: (blockId: string, start: number, end: number) => void;
  onOpenBlockMenu?: (blockId: string) => void;
  onToggleBlockSelection?: (blockId: string) => void;
  onFocus?: (blockId: string) => void;
}

export const BlockRow = memo(function BlockRow({
  block,
  listIndex,
  depth = 0,
  placeholder,
  inputRef,
  imageUri,
  selected = false,
  shouldFocus,
  onFocusRequestHandled,
  onChangeText,
  onToggleTodo,
  onSubmitNewBlock,
  onBackspaceEmpty,
  onSelectionChange,
  onOpenBlockMenu,
  onToggleBlockSelection,
  onFocus,
}: BlockRowProps) {
  const { colors } = useTheme();
  const focusedRef = useRef(false);
  const [text, setText] = useState(() => ('text' in block ? block.text : ''));

  useEffect(() => {
    if (focusedRef.current) return;
    setText('text' in block ? block.text : '');
  }, [block.id, block.updatedAt]);

  useEffect(() => {
    if (shouldFocus == null) return;
    onFocusRequestHandled?.(block.id);
    const input = inputRef?.current as { focus?: () => void } | null | undefined;
    input?.focus?.();
  }, [block.id, inputRef, onFocusRequestHandled, shouldFocus]);

  if (block.type === 'divider') {
    return (
      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
      </View>
    );
  }

  if (block.type === 'image') {
    return (
      <View style={styles.imageRow}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={block.alt || block.attachmentId}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
            <Text style={{ color: colors.text.tertiary }}>{block.alt?.trim() || block.attachmentId}</Text>
          </View>
        )}
      </View>
    );
  }

  const isHeading = block.type === 'heading';
  const isQuote = block.type === 'quote';
  const isCallout = block.type === 'callout';
  const isToggle = block.type === 'toggle';
  const isCode = block.type === 'code';
  const isList = block.type === 'bulletList' || block.type === 'numberedList';

  const prefix = block.type === 'bulletList'
    ? '• '
    : block.type === 'numberedList'
      ? `${listIndex + 1}. `
      : isQuote || isCallout
        ? '❝ '
        : isToggle
          ? '› '
        : '';

  const sharedInputProps = {
    ref: inputRef as RefObject<TextInput>,
    value: text,
    onChangeText: (nextText: string) => {
      setText(nextText);
      onChangeText(block.id, nextText);
    },
    onFocus: () => {
      focusedRef.current = true;
      onFocus?.(block.id);
    },
    onBlur: () => {
      focusedRef.current = false;
    },
    onSubmitEditing: () => onSubmitNewBlock(block.id),
    onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => {
      onSelectionChange?.(block.id, event.nativeEvent.selection.start, event.nativeEvent.selection.end);
    },
    onKeyPress: (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key === 'Backspace' && text.length === 0) {
        onBackspaceEmpty(block.id);
      }
    },
    placeholder,
    placeholderTextColor: colors.text.tertiary,
    multiline: !isHeading,
    style: [
      styles.input,
      isHeading && styles.headingInput,
      isCode && styles.codeInput,
      { color: colors.text.primary },
    ],
  };

  if (block.type === 'todo') {
    return (
      <View
        style={[
          styles.row,
          { paddingLeft: NOTE_EDITOR_HORIZONTAL_INSET + depth * 18 },
          selected && { backgroundColor: colors.accent.selectionBg },
        ]}
      >
        <BlockHandle
          blockId={block.id}
          selected={selected}
          onOpenBlockMenu={onOpenBlockMenu}
          onToggleBlockSelection={onToggleBlockSelection}
        />
        <Checkbox
          status={block.checked ? 'checked' : 'unchecked'}
          onPress={() => onToggleTodo(block.id, !block.checked)}
        />
        <TextInput {...sharedInputProps} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        { paddingLeft: NOTE_EDITOR_HORIZONTAL_INSET + depth * 18 },
        selected && { backgroundColor: colors.accent.selectionBg },
        isQuote && [styles.quoteRow, { borderLeftColor: colors.border.default }],
        isCallout && [styles.calloutRow, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }],
        isCode && [styles.codeRow, { backgroundColor: colors.surface.panel }],
      ]}
    >
      <BlockHandle
        blockId={block.id}
        selected={selected}
        onOpenBlockMenu={onOpenBlockMenu}
        onToggleBlockSelection={onToggleBlockSelection}
      />
      {isList || isQuote || isCallout || isToggle ? (
        <Text style={[styles.prefix, { color: colors.text.secondary }]}>{prefix}</Text>
      ) : null}
      <TextInput {...sharedInputProps} />
    </View>
  );
});

function BlockHandle({
  blockId,
  selected,
  onOpenBlockMenu,
  onToggleBlockSelection,
}: {
  blockId: string;
  selected: boolean;
  onOpenBlockMenu?: (blockId: string) => void;
  onToggleBlockSelection?: (blockId: string) => void;
}) {
  const { colors } = useTheme();
  if (!onOpenBlockMenu) return null;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.handle,
        selected && { backgroundColor: colors.accent.selectionBg },
        pressed && { backgroundColor: colors.surface.hover },
      ]}
      onPress={() => onOpenBlockMenu(blockId)}
      onLongPress={() => onToggleBlockSelection?.(blockId)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon source="drag-vertical" size={18} color={colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: NOTE_EDITOR_HORIZONTAL_INSET,
    paddingVertical: 6,
    gap: 6,
  },
  handle: {
    width: 28,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  quoteRow: {
    borderLeftWidth: 3,
  },
  calloutRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: NOTE_EDITOR_HORIZONTAL_INSET,
    paddingRight: 12,
  },
  codeRow: {
    borderRadius: 8,
    marginHorizontal: NOTE_EDITOR_HORIZONTAL_INSET,
    paddingRight: 12,
  },
  dividerRow: {
    paddingHorizontal: NOTE_EDITOR_HORIZONTAL_INSET,
    paddingVertical: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  imageRow: {
    paddingHorizontal: NOTE_EDITOR_HORIZONTAL_INSET,
    paddingVertical: 8,
  },
  image: {
    width: '100%',
    minHeight: 180,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    minHeight: 120,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  prefix: {
    fontSize: 16,
    lineHeight: 24,
    paddingTop: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 4,
    minHeight: 32,
  },
  headingInput: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
});
