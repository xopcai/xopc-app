import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '../../../components/BottomSheetModal';
import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, radii, spacing, useTheme } from '../../../theme';
import NoteWebEditor from '../web-editor/NoteWebEditor';
import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorCommand,
  EditorImagePickResult,
  EditorRuntimeState,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
  NoteEditorTheme,
} from './editor-protocol';

type ToolbarAction = {
  key: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  featured?: boolean;
  onPress: () => void;
};

type EditorCommandInput = EditorCommand extends infer Command
  ? Command extends { id: number }
    ? Omit<Command, 'id'>
    : never
  : never;

const EMPTY_EDITOR_STATE: EditorRuntimeState = {
  ready: false,
  focused: false,
  selection: { from: 0, to: 0 },
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  todo: false,
  bullet: false,
  ordered: false,
  quote: false,
  code: false,
  headingLevel: 0,
  link: false,
  image: false,
};

function sameEditorState(a: EditorRuntimeState, b: EditorRuntimeState): boolean {
  return a.ready === b.ready
    && a.focused === b.focused
    && a.selection.from === b.selection.from
    && a.selection.to === b.selection.to
    && a.canUndo === b.canUndo
    && a.canRedo === b.canRedo
    && a.bold === b.bold
    && a.italic === b.italic
    && a.todo === b.todo
    && a.bullet === b.bullet
    && a.ordered === b.ordered
    && a.quote === b.quote
    && a.code === b.code
    && a.headingLevel === b.headingLevel
    && a.link === b.link
    && a.image === b.image;
}

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
  noteId,
  markdown,
  attachmentSrcMap,
  labels,
  onChangeMarkdown,
  onSelectionChange,
  onRequestImage,
  onRequestAi,
  onApplyAiMetadata,
  onRequestWikiLink,
  onFocusChange,
}: NoteEditorBridgeProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const commandIdRef = useRef(0);
  const [command, setCommand] = useState<EditorCommand | null>(null);
  const [editorState, setEditorState] = useState<EditorRuntimeState>(EMPTY_EDITOR_STATE);
  const [linkSheet, setLinkSheet] = useState({ visible: false, title: '', url: '' });
  const editorTheme = useMemo<NoteEditorTheme>(() => ({
    background: colors.surface.base,
    panel: colors.surface.panel,
    input: colors.surface.input,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textTertiary: colors.text.tertiary,
    border: colors.border.default,
    accent: colors.accent.primary,
    accentSoft: colors.accent.selectionBg,
    danger: colors.semantic.error,
  }), [colors]);
  const domProps = useMemo(() => ({
    scrollEnabled: false,
    containerStyle: styles.domContainer,
    style: styles.dom,
  }), []);

  const handleChange = useCallback(async (nextMarkdown: string) => {
    onChangeMarkdown(nextMarkdown);
  }, [onChangeMarkdown]);

  const handleSelectionChange = useCallback(async (context: EditorSelectionContext) => {
    onSelectionChange(context);
  }, [onSelectionChange]);

  const handleStateChange = useCallback((state: EditorRuntimeState) => {
    setEditorState((current) => (sameEditorState(current, state) ? current : state));
  }, []);

  useEffect(() => {
    onFocusChange?.(editorState.focused);
  }, [editorState.focused, onFocusChange]);

  const dispatch = useCallback((next: EditorCommandInput) => {
    commandIdRef.current += 1;
    setCommand({ id: commandIdRef.current, ...next } as EditorCommand);
  }, []);

  const openLinkSheet = useCallback(() => {
    setLinkSheet({ visible: true, title: '', url: '' });
    void Clipboard.getStringAsync().then((value) => {
      const clipboardUrl = value.trim();
      if (!isLikelyUrl(clipboardUrl)) return;
      setLinkSheet((current) => (
        current.visible && !current.url ? { ...current, url: clipboardUrl } : current
      ));
    }).catch(() => undefined);
  }, []);

  const applyLink = useCallback(() => {
    dispatch({ type: 'setLink', title: linkSheet.title, url: linkSheet.url });
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [dispatch, linkSheet.title, linkSheet.url]);

  const removeLink = useCallback(() => {
    dispatch({ type: 'removeLink' });
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [dispatch]);

  const actions = useMemo<ToolbarAction[]>(() => [
    ...(editorState.canUndo ? [{
      key: 'undo',
      label: labels.undo,
      icon: 'undo',
      onPress: () => dispatch({ type: 'undo' }),
    }] : []),
    ...(editorState.canRedo ? [{
      key: 'redo',
      label: labels.redo,
      icon: 'redo',
      onPress: () => dispatch({ type: 'redo' }),
    }] : []),
    {
      key: 'bold',
      label: labels.bold,
      icon: 'format-bold',
      active: editorState.bold,
      onPress: () => dispatch({ type: 'toggleBold' }),
    },
    {
      key: 'italic',
      label: labels.italic,
      icon: 'format-italic',
      active: editorState.italic,
      onPress: () => dispatch({ type: 'toggleItalic' }),
    },
    {
      key: 'todo',
      label: labels.todo,
      icon: 'checkbox-marked-outline',
      active: editorState.todo,
      onPress: () => dispatch({ type: 'toggleTaskList' }),
    },
    {
      key: 'bullet',
      label: labels.bullet,
      icon: 'format-list-bulleted',
      active: editorState.bullet,
      onPress: () => dispatch({ type: 'toggleBulletList' }),
    },
    {
      key: 'ordered',
      label: labels.ordered,
      icon: 'format-list-numbered',
      active: editorState.ordered,
      onPress: () => dispatch({ type: 'toggleOrderedList' }),
    },
    {
      key: 'heading',
      label: labels.heading,
      icon: 'format-header-2',
      active: editorState.headingLevel === 2,
      onPress: () => dispatch({ type: 'toggleHeading', level: 2 }),
    },
    {
      key: 'quote',
      label: labels.quote,
      icon: 'format-quote-close',
      active: editorState.quote,
      onPress: () => dispatch({ type: 'toggleBlockquote' }),
    },
    {
      key: 'code',
      label: labels.code,
      icon: 'code-tags',
      active: editorState.code,
      onPress: () => dispatch({ type: 'toggleCodeBlock' }),
    },
    {
      key: 'link',
      label: labels.link,
      icon: 'link-variant',
      active: editorState.link,
      onPress: openLinkSheet,
    },
    {
      key: 'image',
      label: labels.image,
      icon: 'image-outline',
      active: editorState.image,
      onPress: () => dispatch({ type: 'insertImage' }),
    },
    {
      key: 'wiki',
      label: labels.wikiLink,
      icon: 'file-link-outline',
      onPress: () => dispatch({ type: 'openWikiLink' }),
    },
    {
      key: 'ai',
      label: labels.aiPlaceholder,
      icon: 'creation-outline',
      featured: true,
      onPress: () => dispatch({ type: 'toggleAi' }),
    },
  ], [dispatch, editorState, labels, openLinkSheet]);

  const toolbarVisible = editorState.focused || linkSheet.visible;

  return (
    <View style={styles.container}>
      <NoteWebEditor
        noteId={noteId}
        initialMarkdown={markdown}
        attachmentSrcMap={attachmentSrcMap}
        theme={editorTheme}
        labels={labels}
        command={command}
        onChangeMarkdown={handleChange}
        onSelectionChange={handleSelectionChange}
        onStateChange={handleStateChange}
        onRequestImage={onRequestImage}
        onRequestAi={onRequestAi}
        onApplyAiMetadata={onApplyAiMetadata}
        onRequestWikiLink={onRequestWikiLink}
        dom={domProps}
      />
      {toolbarVisible ? (
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
          <EditorToolbar
            actions={actions}
            isDark={isDark}
            colors={colors}
          />
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
          <TextInputShim
            value={linkSheet.title}
            onChangeText={(title) => setLinkSheet((current) => ({ ...current, title }))}
            placeholder={labels.link}
          />
          <Text style={[styles.sheetLabel, { color: colors.text.secondary }]}>{labels.linkUrlPlaceholder}</Text>
          <TextInputShim
            value={linkSheet.url}
            onChangeText={(url) => setLinkSheet((current) => ({ ...current, url }))}
            placeholder={labels.linkUrlPlaceholder}
            autoCapitalize="none"
          />
          <View style={styles.sheetActions}>
            {editorState.link ? (
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
              onPress={applyLink}
              accessibilityRole="button"
              accessibilityLabel={labels.aiApply}
              disabled={!linkSheet.url.trim()}
            >
              <Text style={[styles.sheetButtonText, { color: colors.accent.onPrimary }]}>{labels.aiApply}</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>
    </View>
  );
});

function EditorToolbar({
  actions,
  isDark,
  colors,
}: {
  actions: ToolbarAction[];
  isDark: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={[
        styles.toolbar,
        {
          backgroundColor: isDark ? colors.surface.panel : colors.surface.base,
          borderColor: colors.border.default,
          shadowColor: colors.text.primary,
        },
      ]}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbarContent}
      >
        {actions.map((action) => {
          const selected = action.featured || action.active;
          return (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                styles.toolButton,
                {
                  backgroundColor: selected ? colors.accent.selectionBg : colors.surface.input,
                  borderColor: selected ? colors.accent.primary : colors.border.default,
                  opacity: action.disabled ? 0.42 : pressed ? 0.68 : 1,
                },
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={4}
            >
              <Icon
                source={action.icon}
                size={19}
                color={selected ? colors.accent.primary : colors.text.secondary}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TextInputShim({
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences';
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text.tertiary}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCapitalize !== 'none'}
      keyboardType={autoCapitalize === 'none' ? 'url' : 'default'}
      style={[
        styles.sheetInput,
        {
          backgroundColor: colors.surface.input,
          borderColor: colors.border.default,
          color: colors.text.primary,
        },
      ]}
    />
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
  domContainer: {
    flex: 1,
  },
  dom: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sticky: {
    paddingTop: spacing.xs,
  },
  toolbar: {
    marginHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  toolbarContent: {
    minHeight: 48,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
});
