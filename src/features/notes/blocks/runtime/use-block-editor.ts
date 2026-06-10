import { useCallback, useMemo, useRef, useState } from 'react';

import type { NoteAiPatch, NoteBlock, NoteBlockType, NoteTextMarkType } from '../../../../query/notes';

import type { BlockTransaction } from '../core/block-command';
import {
  applyTransaction,
  insertBlockAfterDoc,
  transaction,
  updateBlockText,
} from '../core/block-reducer';
import {
  documentToBlocks,
  flattenBlockIds,
  type BlockDocument,
} from '../core/block-document';
import { isFocusableBlockType } from '../core/block-registry';
import {
  detectSlashCommand,
  removeSlashCommandText,
  resolveMarkdownShortcut,
  type SlashCommandRange,
} from './editor-input-intents';

export interface FocusRequest {
  blockId: string;
  tick: number;
}

export interface EditorCaret {
  blockId: string;
  offset: number;
  start: number;
  end: number;
}

export interface EditorSlashCommand {
  blockId: string;
  range: SlashCommandRange;
}

export interface UseBlockEditorOptions {
  onDocumentChange?: (doc: BlockDocument) => void;
}

export interface UseBlockEditorResult {
  document: BlockDocument;
  documentRef: React.RefObject<BlockDocument>;
  flatBlockIds: string[];
  blocks: ReturnType<typeof documentToBlocks>;
  focusRequest: FocusRequest | null;
  caret: EditorCaret | null;
  slashCommand: EditorSlashCommand | null;
  selectedBlockIds: Set<string>;
  hasBlockSelection: boolean;
  focusedBlockIdRef: React.RefObject<string | null>;
  dispatch: (tx: BlockTransaction) => BlockDocument;
  setDocument: (next: BlockDocument, options?: { silent?: boolean }) => void;
  updateText: (blockId: string, text: string) => void;
  insertAfter: (afterBlockId: string, type?: NoteBlockType) => void;
  insertBlocksAfter: (afterBlockId: string, blocks: NoteBlock[]) => void;
  insertImageAfter: (afterBlockId: string, attachmentId: string, alt?: string) => void;
  appendLink: (blockId: string, url: string) => void;
  applyMarkdownFormat: (markType: Exclude<NoteTextMarkType, 'link'>) => void;
  toggleTextMark: (markType: NoteTextMarkType, href?: string) => void;
  splitBlock: (blockId: string, offset?: number) => void;
  deleteBlock: (blockId: string) => BlockDocument;
  duplicateBlock: (blockId: string) => void;
  convertBlock: (blockId: string, type: NoteBlockType) => void;
  indentBlock: (blockId: string) => void;
  outdentBlock: (blockId: string) => void;
  moveBlock: (blockId: string, afterBlockId: string | null) => void;
  mergeWithPrevious: (blockId: string) => void;
  toggleTodo: (blockId: string, checked: boolean) => void;
  applyPatch: (patch: NoteAiPatch) => void;
  focusBlock: (blockId: string) => void;
  clearFocusRequest: (blockId: string) => void;
  setFocusedBlockId: (blockId: string) => void;
  clearFocusedBlock: () => void;
  setCaret: (blockId: string, offset: number) => void;
  setTextSelection: (blockId: string, start: number, end: number) => void;
  toggleBlockSelection: (blockId: string) => void;
  clearBlockSelection: () => void;
  deleteSelectedBlocks: () => void;
  duplicateSelectedBlocks: () => void;
  applySlashCommand: (blockType: NoteBlockType) => void;
  dismissSlashCommand: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useBlockEditor(
  initialDocument: BlockDocument,
  options?: UseBlockEditorOptions,
): UseBlockEditorResult {
  const onDocumentChangeRef = useRef(options?.onDocumentChange);
  onDocumentChangeRef.current = options?.onDocumentChange;

  const [document, setDocumentState] = useState(initialDocument);
  const documentRef = useRef(document);
  documentRef.current = document;

  const focusedBlockIdRef = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [caret, setCaretState] = useState<EditorCaret | null>(null);
  const [slashCommand, setSlashCommand] = useState<EditorSlashCommand | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const undoStackRef = useRef<BlockDocument[]>([]);
  const redoStackRef = useRef<BlockDocument[]>([]);
  const textEditHistoryRef = useRef<{ blockId: string; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const flatBlockIds = useMemo(() => flattenBlockIds(document), [document]);
  const blocks = useMemo(() => documentToBlocks(document), [document]);

  const emitChange = useCallback((next: BlockDocument, silent = false) => {
    documentRef.current = next;
    setDocumentState(next);
    if (!silent) {
      onDocumentChangeRef.current?.(next);
    }
    return next;
  }, []);

  const pushHistory = useCallback((previous: BlockDocument) => {
    undoStackRef.current = [...undoStackRef.current.slice(-99), previous];
    redoStackRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }, []);

  const clearTextEditHistoryGroup = useCallback(() => {
    const timer = textEditHistoryRef.current?.timer;
    if (timer) clearTimeout(timer);
    textEditHistoryRef.current = null;
  }, []);

  const pushTextEditHistory = useCallback((blockId: string, previous: BlockDocument) => {
    const current = textEditHistoryRef.current;
    if (current?.blockId !== blockId) {
      if (current?.timer) clearTimeout(current.timer);
      pushHistory(previous);
    } else if (current.timer) {
      clearTimeout(current.timer);
    }
    const timer = setTimeout(() => {
      if (textEditHistoryRef.current?.blockId === blockId) {
        textEditHistoryRef.current = null;
      }
    }, 1200);
    textEditHistoryRef.current = { blockId, timer };
  }, [pushHistory]);

  const commitDocument = useCallback((next: BlockDocument, focusBlockId?: string, history = true) => {
    if (history && next !== documentRef.current) {
      clearTextEditHistoryGroup();
      pushHistory(documentRef.current);
    }
    emitChange(next);
    if (focusBlockId) {
      const block = next.blocks[focusBlockId];
      if (block && isFocusableBlockType(block.type)) {
        focusedBlockIdRef.current = focusBlockId;
        setFocusRequest({ blockId: focusBlockId, tick: Date.now() });
      }
    }
  }, [clearTextEditHistoryGroup, emitChange, pushHistory]);

  const dispatch = useCallback((tx: BlockTransaction) => {
    const previous = documentRef.current;
    const next = applyTransaction(previous, tx);
    if (next !== previous) {
      clearTextEditHistoryGroup();
      pushHistory(previous);
    }
    return emitChange(next);
  }, [clearTextEditHistoryGroup, emitChange, pushHistory]);

  const setDocument = useCallback((next: BlockDocument, options?: { silent?: boolean }) => {
    clearTextEditHistoryGroup();
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryTick((tick) => tick + 1);
    emitChange(next, options?.silent);
  }, [clearTextEditHistoryGroup, emitChange]);

  const updateText = useCallback((blockId: string, text: string) => {
    const previous = documentRef.current;
    const block = previous.blocks[blockId];
    const shortcut = resolveMarkdownShortcut(text);

    if (block && 'text' in block && shortcut) {
      const converted = applyTransaction(previous, transaction({
        type: 'convert',
        blockId,
        toType: shortcut.blockType,
      }, {
        type: 'updateText',
        blockId,
        text: shortcut.text,
      }));
      commitDocument(converted, shortcut.blockType === 'divider' ? undefined : blockId);
      setSlashCommand(null);
      return;
    }

    const next = updateBlockText(previous, blockId, text);
    if (next !== previous) {
      pushTextEditHistory(blockId, previous);
    }
    emitChange(next);
  }, [commitDocument, emitChange, pushTextEditHistory]);

  const insertAfter = useCallback((afterBlockId: string, type: NoteBlockType = 'paragraph') => {
    const next = insertBlockAfterDoc(documentRef.current, afterBlockId, type);
    const list = flattenBlockIds(next);
    const anchorIndex = list.indexOf(afterBlockId);
    const focusId = anchorIndex >= 0 ? list[anchorIndex + 1] : undefined;
    commitDocument(next, focusId);
  }, [commitDocument]);

  const insertBlocksAfter = useCallback((afterBlockId: string, blocksToInsert: NoteBlock[]) => {
    if (!blocksToInsert.length) return;
    let next = documentRef.current;
    let anchorId = afterBlockId;
    for (const block of blocksToInsert) {
      next = applyTransaction(next, transaction({
        type: 'insertAfter',
        afterBlockId: anchorId,
        block,
      }));
      anchorId = block.id;
    }
    commitDocument(next, anchorId);
  }, [commitDocument]);

  const insertImageAfter = useCallback((afterBlockId: string, attachmentId: string, alt?: string) => {
    const next = applyTransaction(documentRef.current, transaction({
      type: 'insertImageAfter',
      afterBlockId,
      attachmentId,
      alt,
    }));
    const list = flattenBlockIds(next);
    const anchorIndex = list.indexOf(afterBlockId);
    const focusId = anchorIndex >= 0 ? list[anchorIndex + 2] : undefined;
    commitDocument(next, focusId);
  }, [commitDocument]);

  const appendLink = useCallback((blockId: string, url: string) => {
    const next = applyTransaction(documentRef.current, transaction({ type: 'appendLink', blockId, url }));
    commitDocument(next, blockId);
  }, [commitDocument]);

  const applyMarkdownFormat = useCallback((markType: Exclude<NoteTextMarkType, 'link'>) => {
    const selection = caret;
    if (!selection) return;
    const block = documentRef.current.blocks[selection.blockId];
    if (!block || !('text' in block) || block.text.length === 0) return;
    const from = selection.start === selection.end ? 0 : Math.min(selection.start, selection.end);
    const to = selection.start === selection.end ? block.text.length : Math.max(selection.start, selection.end);
    if (to <= from) return;

    const pair = markType === 'bold'
      ? ['**', '**']
      : markType === 'italic'
        ? ['_', '_']
        : ['`', '`'];
    const selected = block.text.slice(from, to);
    const nextText = `${block.text.slice(0, from)}${pair[0]}${selected}${pair[1]}${block.text.slice(to)}`;
    const next = updateBlockText(documentRef.current, selection.blockId, nextText);
    pushHistory(documentRef.current);
    emitChange(next);
    setFocusRequest({ blockId: selection.blockId, tick: Date.now() });
  }, [caret, emitChange, pushHistory]);

  const toggleTextMark = useCallback((markType: NoteTextMarkType, href?: string) => {
    const selection = caret;
    if (!selection) return;
    const block = documentRef.current.blocks[selection.blockId];
    if (!block || !('text' in block) || block.text.length === 0) return;
    const from = selection.start === selection.end ? 0 : Math.min(selection.start, selection.end);
    const to = selection.start === selection.end ? block.text.length : Math.max(selection.start, selection.end);
    const next = applyTransaction(documentRef.current, transaction({
      type: 'toggleTextMark',
      blockId: selection.blockId,
      markType,
      from,
      to,
      href,
    }));
    commitDocument(next, selection.blockId);
  }, [caret, commitDocument]);

  const splitBlock = useCallback((blockId: string, offset?: number) => {
    const block = documentRef.current.blocks[blockId];
    if (!block || !('text' in block)) {
      insertAfter(blockId, 'paragraph');
      return;
    }
    const splitOffset = offset ?? caret?.offset ?? block.text.length;
    const next = applyTransaction(documentRef.current, transaction({
      type: 'splitText',
      blockId,
      offset: splitOffset,
    }));
    const list = flattenBlockIds(next);
    const anchorIndex = list.indexOf(blockId);
    const focusId = anchorIndex >= 0 ? list[anchorIndex + 1] : undefined;
    commitDocument(next, focusId);
  }, [caret?.offset, commitDocument, insertAfter]);

  const deleteBlock = useCallback((blockId: string) => {
    const list = flattenBlockIds(documentRef.current);
    const index = list.indexOf(blockId);
    const nextFocus = index > 0 ? list[index - 1] : list[index + 1];
    const next = applyTransaction(documentRef.current, transaction({ type: 'delete', blockId }));
    commitDocument(next, nextFocus);
    return next;
  }, [commitDocument]);

  const duplicateBlock = useCallback((blockId: string) => {
    const next = applyTransaction(documentRef.current, transaction({ type: 'duplicate', blockId }));
    const list = flattenBlockIds(next);
    const anchorIndex = list.indexOf(blockId);
    const focusId = anchorIndex >= 0 ? list[anchorIndex + 1] : undefined;
    commitDocument(next, focusId);
  }, [commitDocument]);

  const convertBlock = useCallback((blockId: string, type: NoteBlockType) => {
    const next = applyTransaction(documentRef.current, transaction({
      type: 'convert',
      blockId,
      toType: type,
    }));
    commitDocument(next, blockId);
  }, [commitDocument]);

  const moveBlock = useCallback((blockId: string, afterBlockId: string | null) => {
    const next = applyTransaction(documentRef.current, transaction({
      type: 'move',
      blockId,
      afterBlockId,
    }));
    commitDocument(next, blockId);
  }, [commitDocument]);

  const indentBlock = useCallback((blockId: string) => {
    const next = applyTransaction(documentRef.current, transaction({
      type: 'indent',
      blockId,
    }));
    commitDocument(next, blockId);
  }, [commitDocument]);

  const outdentBlock = useCallback((blockId: string) => {
    const next = applyTransaction(documentRef.current, transaction({
      type: 'outdent',
      blockId,
    }));
    commitDocument(next, blockId);
  }, [commitDocument]);

  const mergeWithPrevious = useCallback((blockId: string) => {
    const list = flattenBlockIds(documentRef.current);
    const index = list.indexOf(blockId);
    const prevId = index > 0 ? list[index - 1] : undefined;
    const next = applyTransaction(documentRef.current, transaction({ type: 'mergeWithPrevious', blockId }));
    commitDocument(next, prevId);
  }, [commitDocument]);

  const toggleTodo = useCallback((blockId: string, checked: boolean) => {
    dispatch(transaction({ type: 'updateChecked', blockId, checked }));
  }, [dispatch]);

  const applyPatch = useCallback((patch: NoteAiPatch) => {
    const next = applyTransaction(documentRef.current, transaction({ type: 'applyPatch', patch }));
    const list = flattenBlockIds(next);
    commitDocument(next, list[0]);
  }, [commitDocument]);

  const focusBlock = useCallback((blockId: string) => {
    focusedBlockIdRef.current = blockId;
    setFocusRequest({ blockId, tick: Date.now() });
  }, []);

  const clearFocusRequest = useCallback((blockId: string) => {
    setFocusRequest((current) => (current?.blockId === blockId ? null : current));
  }, []);

  const setFocusedBlockId = useCallback((blockId: string) => {
    focusedBlockIdRef.current = blockId;
  }, []);

  const clearFocusedBlock = useCallback(() => {
    focusedBlockIdRef.current = null;
    setCaretState(null);
    setSlashCommand(null);
  }, []);

  const setCaret = useCallback((blockId: string, offset: number) => {
    focusedBlockIdRef.current = blockId;
    setCaretState({ blockId, offset, start: offset, end: offset });
    const block = documentRef.current.blocks[blockId];
    if (!block || !('text' in block)) {
      setSlashCommand(null);
      return;
    }
    const range = detectSlashCommand(block.text, offset);
    setSlashCommand(range ? { blockId, range } : null);
  }, []);

  const setTextSelection = useCallback((blockId: string, start: number, end: number) => {
    const offset = end;
    focusedBlockIdRef.current = blockId;
    setCaretState({ blockId, offset, start, end });
    const block = documentRef.current.blocks[blockId];
    if (!block || !('text' in block)) {
      setSlashCommand(null);
      return;
    }
    const range = detectSlashCommand(block.text, offset);
    setSlashCommand(range ? { blockId, range } : null);
  }, []);

  const toggleBlockSelection = useCallback((blockId: string) => {
    setSelectedBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const clearBlockSelection = useCallback(() => {
    setSelectedBlockIds(new Set());
  }, []);

  const deleteSelectedBlocks = useCallback(() => {
    const selected = new Set(selectedBlockIds);
    if (!selected.size) return;
    const ordered = flattenBlockIds(documentRef.current).filter((id) => selected.has(id));
    const tx = transaction(...ordered.map((blockId) => ({ type: 'delete' as const, blockId })));
    const next = applyTransaction(documentRef.current, tx);
    setSelectedBlockIds(new Set());
    commitDocument(next, flattenBlockIds(next)[0]);
  }, [commitDocument, selectedBlockIds]);

  const duplicateSelectedBlocks = useCallback(() => {
    const selected = new Set(selectedBlockIds);
    if (!selected.size) return;
    const ordered = flattenBlockIds(documentRef.current).filter((id) => selected.has(id));
    const tx = transaction(...ordered.map((blockId) => ({ type: 'duplicate' as const, blockId })));
    const next = applyTransaction(documentRef.current, tx);
    setSelectedBlockIds(new Set());
    commitDocument(next, ordered[ordered.length - 1]);
  }, [commitDocument, selectedBlockIds]);

  const applySlashCommand = useCallback((blockType: NoteBlockType) => {
    if (!slashCommand) return;
    const block = documentRef.current.blocks[slashCommand.blockId];
    if (!block || !('text' in block)) return;
    const text = removeSlashCommandText(block.text, slashCommand.range);
    const next = applyTransaction(documentRef.current, transaction({
      type: 'convert',
      blockId: block.id,
      toType: blockType,
    }, {
      type: 'updateText',
      blockId: block.id,
      text,
    }));
    setSlashCommand(null);
    commitDocument(next, blockType === 'divider' ? undefined : block.id);
  }, [commitDocument, slashCommand]);

  const dismissSlashCommand = useCallback(() => {
    setSlashCommand(null);
  }, []);

  const undo = useCallback(() => {
    clearTextEditHistoryGroup();
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current, documentRef.current];
    setHistoryTick((tick) => tick + 1);
    emitChange(previous);
  }, [clearTextEditHistoryGroup, emitChange]);

  const redo = useCallback(() => {
    clearTextEditHistoryGroup();
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current, documentRef.current];
    setHistoryTick((tick) => tick + 1);
    emitChange(next);
  }, [clearTextEditHistoryGroup, emitChange]);

  const canUndo = historyTick >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyTick >= 0 && redoStackRef.current.length > 0;

  return {
    document,
    documentRef,
    flatBlockIds,
    blocks,
    focusRequest,
    caret,
    slashCommand,
    selectedBlockIds,
    hasBlockSelection: selectedBlockIds.size > 0,
    focusedBlockIdRef,
    dispatch,
    setDocument,
    updateText,
    insertAfter,
    insertBlocksAfter,
    insertImageAfter,
    appendLink,
    applyMarkdownFormat,
    toggleTextMark,
    splitBlock,
    deleteBlock,
    duplicateBlock,
    convertBlock,
    indentBlock,
    outdentBlock,
    moveBlock,
    mergeWithPrevious,
    toggleTodo,
    applyPatch,
    focusBlock,
    clearFocusRequest,
    setFocusedBlockId,
    clearFocusedBlock,
    setCaret,
    setTextSelection,
    toggleBlockSelection,
    clearBlockSelection,
    deleteSelectedBlocks,
    duplicateSelectedBlocks,
    applySlashCommand,
    dismissSlashCommand,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
