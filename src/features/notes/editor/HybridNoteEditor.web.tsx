import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

import type { NoteBlock } from '../note-blocks';
import { createTextBlock } from '../note-blocks';
import { NoteInlineImageBlock } from './NoteInlineImageBlock';
import { NoteBlockEditor } from './NoteBlockEditor';
import {
  blocksToEditorSegments,
  insertImageBlockIntoBlocks,
  mergeRichSegmentIntoBlocks,
  removeImageBlockFromBlocks,
  type EditorSegment,
} from './note-editor-segments';
import type { HybridNoteEditorHandle, HybridNoteEditorProps, UnifiedEditor } from './types';

export const HybridNoteEditor = memo(forwardRef<HybridNoteEditorHandle, HybridNoteEditorProps>(
  function HybridNoteEditor({
    contentKey,
    blocks,
    onBlocksChange,
    onEditorReady,
    slashMenuOpen,
    onSlashMenuClose,
    editable = true,
    focusOnEnable = false,
    onFocusApplied,
  }, ref) {
    const blocksRef = useRef(blocks);
    blocksRef.current = blocks;

    const segments = useMemo(() => blocksToEditorSegments(blocks), [blocks]);
    const activeSegmentBlockIdsRef = useRef<string[]>(
      segments.find((segment) => segment.kind === 'rich')?.blockIds ?? [],
    );
    const activeEditorRef = useRef<UnifiedEditor | null>(null);
    const [focusSegmentKey, setFocusSegmentKey] = useState<string | null>(null);

    useEffect(() => {
      const firstRich = segments.find((segment) => segment.kind === 'rich');
      if (firstRich?.kind === 'rich') {
        activeSegmentBlockIdsRef.current = firstRich.blockIds;
      }
    }, [contentKey, segments]);

    const handleSegmentFocus = useCallback((segment: Extract<EditorSegment, { kind: 'rich' }>) => {
      activeSegmentBlockIdsRef.current = segment.blockIds;
      setFocusSegmentKey(null);
    }, []);

    const handleRichChange = useCallback((segment: Extract<EditorSegment, { kind: 'rich' }>, html: string) => {
      const nextBlocks = mergeRichSegmentIntoBlocks(blocksRef.current, segment.blockIds, html);
      onBlocksChange(nextBlocks);
    }, [onBlocksChange]);

    const handleRemoveImage = useCallback((blockId: string) => {
      onBlocksChange(removeImageBlockFromBlocks(blocksRef.current, blockId));
    }, [onBlocksChange]);

    const handleContinueBelow = useCallback((afterBlockId: string) => {
      const index = blocksRef.current.findIndex((block) => block.id === afterBlockId);
      if (index === -1) return;
      const trailing = blocksRef.current[index + 1];
      if (trailing?.type === 'paragraph') {
        setFocusSegmentKey(trailing.id);
        return;
      }
      const newParagraph = createTextBlock('paragraph');
      onBlocksChange([
        ...blocksRef.current.slice(0, index + 1),
        newParagraph,
        ...blocksRef.current.slice(index + 1),
      ]);
      setFocusSegmentKey(newParagraph.id);
    }, [onBlocksChange]);

    const insertImageBlock = useCallback((src: string, alt?: string) => {
      const { blocks: nextBlocks, focusSegmentKey: nextFocusKey } = insertImageBlockIntoBlocks(
        blocksRef.current,
        activeSegmentBlockIdsRef.current,
        src,
        alt ?? '',
      );
      onBlocksChange(nextBlocks);
      setFocusSegmentKey(nextFocusKey);
    }, [onBlocksChange]);

    useImperativeHandle(ref, () => ({ insertImageBlock }), [insertImageBlock]);

    const firstRichKey = segments.find((segment) => segment.kind === 'rich')?.key ?? null;

    return (
      <View style={styles.container}>
        {segments.map((segment, index) => {
          if (segment.kind === 'image') {
            return (
              <NoteInlineImageBlock
                key={segment.key}
                block={segment.block}
                editable={editable}
                onRemove={() => handleRemoveImage(segment.block.id)}
                onContinueBelow={() => handleContinueBelow(segment.block.id)}
              />
            );
          }

          const segmentFocusOnEnable = focusSegmentKey
            ? focusSegmentKey === segment.key
            : focusOnEnable && segment.key === firstRichKey;

          return (
            <NoteBlockEditor
              key={`${contentKey}:${segment.key}`}
              segmentKey={segment.key}
              contentKey={`${contentKey}:${segment.key}`}
              initialHtml={segment.html}
              onChange={(html) => handleRichChange(segment, html)}
              embedded
              editable={editable}
              slashMenuOpen={slashMenuOpen && index === segments.length - 1}
              onSlashMenuClose={onSlashMenuClose}
              focusOnEnable={segmentFocusOnEnable}
              onFocusApplied={() => {
                setFocusSegmentKey(null);
                onFocusApplied?.();
              }}
              onSegmentFocus={() => handleSegmentFocus(segment)}
              onEditorReady={(editor) => {
                activeEditorRef.current = editor;
                onEditorReady?.(editor);
              }}
            />
          );
        })}
      </View>
    );
  },
));

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
});
