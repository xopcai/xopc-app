import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View, type ScrollViewProps } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { Checkbox, Icon, Text } from 'react-native-paper';

import { useTheme } from '../../../theme';
import { BlockInsertBar, type BlockInsertAction } from '../blocks/BlockInsertBar';
import { INSERT_BAR_HEIGHT } from '../blocks/note-layout';
import {
  blockToMarkdown,
  getMarkdownBodyStartOffset,
  parseMarkdownDocument,
  type MarkdownEditorBlock,
} from './markdown-document';
import {
  blockContentOffset,
  createTransientBlockAfter,
  exitTransientContinuation,
  markdownForTransientInsertion,
  mergeStructuredBlocks,
  shouldCreateTransientBlock,
  shouldExitTransientContinuation,
  transformStructuredTextInput,
  type TransientMarkdownBlock,
} from './markdown-editing';

type LocalSelection = { start: number; end: number };
type FocusRequest = { start: number; end: number; tick: number };
type ExternalFocusSelection = { start: number; end: number; tick: number };
type StructuredEditorRow =
  | { type: 'block'; block: MarkdownEditorBlock; blockIndex: number }
  | { type: 'transient'; block: TransientMarkdownBlock; afterBlock: MarkdownEditorBlock };

const ESTIMATED_ROW_HEIGHT = 34;

interface StructuredMarkdownEditorProps {
  markdown: string;
  placeholder: string;
  todoAccessibilityLabel: string;
  blockAccessibilityLabels: MarkdownBlockAccessibilityLabels;
  unsupportedMarkdownLabels: UnsupportedMarkdownLabels;
  autoFocusTick?: number;
  toolbarActions: BlockInsertAction[];
  focusSelection?: ExternalFocusSelection;
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange?: (start: number, end: number) => void;
  onRequestSourceRange?: (start: number, end: number) => void;
  onOpenSource?: () => void;
  resolveImageSource?: (src: string) => string;
}

export const StructuredMarkdownEditor = memo(function StructuredMarkdownEditor({
  markdown,
  placeholder,
  todoAccessibilityLabel,
  blockAccessibilityLabels,
  unsupportedMarkdownLabels,
  autoFocusTick = 0,
  toolbarActions,
  focusSelection,
  onChangeMarkdown,
  onSelectionChange,
  onRequestSourceRange,
  onOpenSource,
  resolveImageSource,
}: StructuredMarkdownEditorProps) {
  const { colors } = useTheme();
  const doc = useMemo(() => parseMarkdownDocument(markdown), [markdown]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [transientBlock, setTransientBlock] = useState<TransientMarkdownBlock | null>(null);
  const listRef = useRef<FlashListRef<StructuredEditorRow>>(null);
  const emptyInputRef = useRef<TextInput>(null);
  const handledAutoFocusTickRef = useRef(0);
  const externalSelectionKeyRef = useRef('');

  const renderScrollComponent = useMemo(
    () =>
      forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps>((props, ref) => (
        <KeyboardAwareScrollView
          {...props}
          ref={ref}
          bottomOffset={INSERT_BAR_HEIGHT + 16}
          keyboardShouldPersistTaps="always"
        />
      )),
    [],
  );

  const rows = useMemo<StructuredEditorRow[]>(() => {
    const nextRows: StructuredEditorRow[] = [];
    doc.blocks.forEach((block, blockIndex) => {
      nextRows.push({ type: 'block', block, blockIndex });
      if (transientBlock?.afterBlockId === block.id) {
        nextRows.push({ type: 'transient', block: transientBlock, afterBlock: block });
      }
    });
    return nextRows;
  }, [doc.blocks, transientBlock]);
  const unsupportedCount = useMemo(
    () => doc.parseWarnings.length + doc.blocks.filter((block) => block.type === 'raw').length,
    [doc.blocks, doc.parseWarnings.length],
  );

  const scrollToRowIndex = useCallback((index: number, animated = true) => {
    listRef.current?.scrollToOffset({ offset: Math.max(0, index * ESTIMATED_ROW_HEIGHT), animated: false });
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated, viewPosition: 0.18 });
    });
  }, []);

  const replaceBlock = useCallback((block: MarkdownEditorBlock, nextBlock: MarkdownEditorBlock) => {
    const nextMarkdown = blockToMarkdown(nextBlock);
    setTransientBlock(null);
    onChangeMarkdown(`${markdown.slice(0, block.range.start)}${nextMarkdown}${markdown.slice(block.range.end)}`);
  }, [markdown, onChangeMarkdown]);

  const replaceBlockMarkdown = useCallback((block: MarkdownEditorBlock, nextMarkdown: string, focusOffset?: number) => {
    setTransientBlock(null);
    onChangeMarkdown(`${markdown.slice(0, block.range.start)}${nextMarkdown}${markdown.slice(block.range.end)}`);
    if (focusOffset != null) {
      const offset = block.range.start + focusOffset;
      setFocusRequest({ start: offset, end: offset, tick: Date.now() });
    }
  }, [markdown, onChangeMarkdown]);

  const mergeBlockBackward = useCallback((blockIndex: number) => {
    const current = doc.blocks[blockIndex];
    const previous = doc.blocks[blockIndex - 1];
    if (!current || !previous) return;
    const merged = mergeStructuredBlocks(previous, current);
    if (!merged) return;
    setTransientBlock(null);
    onChangeMarkdown(`${markdown.slice(0, previous.range.start)}${merged.markdown}${markdown.slice(current.range.end)}`);
    const offset = previous.range.start + merged.focusOffset;
    setFocusRequest({ start: offset, end: offset, tick: Date.now() });
  }, [doc.blocks, markdown, onChangeMarkdown]);

  const createTransientAfterBlock = useCallback((block: MarkdownEditorBlock) => {
    const next = createTransientBlockAfter(block);
    if (next) setTransientBlock(next);
  }, []);

  const insertTransientText = useCallback((block: TransientMarkdownBlock, text: string) => {
    const next = markdownForTransientInsertion(block, text);
    if (!next) return;
    setTransientBlock(null);
    onChangeMarkdown(`${markdown.slice(0, block.insertOffset)}${next.insertion}${markdown.slice(block.insertOffset)}`);
    const offset = block.insertOffset + next.focusOffset;
    setFocusRequest({ start: offset, end: offset, tick: Date.now() });
  }, [markdown, onChangeMarkdown]);

  const cancelTransientBlock = useCallback((afterBlock: MarkdownEditorBlock) => {
    setTransientBlock(null);
    const focusOffset = afterBlock.range.start + blockContentOffset(afterBlock) + blockText(afterBlock).length;
    setFocusRequest({ start: focusOffset, end: focusOffset, tick: Date.now() });
  }, []);

  const handleBlockSelection = useCallback((block: MarkdownEditorBlock, start: number, end: number) => {
    const offset = blockContentOffset(block);
    onSelectionChange?.(block.range.start + offset + start, block.range.start + offset + end);
  }, [onSelectionChange]);

  useEffect(() => {
    if (!focusSelection) return;
    const start = Math.max(0, Math.min(focusSelection.start, focusSelection.end, markdown.length));
    const end = Math.max(0, Math.min(Math.max(focusSelection.start, focusSelection.end), markdown.length));
    const key = `${start}:${end}:${focusSelection.tick}`;
    if (externalSelectionKeyRef.current === key) return;
    const targetIndex = rows.findIndex((row) => row.type === 'block' && row.block.type !== 'image' && start <= row.block.range.end && end >= row.block.range.start);
    if (targetIndex < 0) return;
    externalSelectionKeyRef.current = key;
    setTransientBlock(null);
    scrollToRowIndex(targetIndex);
    setFocusRequest({ start, end, tick: Date.now() });
  }, [focusSelection, markdown.length, rows, scrollToRowIndex]);

  useEffect(() => {
    if (!autoFocusTick || handledAutoFocusTickRef.current === autoFocusTick) return;
    handledAutoFocusTickRef.current = autoFocusTick;
    if (!doc.blocks.length) {
      requestAnimationFrame(() => emptyInputRef.current?.focus());
      return;
    }
    const targetIndex = rows.findIndex((row) => row.type === 'block' && row.block.type !== 'image');
    const targetRow = targetIndex >= 0 ? rows[targetIndex] : null;
    if (!targetRow || targetRow.type !== 'block') return;
    const block = targetRow.block;
    const offset = blockContentOffset(block) + blockText(block).length;
    const markdownOffset = block.range.start + offset;
    setTransientBlock(null);
    scrollToRowIndex(targetIndex);
    setFocusRequest({ start: markdownOffset, end: markdownOffset, tick: Date.now() });
  }, [autoFocusTick, doc.blocks.length, rows, scrollToRowIndex]);

  const handleEmptyInputChange = useCallback((text: string) => {
    const bodyStart = getMarkdownBodyStartOffset(markdown);
    const prefix = markdown.slice(0, bodyStart);
    const separator = bodyStart > 0 ? frontmatterBodySeparator(prefix) : '';
    const markdownOffset = bodyStart + separator.length + text.length;
    onChangeMarkdown(`${prefix}${separator}${text}`);
    onSelectionChange?.(markdownOffset, markdownOffset);
    if (text.length > 0) {
      setFocusRequest({ start: markdownOffset, end: markdownOffset, tick: Date.now() });
    }
  }, [markdown, onChangeMarkdown, onSelectionChange]);

  const handleEmptySelectionChange = useCallback((event: { nativeEvent: { selection: { start: number; end: number } } }) => {
    const bodyStart = getMarkdownBodyStartOffset(markdown);
    const prefix = markdown.slice(0, bodyStart);
    const separator = bodyStart > 0 ? frontmatterBodySeparator(prefix) : '';
    const selectionStart = bodyStart + separator.length + event.nativeEvent.selection.start;
    const selectionEnd = bodyStart + separator.length + event.nativeEvent.selection.end;
    onSelectionChange?.(selectionStart, selectionEnd);
  }, [markdown, onSelectionChange]);

  const renderItem = useCallback(({ item }: { item: StructuredEditorRow }) => {
    if (item.type === 'transient') {
      return (
        <TransientBlockRow
          block={item.block}
          placeholder={placeholder}
          blockAccessibilityLabels={blockAccessibilityLabels}
          afterBlock={item.afterBlock}
          onReplaceTransient={setTransientBlock}
          onSubmitText={(text) => insertTransientText(item.block, text)}
          onCancel={() => cancelTransientBlock(item.afterBlock)}
        />
      );
    }

    return (
      <MarkdownBlockRow
        block={item.block}
        focusRequest={focusRequest}
        onReplace={replaceBlock}
        onReplaceMarkdown={replaceBlockMarkdown}
        onCreateTransient={() => createTransientAfterBlock(item.block)}
        onMergeBackward={() => mergeBlockBackward(item.blockIndex)}
        onFocusRequestHandled={() => setFocusRequest(null)}
        onSelectionChange={handleBlockSelection}
        onRequestSourceRange={onRequestSourceRange}
        resolveImageSource={resolveImageSource}
        todoAccessibilityLabel={todoAccessibilityLabel}
        blockAccessibilityLabels={blockAccessibilityLabels}
      />
    );
  }, [
    blockAccessibilityLabels,
    cancelTransientBlock,
    createTransientAfterBlock,
    focusRequest,
    handleBlockSelection,
    insertTransientText,
    mergeBlockBackward,
    placeholder,
    replaceBlock,
    replaceBlockMarkdown,
    onRequestSourceRange,
    todoAccessibilityLabel,
    resolveImageSource,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface.base }]}>
      {doc.blocks.length ? (
        <FlashList
          ref={listRef}
          data={rows}
          renderItem={renderItem}
          renderScrollComponent={renderScrollComponent}
          keyExtractor={keyForRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={unsupportedCount > 0 ? (
            <UnsupportedMarkdownNotice
              count={unsupportedCount}
              labels={unsupportedMarkdownLabels}
              onOpenSource={onOpenSource ?? (() => onRequestSourceRange?.(0, markdown.length))}
            />
          ) : null}
          extraData={{
            focusTick: focusRequest?.tick ?? 0,
            transientKey: transientBlock ? keyForTransientRow(transientBlock) : '',
            unsupportedCount,
          }}
        />
      ) : (
        <View style={styles.emptyShell}>
          <TextInput
            ref={emptyInputRef}
            value=""
            onChangeText={handleEmptyInputChange}
            onSelectionChange={handleEmptySelectionChange}
            multiline
            autoCapitalize="sentences"
            autoCorrect
            accessibilityLabel={blockAccessibilityLabels.paragraph}
            placeholder={placeholder}
            placeholderTextColor={colors.text.tertiary}
            style={[styles.emptyInput, { color: colors.text.primary }]}
          />
        </View>
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={[styles.toolbar, { backgroundColor: colors.surface.base }]}>
        <BlockInsertBar actions={toolbarActions} />
      </KeyboardStickyView>
    </View>
  );
});

function keyForRow(row: StructuredEditorRow): string {
  return row.type === 'block' ? row.block.id : keyForTransientRow(row.block);
}

function keyForTransientRow(row: TransientMarkdownBlock): string {
  return `${row.afterBlockId}:transient:${row.kind}:${row.index ?? ''}:${row.marker ?? ''}`;
}

const MarkdownBlockRow = memo(function MarkdownBlockRow({
  block,
  focusRequest,
  onReplace,
  onReplaceMarkdown,
  onCreateTransient,
  onMergeBackward,
  onFocusRequestHandled,
  onSelectionChange,
  onRequestSourceRange,
  resolveImageSource,
  todoAccessibilityLabel,
  blockAccessibilityLabels,
}: {
  block: MarkdownEditorBlock;
  focusRequest: FocusRequest | null;
  onReplace: (block: MarkdownEditorBlock, nextBlock: MarkdownEditorBlock) => void;
  onReplaceMarkdown: (block: MarkdownEditorBlock, nextMarkdown: string, focusOffset?: number) => void;
  onCreateTransient: () => void;
  onMergeBackward: () => void;
  onFocusRequestHandled: () => void;
  onSelectionChange: (block: MarkdownEditorBlock, start: number, end: number) => void;
  onRequestSourceRange?: (start: number, end: number) => void;
  resolveImageSource?: (src: string) => string;
  todoAccessibilityLabel: string;
  blockAccessibilityLabels: MarkdownBlockAccessibilityLabels;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [localSelection, setLocalSelection] = useState<LocalSelection>({ start: 0, end: 0 });
  const resolvedImageSrc = block.type === 'image' ? resolveImageSource?.(block.src) ?? block.src : '';

  const focusSelection = useMemo(() => {
    if (!focusRequest) return null;
    const contentOffset = blockContentOffset(block);
    const textLength = blockText(block).length;
    const localStart = clamp(focusRequest.start - block.range.start - contentOffset, 0, textLength);
    const localEnd = clamp(focusRequest.end - block.range.start - contentOffset, 0, textLength);
    if (focusRequest.end < block.range.start || focusRequest.start > block.range.end) return null;
    return { start: Math.min(localStart, localEnd), end: Math.max(localStart, localEnd), tick: focusRequest.tick };
  }, [block, focusRequest]);

  useEffect(() => {
    if (!focusSelection) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      onFocusRequestHandled();
    });
  }, [focusSelection, onFocusRequestHandled]);

  const updateText = useCallback((text: string) => {
    if (shouldCreateTransientBlock(block, text)) {
      onCreateTransient();
      return;
    }
    const transformed = transformStructuredTextInput(block, text);
    if (transformed != null) {
      onReplaceMarkdown(block, transformed.markdown, transformed.focusOffset);
    } else if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'todo' || block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'quote' || block.type === 'callout') {
      onReplace(block, { ...block, text });
    } else if (block.type === 'code') {
      onReplace(block, { ...block, code: text });
    } else if (block.type === 'raw') {
      onReplace(block, { ...block, text });
    }
  }, [block, onCreateTransient, onReplace, onReplaceMarkdown]);

  const selectionProps = {
    onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setLocalSelection(event.nativeEvent.selection);
      onSelectionChange(block, event.nativeEvent.selection.start, event.nativeEvent.selection.end);
    },
  };
  const rawLikeInput = block.type === 'code';

  const handleKeyPress = useCallback((event: { nativeEvent: { key: string } }) => {
    if (event.nativeEvent.key !== 'Backspace') return;
    if (localSelection.start === 0 && localSelection.end === 0) {
      onMergeBackward();
    }
  }, [localSelection.end, localSelection.start, onMergeBackward]);

  if (block.type === 'image') {
    return (
      <Pressable
        style={styles.imageBlock}
        onPress={() => onRequestSourceRange?.(block.range.start, block.range.end)}
        accessibilityRole="button"
        accessibilityLabel={block.alt || block.src}
      >
        {isRemoteImage(resolvedImageSrc) ? (
          <Image source={{ uri: resolvedImageSrc }} style={styles.image} resizeMode="cover" accessibilityLabel={block.alt || block.src} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
            <Icon source="image-outline" size={24} color={colors.text.tertiary} />
            <Text style={[styles.imageText, { color: colors.text.secondary }]} numberOfLines={2}>
              {block.alt || block.src}
            </Text>
          </View>
        )}
      </Pressable>
    );
  }

  if (block.type === 'raw') {
    return (
      <Pressable
        onPress={() => onRequestSourceRange?.(block.range.start, block.range.end)}
        accessibilityRole="button"
        accessibilityLabel={blockAccessibilityLabels.raw}
        style={({ pressed }) => [
          styles.row,
          styles.rawRow,
          {
            backgroundColor: pressed ? colors.surface.hover : colors.surface.panel,
            borderColor: colors.border.subtle,
          },
        ]}
      >
        <Text style={[styles.rawText, { color: colors.text.secondary }]} numberOfLines={4}>
          {block.text}
        </Text>
        <View style={[styles.rawSourceButton, { borderColor: colors.border.default, backgroundColor: colors.surface.input }]}>
          <Icon source="code-braces" size={17} color={colors.accent.primary} />
        </View>
      </Pressable>
    );
  }

  if (block.type === 'todo') {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={() => onReplace(block, { ...block, checked: !block.checked })}
          accessibilityRole="checkbox"
          accessibilityLabel={block.text || todoAccessibilityLabel}
          accessibilityState={{ checked: block.checked }}
          hitSlop={5}
          style={styles.todoCheckboxButton}
        >
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Checkbox status={block.checked ? 'checked' : 'unchecked'} />
          </View>
        </Pressable>
        <TextInput
          ref={inputRef}
          value={block.text}
          selection={focusSelection ? { start: focusSelection.start, end: focusSelection.end } : undefined}
          onChangeText={updateText}
          onKeyPress={handleKeyPress}
          multiline
          accessibilityLabel={blockAccessibilityLabels.todo}
          placeholder={blockAccessibilityLabels.todo}
          placeholderTextColor={colors.text.tertiary}
          style={[styles.input, { color: colors.text.primary }]}
          {...selectionProps}
        />
      </View>
    );
  }

  const prefix = prefixForBlock(block);

  return (
    <View
      style={[
        styles.row,
        block.type === 'quote' && [styles.quoteRow, { borderLeftColor: colors.border.default }],
        block.type === 'callout' && [styles.calloutRow, { backgroundColor: colors.surface.panel, borderColor: colors.border.subtle }],
        block.type === 'code' && [styles.codeRow, { backgroundColor: colors.surface.panel }],
      ]}
    >
      {prefix ? <Text style={[styles.prefix, { color: colors.text.secondary }]}>{prefix}</Text> : null}
      <TextInput
        ref={inputRef}
        value={blockText(block)}
        selection={focusSelection ? { start: focusSelection.start, end: focusSelection.end } : undefined}
        onChangeText={updateText}
        onKeyPress={handleKeyPress}
        multiline
        autoCapitalize={rawLikeInput ? 'none' : 'sentences'}
        autoCorrect={!rawLikeInput}
        spellCheck={!rawLikeInput}
        accessibilityLabel={accessibilityLabelForBlock(block, blockAccessibilityLabels)}
        placeholder={placeholderForBlock(block, blockAccessibilityLabels)}
        placeholderTextColor={colors.text.tertiary}
        style={[
          styles.input,
          block.type === 'heading' && headingStyle(block.level),
          block.type === 'callout' && styles.calloutInput,
          block.type === 'code' && styles.codeInput,
          { color: colors.text.primary },
        ]}
        {...selectionProps}
      />
    </View>
  );
});

const TransientBlockRow = memo(function TransientBlockRow({
  block,
  placeholder,
  blockAccessibilityLabels,
  afterBlock,
  onReplaceTransient,
  onSubmitText,
  onCancel,
}: {
  block: TransientMarkdownBlock;
  placeholder: string;
  blockAccessibilityLabels: MarkdownBlockAccessibilityLabels;
  afterBlock: MarkdownEditorBlock;
  onReplaceTransient: (block: TransientMarkdownBlock) => void;
  onSubmitText: (text: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleChangeText = useCallback((next: string) => {
    if (shouldExitTransientContinuation(block, next)) {
      setText('');
      onReplaceTransient(exitTransientContinuation(block));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!next.trim()) {
      setText('');
      return;
    }
    setText(next);
    onSubmitText(next);
  }, [block, onReplaceTransient, onSubmitText]);

  const handleKeyPress = useCallback((event: { nativeEvent: { key: string } }) => {
    if (event.nativeEvent.key === 'Backspace' && !text) onCancel();
  }, [onCancel, text]);

  const prefix = transientPrefix(block);

  return (
    <View style={styles.row}>
      {block.kind === 'todo' ? (
        <View
          style={styles.todoCheckboxButton}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Checkbox status="unchecked" />
        </View>
      ) : prefix ? (
        <Text style={[styles.prefix, { color: colors.text.secondary }]}>{prefix}</Text>
      ) : null}
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        multiline={block.kind !== 'paragraph' || afterBlock.type !== 'heading'}
        autoCapitalize="sentences"
        autoCorrect
        accessibilityLabel={accessibilityLabelForTransient(block, blockAccessibilityLabels)}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        style={[styles.input, { color: colors.text.primary }]}
      />
    </View>
  );
});

export interface MarkdownBlockAccessibilityLabels {
  paragraph: string;
  heading: string;
  todo: string;
  bulletList: string;
  numberedList: string;
  quote: string;
  callout: string;
  code: string;
  raw: string;
}

export interface UnsupportedMarkdownLabels {
  title: string;
  description: string;
  action: string;
  count: string;
}

const UnsupportedMarkdownNotice = memo(function UnsupportedMarkdownNotice({
  count,
  labels,
  onOpenSource,
}: {
  count: number;
  labels: UnsupportedMarkdownLabels;
  onOpenSource: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.unsupportedNotice, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
      <View style={styles.unsupportedNoticeText}>
        <Text style={[styles.unsupportedNoticeTitle, { color: colors.text.primary }]}>
          {labels.title}
        </Text>
        <Text style={[styles.unsupportedNoticeDescription, { color: colors.text.secondary }]}>
          {labels.description}
        </Text>
        <Text style={[styles.unsupportedNoticeCount, { color: colors.text.tertiary }]}>
          {labels.count.replace('{{count}}', String(count))}
        </Text>
      </View>
      <Pressable
        onPress={onOpenSource}
        accessibilityRole="button"
        accessibilityLabel={labels.action}
        style={({ pressed }) => [
          styles.unsupportedNoticeAction,
          {
            backgroundColor: pressed ? colors.accent.selectionBg : colors.surface.input,
            borderColor: colors.border.default,
          },
        ]}
      >
        <Icon source="code-braces" size={17} color={colors.accent.primary} />
        <Text style={[styles.unsupportedNoticeActionText, { color: colors.accent.primary }]} numberOfLines={1}>
          {labels.action}
        </Text>
      </Pressable>
    </View>
  );
});

function blockText(block: MarkdownEditorBlock): string {
  if (block.type === 'code') return block.code;
  if (block.type === 'raw') return block.text;
  if ('text' in block) return block.text;
  return '';
}

function prefixForBlock(block: MarkdownEditorBlock): string {
  if (block.type === 'bulletList') return '•';
  if (block.type === 'numberedList') return `${block.index}.`;
  if (block.type === 'callout') return formatCalloutKind(block.kind);
  return '';
}

function frontmatterBodySeparator(prefix: string): string {
  if (prefix.endsWith('\n\n')) return '';
  if (prefix.endsWith('\n')) return '\n';
  return '\n\n';
}

function accessibilityLabelForBlock(block: MarkdownEditorBlock, labels: MarkdownBlockAccessibilityLabels): string {
  switch (block.type) {
    case 'heading':
      return labels.heading;
    case 'todo':
      return labels.todo;
    case 'bulletList':
      return labels.bulletList;
    case 'numberedList':
      return labels.numberedList;
    case 'quote':
      return labels.quote;
    case 'callout':
      return labels.callout;
    case 'code':
      return labels.code;
    case 'raw':
      return labels.raw;
    default:
      return labels.paragraph;
  }
}

function placeholderForBlock(block: MarkdownEditorBlock, labels: MarkdownBlockAccessibilityLabels): string {
  switch (block.type) {
    case 'heading':
      return labels.heading;
    case 'todo':
      return labels.todo;
    case 'bulletList':
      return labels.bulletList;
    case 'numberedList':
      return labels.numberedList;
    case 'quote':
      return labels.quote;
    case 'callout':
      return labels.callout;
    default:
      return labels.paragraph;
  }
}

function accessibilityLabelForTransient(block: TransientMarkdownBlock, labels: MarkdownBlockAccessibilityLabels): string {
  switch (block.kind) {
    case 'todo':
      return labels.todo;
    case 'bulletList':
      return labels.bulletList;
    case 'numberedList':
      return labels.numberedList;
    case 'quote':
      return labels.quote;
    case 'callout':
      return labels.callout;
    default:
      return labels.paragraph;
  }
}

function transientPrefix(block: TransientMarkdownBlock): string {
  if (block.kind === 'bulletList') return '•';
  if (block.kind === 'numberedList') return `${block.index ?? 1}.`;
  return '';
}

function formatCalloutKind(kind: string): string {
  return kind
    .replace(/[-_]+/g, ' ')
    .toLowerCase()
    .replace(/\b\p{Letter}/gu, (char) => char.toLocaleUpperCase());
}

function headingStyle(level: 1 | 2 | 3 | 4 | 5 | 6) {
  if (level === 1) return styles.heading1;
  if (level === 2) return styles.heading2;
  return styles.heading3;
}

function isRemoteImage(src: string): boolean {
  return /^https?:\/\//.test(src) || /^file:/.test(src);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: INSERT_BAR_HEIGHT + 48,
  },
  emptyShell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: INSERT_BAR_HEIGHT + 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: 0,
  },
  todoCheckboxButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 24,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyInput: {
    minHeight: 180,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
  },
  unsupportedNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  unsupportedNoticeText: {
    gap: 3,
  },
  unsupportedNoticeTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  unsupportedNoticeDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  unsupportedNoticeCount: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  unsupportedNoticeAction: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unsupportedNoticeActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  prefix: {
    fontSize: 16,
    lineHeight: 22,
    paddingTop: 1,
    minWidth: 18,
  },
  heading1: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '700',
  },
  heading2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  heading3: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
  },
  quoteRow: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginVertical: 2,
  },
  calloutRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 1,
  },
  calloutInput: {
    fontSize: 15,
    lineHeight: 21,
  },
  codeRow: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 1,
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  rawRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 1,
  },
  rawText: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 21,
  },
  rawSourceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBlock: {
    paddingVertical: 8,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  imageText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
