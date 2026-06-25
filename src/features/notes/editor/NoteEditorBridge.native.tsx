import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '../../../components/BottomSheetModal';
import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, radii, spacing, useTheme } from '../../../theme';
import type { MarkdownRange } from '../markdown/markdown-document';
import {
  wrapMarkdownSelection,
} from '../markdown/markdown-insert';
import { getMarkdownEditorState } from '../markdown/markdown-editor-state';
import { applyMarkdownEnterBehaviorFromTextChange } from '../markdown/markdown-enter-behavior';
import { toggleMarkdownBullet, toggleMarkdownHeading, toggleMarkdownTodo } from '../markdown/markdown-toggle';
import { buildNativeEditorAiContext } from '../markdown/markdown-ai-context';
import {
  applyMarkdownLinkEdit,
  findMarkdownLinkAtSelection,
  getMarkdownLinkDraft,
  removeMarkdownLink,
} from '../markdown/markdown-link-edit';
import {
  deleteMarkdownImage,
  findMarkdownImageAtSelection,
  insertMarkdownImageBlock,
  replaceMarkdownImage,
  updateMarkdownImageCaption,
  type MarkdownImageAtSelection,
} from '../markdown/markdown-image-edit';
import {
  createNativeEditorHistory,
  pushNativeEditorHistory,
  redoNativeEditorHistory,
  undoNativeEditorHistory,
  type NativeEditorHistory,
  type NativeEditorHistoryReason,
} from '../markdown/native-editor-history';
import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorImagePickResult,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
} from './editor-protocol';
import { NoteEditorActionBar, type NativeEditorAction } from './NoteEditorActionBar.native';

const EDITOR_ACTION_BAR_HEIGHT = 72;
const EDITOR_AI_RAIL_HEIGHT = 124;
const TEXT_HISTORY_INTERVAL_MS = 900;

export interface NoteEditorBridgeProps {
  noteId: string;
  markdown: string;
  attachmentSrcMap?: Record<string, string>;
  labels: NoteEditorLabels;
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange: (context: EditorSelectionContext) => void;
  onRequestImage: () => Promise<EditorImagePickResult>;
  onRequestAi: (request: EditorAiRequest) => Promise<EditorAiResponse | null>;
  onApplyAiMetadata: (metadata: EditorAiMetadata) => Promise<void>;
  onRequestWikiLink: (query: string) => Promise<EditorWikiLinkCandidate[]>;
  onFocusChange?: (focused: boolean) => void;
}

export const NoteEditorBridge = memo(function NoteEditorBridge({
  markdown,
  attachmentSrcMap,
  labels,
  onChangeMarkdown,
  onSelectionChange,
  onRequestImage,
  onRequestAi,
  onApplyAiMetadata,
  onFocusChange,
}: NoteEditorBridgeProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const lastTextHistoryAtRef = useRef(0);
  const [selection, setSelection] = useState<MarkdownRange>({ start: 0, end: 0 });
  const [history, setHistory] = useState<NativeEditorHistory>(() => createNativeEditorHistory());
  const [active, setActive] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [linkSheet, setLinkSheet] = useState<{ visible: boolean; title: string; url: string }>({
    visible: false,
    title: '',
    url: '',
  });
  const [imageSheet, setImageSheet] = useState<{
    visible: boolean;
    image: NonNullable<MarkdownImageAtSelection> | null;
    caption: string;
  }>({
    visible: false,
    image: null,
    caption: '',
  });

  const editorState = useMemo(() => getMarkdownEditorState(markdown, selection), [markdown, selection]);
  const bottomPadding = EDITOR_ACTION_BAR_HEIGHT
    + (active && aiOpen ? EDITOR_AI_RAIL_HEIGHT : 0)
    + floatingBottomPadding(insets.bottom);

  const currentSnapshot = useCallback(() => ({
    markdown,
    selection,
  }), [markdown, selection]);

  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setActive(false);
      setAiOpen(false);
    });
    return () => {
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    setSelection((current) => {
      const start = Math.max(0, Math.min(current.start, markdown.length));
      const end = Math.max(0, Math.min(current.end, markdown.length));
      return start === current.start && end === current.end ? current : { start, end };
    });
  }, [markdown.length]);

  const activate = useCallback(() => {
    setActive(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = event.nativeEvent.selection;
    setSelection({ start, end });
    onSelectionChange(buildNativeEditorAiContext(markdown, start, end));
  }, [markdown, onSelectionChange]);

  const applyInsert = useCallback((
    result: { markdown: string; selection: MarkdownRange },
    recordHistory = true,
    reason: NativeEditorHistoryReason = 'toolbar',
  ) => {
    activate();
    if (recordHistory) {
      setHistory((current) => pushNativeEditorHistory(current, currentSnapshot(), { reason }));
    }
    onChangeMarkdown(result.markdown);
    setSelection(result.selection);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [activate, currentSnapshot, onChangeMarkdown]);

  const handleChangeText = useCallback((nextMarkdown: string) => {
    const enterResult = applyMarkdownEnterBehaviorFromTextChange(markdown, nextMarkdown, selection);
    if (enterResult) {
      applyInsert(enterResult, true, 'typing');
      return;
    }
    const now = Date.now();
    if (now - lastTextHistoryAtRef.current > TEXT_HISTORY_INTERVAL_MS) {
      setHistory((current) => pushNativeEditorHistory(current, currentSnapshot(), { reason: 'typing', now }));
      lastTextHistoryAtRef.current = now;
    }
    onChangeMarkdown(nextMarkdown);
  }, [applyInsert, currentSnapshot, markdown, onChangeMarkdown, selection]);

  const undo = useCallback(() => {
    const result = undoNativeEditorHistory(history, currentSnapshot());
    if (!result.snapshot) return;
    setHistory(result.history);
    applyInsert(result.snapshot, false);
  }, [applyInsert, currentSnapshot, history]);

  const redo = useCallback(() => {
    const result = redoNativeEditorHistory(history, currentSnapshot());
    if (!result.snapshot) return;
    setHistory(result.history);
    applyInsert(result.snapshot, false);
  }, [applyInsert, currentSnapshot, history]);

  const runAi = useCallback(async (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed || aiLoading) return;
    setAiLoading(true);
    activate();
    try {
      const result = await onRequestAi({
        instruction: trimmed,
        markdown,
        selection: buildNativeEditorAiContext(markdown, selection.start, selection.end),
      });
      if (!result) return;
      applyInsert({
        markdown: result.markdown,
        selection: { start: result.markdown.length, end: result.markdown.length },
      }, true, 'ai');
      await onApplyAiMetadata({
        title: result.title,
        tags: result.tags,
        status: result.status,
      });
      setAiInstruction('');
      setAiOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setAiLoading(false);
    }
  }, [activate, aiLoading, applyInsert, markdown, onApplyAiMetadata, onRequestAi, selection.end, selection.start]);

  const insertImage = useCallback(async () => {
    activate();
    const picked = await onRequestImage();
    if (!picked) return;
    applyInsert(insertMarkdownImageBlock(markdown, selection, {
      alt: picked.alt || labels.image,
      src: picked.src,
    }), true, 'image');
  }, [activate, applyInsert, labels.image, markdown, onRequestImage, selection]);

  const openLinkSheet = useCallback(() => {
    activate();
    const draft = getMarkdownLinkDraft(markdown, selection);
    setLinkSheet({
      visible: true,
      title: draft.title,
      url: draft.url,
    });
    if (draft.url) return;
    void Clipboard.getStringAsync().then((value) => {
      const clipboardUrl = value.trim();
      if (!isLikelyUrl(clipboardUrl)) return;
      setLinkSheet((current) => (
        current.visible && !current.url ? { ...current, url: clipboardUrl } : current
      ));
    }).catch(() => undefined);
  }, [activate, markdown, selection]);

  const applyLinkSheet = useCallback(() => {
    applyInsert(applyMarkdownLinkEdit(markdown, selection, {
      title: linkSheet.title,
      url: linkSheet.url,
    }), true, 'link');
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [applyInsert, linkSheet.title, linkSheet.url, markdown, selection]);

  const removeLink = useCallback(() => {
    applyInsert(removeMarkdownLink(markdown, selection), true, 'link');
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [applyInsert, markdown, selection]);

  const openImageAction = useCallback(() => {
    activate();
    const image = findMarkdownImageAtSelection(markdown, selection);
    if (!image) {
      void insertImage();
      return;
    }
    setImageSheet({
      visible: true,
      image,
      caption: image.alt,
    });
  }, [activate, insertImage, markdown, selection]);

  const replaceImage = useCallback(async () => {
    if (!imageSheet.image) return;
    const picked = await onRequestImage();
    if (!picked) return;
    applyInsert(replaceMarkdownImage(markdown, imageSheet.image, {
      alt: picked.alt || imageSheet.caption || labels.image,
      src: picked.src,
    }), true, 'image');
    setImageSheet({ visible: false, image: null, caption: '' });
  }, [applyInsert, imageSheet.caption, imageSheet.image, labels.image, markdown, onRequestImage]);

  const applyImageCaption = useCallback(() => {
    if (!imageSheet.image) return;
    applyInsert(updateMarkdownImageCaption(markdown, imageSheet.image, imageSheet.caption || labels.image), true, 'image');
    setImageSheet({ visible: false, image: null, caption: '' });
  }, [applyInsert, imageSheet.caption, imageSheet.image, labels.image, markdown]);

  const deleteImage = useCallback(() => {
    if (!imageSheet.image) return;
    applyInsert(deleteMarkdownImage(markdown, imageSheet.image), true, 'image');
    setImageSheet({ visible: false, image: null, caption: '' });
  }, [applyInsert, imageSheet.image, markdown]);

  const copyImageLink = useCallback(async () => {
    if (!imageSheet.image) return;
    await Clipboard.setStringAsync(imageSheet.image.src);
    setImageSheet({ visible: false, image: null, caption: '' });
  }, [imageSheet.image]);

  const actions = useMemo<NativeEditorAction[]>(() => [
    ...(history.past.length ? [{
      key: 'undo',
      label: labels.undo,
      icon: 'undo',
      onPress: undo,
    }] : []),
    ...(history.future.length ? [{
      key: 'redo',
      label: labels.redo,
      icon: 'redo',
      onPress: redo,
    }] : []),
    {
      key: 'bold',
      label: labels.bold,
      icon: 'format-bold',
      active: editorState.bold,
      onPress: () => applyInsert(wrapMarkdownSelection(markdown, selection, '**')),
    },
    {
      key: 'italic',
      label: labels.italic,
      icon: 'format-italic',
      active: editorState.italic,
      onPress: () => applyInsert(wrapMarkdownSelection(markdown, selection, '*')),
    },
    {
      key: 'todo',
      label: labels.todo,
      icon: 'checkbox-marked-outline',
      active: editorState.todo !== 'none',
      onPress: () => applyInsert(toggleMarkdownTodo(markdown, selection)),
    },
    {
      key: 'bullet',
      label: labels.bullet,
      icon: 'format-list-bulleted',
      active: editorState.bullet,
      onPress: () => applyInsert(toggleMarkdownBullet(markdown, selection)),
    },
    {
      key: 'heading',
      label: labels.heading,
      icon: 'format-header-2',
      active: editorState.headingLevel === 2,
      onPress: () => applyInsert(toggleMarkdownHeading(markdown, selection, 2)),
    },
    {
      key: 'link',
      label: labels.link,
      icon: 'link-variant',
      active: editorState.link || Boolean(findMarkdownLinkAtSelection(markdown, selection)),
      onPress: openLinkSheet,
    },
    {
      key: 'image',
      label: labels.image,
      icon: 'image-outline',
      active: Boolean(findMarkdownImageAtSelection(markdown, selection)),
      onPress: openImageAction,
    },
    {
      key: 'ai',
      label: labels.aiPlaceholder,
      icon: 'creation-outline',
      featured: true,
      onPress: () => {
        activate();
        setAiOpen((value) => !value);
      },
    },
  ], [activate, applyInsert, editorState, history.future.length, history.past.length, labels, markdown, openImageAction, openLinkSheet, redo, selection, undo]);

  const runPreset = useCallback((label: string) => {
    void runAi(label);
  }, [runAi]);

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        value={markdown}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
        onFocus={activate}
        placeholder={labels.placeholder}
        placeholderTextColor={colors.text.tertiary}
        multiline
        scrollEnabled
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect
        selection={selection}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface.base,
            color: colors.text.primary,
            paddingBottom: bottomPadding,
          },
        ]}
      />
      {active ? (
        <KeyboardStickyView
          offset={{ closed: 0, opened: 0 }}
          style={[
            styles.sticky,
            {
              backgroundColor: colors.surface.base,
              marginBottom: FLOATING_BOTTOM_OFFSET,
              paddingBottom: floatingBottomPadding(insets.bottom),
            },
          ]}
        >
        {aiOpen ? (
          <View
            style={[
              styles.aiRail,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                shadowColor: colors.text.primary,
              },
            ]}
          >
            <View style={styles.aiInputRow}>
              <TextInput
                value={aiInstruction}
                onChangeText={setAiInstruction}
                placeholder={labels.aiPlaceholder}
                placeholderTextColor={colors.text.tertiary}
                editable={!aiLoading}
                style={[
                  styles.aiInput,
                  {
                    backgroundColor: colors.surface.input,
                    color: colors.text.primary,
                    borderColor: colors.border.default,
                  },
                ]}
                returnKeyType="send"
                onSubmitEditing={() => void runAi(aiInstruction)}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.aiSend,
                  {
                    backgroundColor: aiInstruction.trim() && !aiLoading ? colors.accent.primary : colors.surface.input,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
                onPress={() => void runAi(aiInstruction)}
                disabled={!aiInstruction.trim() || aiLoading}
                accessibilityRole="button"
                accessibilityLabel={labels.aiApply}
                hitSlop={4}
              >
                <Icon
                  source={aiLoading ? 'loading' : 'arrow-up'}
                  size={18}
                  color={aiInstruction.trim() && !aiLoading ? colors.accent.onPrimary : colors.text.tertiary}
                />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aiPrompts}
            >
              {[labels.aiRewrite, labels.aiShorten, labels.aiContinue, labels.aiTodo].map((label) => (
                <Pressable
                  key={label}
                  style={({ pressed }) => [
                    styles.promptChip,
                    {
                      backgroundColor: pressed ? colors.surface.hover : colors.surface.input,
                      borderColor: colors.border.default,
                    },
                  ]}
                  onPress={() => runPreset(label)}
                  disabled={aiLoading}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text numberOfLines={1} style={[styles.promptText, { color: colors.text.secondary }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <NoteEditorActionBar actions={actions} />
        </KeyboardStickyView>
      ) : null}
      <BottomSheetModal
        visible={linkSheet.visible}
        onDismiss={() => setLinkSheet({ visible: false, title: '', url: '' })}
        title={labels.link}
        maxHeight="46%"
        keyboardAvoiding
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetLabel, { color: colors.text.secondary }]}>{labels.link}</Text>
          <TextInput
            value={linkSheet.title}
            onChangeText={(title) => setLinkSheet((current) => ({ ...current, title }))}
            placeholder={labels.link}
            placeholderTextColor={colors.text.tertiary}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surface.input,
                borderColor: colors.border.default,
                color: colors.text.primary,
              },
            ]}
          />
          <Text style={[styles.sheetLabel, { color: colors.text.secondary }]}>{labels.linkUrlPlaceholder}</Text>
          <TextInput
            value={linkSheet.url}
            onChangeText={(url) => setLinkSheet((current) => ({ ...current, url }))}
            placeholder={labels.linkUrlPlaceholder}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surface.input,
                borderColor: colors.border.default,
                color: colors.text.primary,
              },
            ]}
          />
          <View style={styles.sheetActions}>
            {findMarkdownLinkAtSelection(markdown, selection) ? (
              <Pressable
                style={[styles.sheetButton, { backgroundColor: colors.surface.input }]}
                onPress={removeLink}
                accessibilityRole="button"
                accessibilityLabel={labels.imageRemove}
              >
                <Text style={[styles.sheetButtonText, { color: colors.semantic.error }]}>{labels.imageRemove}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.sheetButton, styles.sheetButtonPrimary, { backgroundColor: colors.accent.primary }]}
              onPress={applyLinkSheet}
              accessibilityRole="button"
              accessibilityLabel={labels.aiApply}
            >
              <Text style={[styles.sheetButtonText, { color: colors.accent.onPrimary }]}>{labels.aiApply}</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>

      <BottomSheetModal
        visible={imageSheet.visible}
        onDismiss={() => setImageSheet({ visible: false, image: null, caption: '' })}
        title={labels.image}
        maxHeight="58%"
        keyboardAvoiding
      >
        <View style={styles.sheetBody}>
          {imageSheet.image && attachmentSrcMap?.[imageSheet.image.src] ? (
            <Image
              source={{ uri: attachmentSrcMap[imageSheet.image.src] }}
              style={[styles.imagePreview, { backgroundColor: colors.surface.input }]}
              resizeMode="cover"
            />
          ) : null}
          <Text style={[styles.sheetLabel, { color: colors.text.secondary }]}>{labels.imageCaption}</Text>
          <TextInput
            value={imageSheet.caption}
            onChangeText={(caption) => setImageSheet((current) => ({ ...current, caption }))}
            placeholder={labels.imageCaption}
            placeholderTextColor={colors.text.tertiary}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surface.input,
                borderColor: colors.border.default,
                color: colors.text.primary,
              },
            ]}
          />
          <View style={styles.imageActionsGrid}>
            <SheetTile icon="image-sync-outline" label={labels.imageReplace} onPress={() => void replaceImage()} />
            <SheetTile icon="content-copy" label={labels.imageCopyLink} onPress={() => void copyImageLink()} />
            <SheetTile icon="delete-outline" label={labels.imageRemove} destructive onPress={deleteImage} />
          </View>
          <Pressable
            style={[styles.sheetButton, styles.sheetButtonPrimary, { backgroundColor: colors.accent.primary }]}
            onPress={applyImageCaption}
            accessibilityRole="button"
            accessibilityLabel={labels.aiApply}
          >
            <Text style={[styles.sheetButtonText, { color: colors.accent.onPrimary }]}>{labels.aiApply}</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </View>
  );
});

function SheetTile({
  icon,
  label,
  destructive = false,
  onPress,
}: {
  icon: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = destructive ? colors.semantic.error : colors.text.secondary;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sheetTile,
        {
          backgroundColor: pressed ? colors.surface.hover : colors.surface.input,
          borderColor: colors.border.default,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon source={icon} size={20} color={fg} />
      <Text numberOfLines={1} style={[styles.sheetTileText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function isLikelyUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)\S+\.\S+$/i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/?\S*$/i.test(value);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  input: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 148,
    fontSize: 17,
    lineHeight: 27,
  },
  sticky: {
    paddingTop: spacing.xs,
  },
  aiRail: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    padding: spacing.sm,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 84,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 19,
  },
  aiSend: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiPrompts: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  promptChip: {
    minHeight: 34,
    maxWidth: 150,
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  promptText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  sheetBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  sheetLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  sheetInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  sheetButton: {
    minHeight: 44,
    minWidth: 92,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sheetButtonPrimary: {
    minWidth: 116,
  },
  sheetButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.lg,
  },
  imageActionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  sheetTile: {
    flex: 1,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  sheetTileText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
