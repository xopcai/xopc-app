import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { GestureResponderHandlers } from 'react-native';
import { NativeModules, Platform, Pressable, ScrollView, StyleSheet, TextInput, UIManager, View } from 'react-native';
import type { ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetModal } from '../../../components/BottomSheetModal';
import { FLOATING_BOTTOM_OFFSET, floatingBottomPadding, radii, spacing, useTheme } from '../../../theme';
import NoteEditorDomAdapter, { type NoteEditorAdapterCommand } from '../web-editor/NoteEditorDomAdapter';
import { DEFAULT_EDITOR_RUNTIME_STATE } from './editor-contract';
import type {
  EditorAttachmentPickSource,
  EditorCommand,
  EditorCommandInput,
  EditorAttachmentPickResult,
  NoteEditorHandle,
  EditorRuntimeState,
  EditorSelectionContext,
  NoteEditorLabels,
  NoteEditorTheme,
} from './editor-protocol';

type ToolbarAction = {
  key: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  panHandlers?: GestureResponderHandlers;
  onPress: () => void;
};

export type NoteEditorBridgeHandle = NoteEditorHandle;

type PendingFlush = {
  resolve: (markdown: string) => void;
};

function sameEditorState(a: EditorRuntimeState, b: EditorRuntimeState): boolean {
  return a.ready === b.ready
    && a.focused === b.focused
    && a.selection.from === b.selection.from
    && a.selection.to === b.selection.to
    && a.canUndo === b.canUndo
    && a.canRedo === b.canRedo
    && a.todo === b.todo
    && a.link === b.link
    && a.image === b.image;
}

function isExpoDomWebViewAvailable(): boolean {
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'android') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  if (NativeModules.ExpoDomWebViewModule) return true;
  try {
    return Boolean(
      UIManager.getViewManagerConfig?.('ViewManagerAdapter_ExpoDomWebViewModule')
        || UIManager.getViewManagerConfig?.('RCTViewManagerAdapter_ExpoDomWebViewModule'),
    );
  } catch {
    return false;
  }
}

function attachmentMarkdown(attachment: NonNullable<EditorAttachmentPickResult>): string {
  const label = attachment.alt?.trim() || (attachment.kind === 'image' ? 'image' : 'attachment');
  if (attachment.kind === 'image') return `![${label}](${attachment.src})`;
  if (attachment.kind === 'audio' && attachment.transcript?.trim()) {
    return `[${label}](${attachment.src})\n\n${attachment.transcript.trim()}`;
  }
  return `[${label}](${attachment.src})`;
}

export interface NoteEditorBridgeProps {
  noteId: string;
  markdown: string;
  attachmentSrcMap?: Record<string, string>;
  topCommand?: EditorCommand | null;
  labels: NoteEditorLabels;
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange: (context: EditorSelectionContext) => void;
  onRequestAttachment: (source: EditorAttachmentPickSource) => Promise<EditorAttachmentPickResult>;
  onFocusChange?: (focused: boolean) => void;
  onRuntimeStateChange?: (state: EditorRuntimeState) => void;
  voiceFeedback?: ReactNode;
  voicePanHandlers?: GestureResponderHandlers;
  voiceActive?: boolean;
  voiceDisabled?: boolean;
}

export const NoteEditorBridge = memo(forwardRef<NoteEditorBridgeHandle, NoteEditorBridgeProps>(function NoteEditorBridge({
  noteId,
  markdown,
  attachmentSrcMap,
  topCommand,
  labels,
  onChangeMarkdown,
  onSelectionChange,
  onRequestAttachment,
  onFocusChange,
  onRuntimeStateChange,
  voiceFeedback,
  voicePanHandlers,
  voiceActive,
  voiceDisabled,
}, ref) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const commandIdRef = useRef(0);
  const flushRequestIdRef = useRef(0);
  const pendingFlushesRef = useRef(new Map<number, PendingFlush>());
  const latestMarkdownRef = useRef(markdown);
  const [command, setCommand] = useState<NoteEditorAdapterCommand | null>(null);
  const [editorState, setEditorState] = useState<EditorRuntimeState>(DEFAULT_EDITOR_RUNTIME_STATE);
  const editorStateRef = useRef<EditorRuntimeState>(DEFAULT_EDITOR_RUNTIME_STATE);
  const pendingEditorStateRef = useRef<EditorRuntimeState | null>(null);
  const editorStateFrameRef = useRef<number | null>(null);
  const [linkSheet, setLinkSheet] = useState({ visible: false, title: '', url: '' });
  const [imageSheetVisible, setImageSheetVisible] = useState(false);
  const canUseDomEditor = useMemo(() => isExpoDomWebViewAvailable(), []);
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
    scrollEnabled: true,
    containerStyle: styles.domContainer,
    style: styles.dom,
  }), []);

  const handleChange = useCallback(async (nextMarkdown: string) => {
    latestMarkdownRef.current = nextMarkdown;
    onChangeMarkdown(nextMarkdown);
  }, [onChangeMarkdown]);

  const handleSelectionChange = useCallback(async (context: EditorSelectionContext) => {
    onSelectionChange(context);
  }, [onSelectionChange]);

  const handleStateChange = useCallback((state: EditorRuntimeState) => {
    if (
      sameEditorState(editorStateRef.current, state)
      || (pendingEditorStateRef.current && sameEditorState(pendingEditorStateRef.current, state))
    ) {
      return;
    }
    pendingEditorStateRef.current = state;
    if (editorStateFrameRef.current != null) return;
    editorStateFrameRef.current = requestAnimationFrame(() => {
      editorStateFrameRef.current = null;
      const next = pendingEditorStateRef.current;
      pendingEditorStateRef.current = null;
      if (!next || sameEditorState(editorStateRef.current, next)) return;
      editorStateRef.current = next;
      setEditorState(next);
      onRuntimeStateChange?.(next);
    });
  }, [onRuntimeStateChange]);

  useEffect(() => () => {
    if (editorStateFrameRef.current != null) {
      cancelAnimationFrame(editorStateFrameRef.current);
      editorStateFrameRef.current = null;
    }
    pendingFlushesRef.current.forEach(({ resolve }) => {
      resolve(latestMarkdownRef.current);
    });
    pendingFlushesRef.current.clear();
  }, []);

  useEffect(() => {
    latestMarkdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    onFocusChange?.(editorState.focused);
  }, [editorState.focused, onFocusChange]);

  useEffect(() => {
    if (canUseDomEditor) return;
    const fallbackState: EditorRuntimeState = {
      ...DEFAULT_EDITOR_RUNTIME_STATE,
      ready: true,
      focused: editorStateRef.current.focused,
    };
    editorStateRef.current = fallbackState;
    setEditorState(fallbackState);
    onRuntimeStateChange?.(fallbackState);
  }, [canUseDomEditor, onRuntimeStateChange]);

  const dispatch = useCallback((next: EditorCommandInput) => {
    commandIdRef.current += 1;
    setCommand({ id: commandIdRef.current, ...next } as EditorCommand);
  }, []);

  useEffect(() => {
    if (!topCommand) return;
    commandIdRef.current += 1;
    setCommand({ ...topCommand, id: commandIdRef.current } as EditorCommand);
  }, [topCommand]);

  const handleFlushMarkdown = useCallback(async (requestId: number, nextMarkdown: string) => {
    latestMarkdownRef.current = nextMarkdown;
    const pending = pendingFlushesRef.current.get(requestId);
    if (!pending) return;
    pendingFlushesRef.current.delete(requestId);
    pending.resolve(nextMarkdown);
  }, []);

  const flushMarkdown = useCallback(() => new Promise<string>((resolve) => {
    if (!canUseDomEditor || !editorStateRef.current.ready) {
      resolve(latestMarkdownRef.current);
      return;
    }
    flushRequestIdRef.current += 1;
    commandIdRef.current += 1;
    const requestId = flushRequestIdRef.current;
    pendingFlushesRef.current.set(requestId, { resolve });
    setCommand({
      id: commandIdRef.current,
      type: 'requestMarkdownFlush',
      requestId,
    });
  }), [canUseDomEditor]);

  useImperativeHandle(ref, () => ({
    flushMarkdown,
  }), [flushMarkdown]);

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

  const insertFallbackMarkdown = useCallback((inserted: string) => {
    const source = latestMarkdownRef.current;
    const selection = editorStateRef.current.selection;
    const from = Math.max(0, Math.min(selection.from, source.length));
    const to = Math.max(from, Math.min(selection.to, source.length));
    const needsLeadingBreak = from > 0 && source[from - 1] !== '\n';
    const needsTrailingBreak = to < source.length && source[to] !== '\n';
    const chunk = `${needsLeadingBreak ? '\n' : ''}${inserted}${needsTrailingBreak ? '\n' : ''}`;
    const nextMarkdown = `${source.slice(0, from)}${chunk}${source.slice(to)}`;
    latestMarkdownRef.current = nextMarkdown;
    onChangeMarkdown(nextMarkdown);
    const cursor = from + chunk.length;
    const nextState = {
      ...editorStateRef.current,
      selection: { from: cursor, to: cursor },
    };
    editorStateRef.current = nextState;
    setEditorState(nextState);
    onRuntimeStateChange?.(nextState);
  }, [onChangeMarkdown, onRuntimeStateChange]);

  const applyLink = useCallback(() => {
    if (!canUseDomEditor) {
      const source = latestMarkdownRef.current;
      const selection = editorStateRef.current.selection;
      const selected = source.slice(selection.from, selection.to).trim();
      const title = linkSheet.title.trim() || selected || linkSheet.url.trim();
      insertFallbackMarkdown(`[${title}](${linkSheet.url.trim()})`);
      setLinkSheet({ visible: false, title: '', url: '' });
      return;
    }
    dispatch({ type: 'setLink', title: linkSheet.title, url: linkSheet.url });
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [canUseDomEditor, dispatch, insertFallbackMarkdown, linkSheet.title, linkSheet.url]);

  const removeLink = useCallback(() => {
    dispatch({ type: 'removeLink' });
    setLinkSheet({ visible: false, title: '', url: '' });
  }, [dispatch]);

  const handleInsertImageFromLibrary = useCallback(() => {
    setImageSheetVisible(false);
    if (!canUseDomEditor) {
      void onRequestAttachment('photos').then((attachment) => {
        if (attachment) insertFallbackMarkdown(attachmentMarkdown(attachment));
      });
      return;
    }
    dispatch({ type: 'insertAttachment', source: 'photos' });
  }, [canUseDomEditor, dispatch, insertFallbackMarkdown, onRequestAttachment]);

  const handleInsertImageFromCamera = useCallback(() => {
    setImageSheetVisible(false);
    if (!canUseDomEditor) {
      void onRequestAttachment('camera').then((attachment) => {
        if (attachment) insertFallbackMarkdown(attachmentMarkdown(attachment));
      });
      return;
    }
    dispatch({ type: 'insertAttachment', source: 'camera' });
  }, [canUseDomEditor, dispatch, insertFallbackMarkdown, onRequestAttachment]);

  const handleInsertDocument = useCallback(() => {
    if (!canUseDomEditor) {
      void onRequestAttachment('document').then((attachment) => {
        if (attachment) insertFallbackMarkdown(attachmentMarkdown(attachment));
      });
      return;
    }
    dispatch({ type: 'insertAttachment', source: 'document' });
  }, [canUseDomEditor, dispatch, insertFallbackMarkdown, onRequestAttachment]);

  const actions = useMemo<ToolbarAction[]>(() => [
    {
      key: 'todo',
      label: labels.todo,
      icon: 'checkbox-marked-outline',
      active: editorState.todo,
      onPress: () => {
        if (canUseDomEditor) dispatch({ type: 'toggleTaskList' });
        else insertFallbackMarkdown('- [ ] ');
      },
    },
    {
      key: 'image',
      label: labels.image,
      icon: 'image-outline',
      active: editorState.image,
      onPress: () => setImageSheetVisible(true),
    },
    {
      key: 'file',
      label: labels.imageDocument,
      icon: 'file-document-outline',
      onPress: handleInsertDocument,
    },
    {
      key: 'audio',
      label: labels.audio,
      icon: 'microphone-outline',
      active: voiceActive,
      disabled: voiceDisabled,
      panHandlers: voicePanHandlers,
      onPress: () => undefined,
    },
    {
      key: 'link',
      label: labels.link,
      icon: 'link-variant',
      active: editorState.link,
      onPress: openLinkSheet,
    },
  ], [
    canUseDomEditor,
    dispatch,
    editorState.image,
    editorState.link,
    editorState.todo,
    handleInsertDocument,
    insertFallbackMarkdown,
    labels.audio,
    labels.image,
    labels.imageDocument,
    labels.link,
    labels.todo,
    openLinkSheet,
    voiceActive,
    voiceDisabled,
    voicePanHandlers,
  ]);
  const showEditorToolbar = editorState.focused || imageSheetVisible || linkSheet.visible || Boolean(voiceActive);

  return (
    <View style={styles.container}>
      {canUseDomEditor ? (
        <NoteEditorDomAdapter
          noteId={noteId}
          initialMarkdown={markdown}
          attachmentSrcMap={attachmentSrcMap}
          editable
          theme={editorTheme}
          labels={labels}
          command={command}
          onChangeMarkdown={handleChange}
          onSelectionChange={handleSelectionChange}
          onStateChange={handleStateChange}
          onRequestAttachment={onRequestAttachment}
          onFlushMarkdown={handleFlushMarkdown}
          dom={domProps}
        />
      ) : (
        <TextInput
          value={markdown}
          onChangeText={(next) => {
            latestMarkdownRef.current = next;
            onChangeMarkdown(next);
          }}
          onFocus={() => {
            const focusedState = { ...editorStateRef.current, focused: true };
            editorStateRef.current = focusedState;
            setEditorState(focusedState);
            onRuntimeStateChange?.(focusedState);
          }}
          onBlur={() => {
            const blurredState = { ...editorStateRef.current, focused: false };
            editorStateRef.current = blurredState;
            setEditorState(blurredState);
            onRuntimeStateChange?.(blurredState);
          }}
          onSelectionChange={(event) => {
            const selection = event.nativeEvent.selection;
            const nextState = {
              ...editorStateRef.current,
              selection: { from: selection.start, to: selection.end },
            };
            editorStateRef.current = nextState;
            setEditorState(nextState);
            onRuntimeStateChange?.(nextState);
            onSelectionChange({
              from: selection.start,
              to: selection.end,
              markdown: latestMarkdownRef.current,
              currentBlockMarkdown: latestMarkdownRef.current,
              beforeMarkdown: latestMarkdownRef.current.slice(0, selection.start),
              afterMarkdown: latestMarkdownRef.current.slice(selection.end),
            });
          }}
          multiline
          placeholder={labels.placeholder}
          placeholderTextColor={colors.text.tertiary}
          textAlignVertical="top"
          style={[
            styles.fallbackInput,
            {
              backgroundColor: colors.surface.base,
              color: colors.text.primary,
            },
          ]}
        />
      )}
      {showEditorToolbar ? (
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
        visible={imageSheetVisible}
        onDismiss={() => setImageSheetVisible(false)}
        title={labels.image}
        maxHeight="44%"
      >
        <View style={styles.imageMenu}>
          <ImageSourceRow
            label={labels.imageFromLibrary}
            icon="image-multiple-outline"
            onPress={handleInsertImageFromLibrary}
          />
          <ImageSourceRow label={labels.imageCamera} icon="camera-outline" onPress={handleInsertImageFromCamera} />
        </View>
      </BottomSheetModal>
      {voiceFeedback}

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
                accessibilityLabel={labels.removeLink}
              >
                <Text style={[styles.sheetButtonText, { color: colors.semantic.error }]}>{labels.removeLink}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.sheetButton, styles.sheetButtonPrimary, { backgroundColor: colors.accent.primary }]}
              onPress={applyLink}
              accessibilityRole="button"
              accessibilityLabel={labels.apply}
              disabled={!linkSheet.url.trim()}
            >
              <Text style={[styles.sheetButtonText, { color: colors.accent.onPrimary }]}>{labels.apply}</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>
    </View>
  );
}));

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
          const selected = action.active;
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
              {...action.panHandlers}
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

function ImageSourceRow({
  label,
  icon,
  disabled,
  suffix,
  onPress,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  suffix?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.imageMenuRow,
        {
          backgroundColor: pressed && !disabled ? colors.surface.hover : 'transparent',
          opacity: disabled ? 0.42 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Icon source={icon} size={22} color={colors.text.secondary} />
      <Text style={[styles.imageMenuLabel, { color: colors.text.primary }]}>{label}</Text>
      {suffix ? <Text style={[styles.imageMenuSuffix, { color: colors.text.tertiary }]}>{suffix}</Text> : null}
    </Pressable>
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
  fallbackInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    fontSize: 16,
    lineHeight: 24,
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
    width: 44,
    height: 44,
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
  imageMenu: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  imageMenuRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
  },
  imageMenuLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  imageMenuSuffix: {
    fontSize: 12,
    lineHeight: 16,
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
