import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type RefObject,
} from 'react';
import { StyleSheet, View, type ScrollViewProps } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { getBlockDepth, type BlockDocument } from './core/block-document';
import type { FocusRequest } from './runtime/use-block-editor';
import { BlockRow } from './BlockRow';

const BlockEditorScrollView = forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps & { bottomOffset: number }>(
  function BlockEditorScrollView({ bottomOffset, ...props }, ref) {
    return (
      <KeyboardAwareScrollView
        {...props}
        ref={ref}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps="always"
      />
    );
  },
);

export interface BlockNoteEditorHandle {
  focusBlock: (blockId: string) => void;
}

export interface BlockNoteEditorProps {
  document: BlockDocument;
  flatBlockIds: string[];
  focusRequest: FocusRequest | null;
  onUpdateText: (blockId: string, text: string) => void;
  onToggleTodo: (blockId: string, checked: boolean) => void;
  onSubmitNewBlock: (blockId: string) => void;
  onBackspaceEmpty: (blockId: string) => void;
  onSelectionChange: (blockId: string, start: number, end: number) => void;
  onOpenBlockMenu: (blockId: string) => void;
  onToggleBlockSelection: (blockId: string) => void;
  onFocusBlock: (blockId: string) => void;
  onFocusRequestHandled: (blockId: string) => void;
  resolveAttachmentUri?: (attachmentId: string) => string | undefined;
  selectedBlockIds?: Set<string>;
  placeholder?: string;
  /** Space to keep the caret above the keyboard (includes insert bar height). */
  keyboardBottomOffset?: number;
  bottomInset?: number;
}

function focusInputRef(ref: RefObject<View | null>) {
  const input = ref.current as { focus?: () => void } | null;
  input?.focus?.();
}

export const BlockNoteEditor = memo(forwardRef<BlockNoteEditorHandle, BlockNoteEditorProps>(
  function BlockNoteEditor({
    document,
    flatBlockIds,
    focusRequest,
    onUpdateText,
    onToggleTodo,
    onSubmitNewBlock,
    onBackspaceEmpty,
    onSelectionChange,
    onOpenBlockMenu,
    onToggleBlockSelection,
    onFocusBlock,
    onFocusRequestHandled,
    resolveAttachmentUri,
    selectedBlockIds,
    placeholder,
    keyboardBottomOffset = 16,
    bottomInset = 0,
  }, ref) {
    const inputRefs = useRef<Map<string, RefObject<View | null>>>(new Map());
    const listRef = useRef<FlashListRef<string>>(null);

    const renderScrollComponent = useMemo(
      () =>
        forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps>((props, scrollRef) => (
          <BlockEditorScrollView
            {...props}
            ref={scrollRef}
            bottomOffset={keyboardBottomOffset}
          />
        )),
      [keyboardBottomOffset],
    );

    const getInputRef = useCallback((blockId: string) => {
      const existing = inputRefs.current.get(blockId);
      if (existing) return existing;
      const next = { current: null as View | null };
      inputRefs.current.set(blockId, next);
      return next;
    }, []);

    const focusBlockAt = useCallback((blockId: string) => {
      onFocusBlock(blockId);
      const inputRef = inputRefs.current.get(blockId);
      if (inputRef) {
        requestAnimationFrame(() => focusInputRef(inputRef));
      }
    }, [onFocusBlock]);

    useImperativeHandle(ref, () => ({
      focusBlock: focusBlockAt,
    }), [focusBlockAt]);

    const handleFocusRequestHandled = useCallback((blockId: string) => {
      onFocusRequestHandled(blockId);
      const inputRef = inputRefs.current.get(blockId);
      if (inputRef) {
        requestAnimationFrame(() => focusInputRef(inputRef));
      }
    }, [onFocusRequestHandled]);

    const renderItem = useCallback(({ item: blockId, index }: { item: string; index: number }) => {
      const block = document.blocks[blockId];
      if (!block) return null;

      return (
        <BlockRow
          block={block}
          listIndex={index}
          depth={getBlockDepth(document, blockId)}
          placeholder={placeholder}
          inputRef={getInputRef(blockId)}
          imageUri={block.type === 'image' ? resolveAttachmentUri?.(block.attachmentId) : undefined}
          selected={selectedBlockIds?.has(blockId) ?? false}
          shouldFocus={focusRequest?.blockId === blockId ? focusRequest.tick : undefined}
          onFocusRequestHandled={handleFocusRequestHandled}
          onChangeText={onUpdateText}
          onToggleTodo={onToggleTodo}
          onSubmitNewBlock={onSubmitNewBlock}
          onBackspaceEmpty={onBackspaceEmpty}
          onSelectionChange={onSelectionChange}
          onOpenBlockMenu={onOpenBlockMenu}
          onToggleBlockSelection={onToggleBlockSelection}
          onFocus={onFocusBlock}
        />
      );
    }, [
      document.blocks,
      focusRequest,
      getInputRef,
      handleFocusRequestHandled,
      onBackspaceEmpty,
      onFocusBlock,
      onSubmitNewBlock,
      onToggleTodo,
      onUpdateText,
      onOpenBlockMenu,
      onToggleBlockSelection,
      onSelectionChange,
      placeholder,
      resolveAttachmentUri,
      selectedBlockIds,
    ]);

    return (
      <View style={styles.container}>
        <FlashList
          ref={listRef}
          data={flatBlockIds}
          renderItem={renderItem}
          renderScrollComponent={renderScrollComponent}
          extraData={{
            focusRequest,
            selectedKey: selectedBlockIds ? [...selectedBlockIds].sort().join('|') : '',
          }}
          keyExtractor={(blockId) => blockId}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            bottomInset > 0 && { paddingBottom: bottomInset },
          ]}
        />
      </View>
    );
  },
));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingBottom: 24,
  },
});
