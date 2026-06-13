import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import {
  RichText,
  useEditorBridge,
  TenTapStartKit,
  PlaceholderBridge,
} from '@10play/tentap-editor';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { createSlashItems, filterSlashItems, type SlashItem } from './slash-items';
import { SlashMenu } from './SlashMenu.native';
import type { NoteBlockEditorProps, UnifiedEditor } from './types';

const SLASH_DETECT_JS = `
(function () {
  if (!window.editor) return true;
  var state = window.editor.state;
  var from = state.selection.from;
  var $from = state.selection.$from;
  var textBefore = $from.parent.textBetween(0, $from.parentOffset, null, '\\0');
  var match = textBefore.match(/\\/(\\w*)$/);
  if (match) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'xopc-slash',
      active: true,
      query: match[1] || '',
      from: from - match[0].length,
      to: from,
    }));
  } else {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'xopc-slash', active: false }));
  }
  return true;
})();
`;

const FOCUS_START_JS = `
(function () {
  if (!window.editor) return true;
  window.editor.commands.focus('start');
  return true;
})();
`;

const RESET_SCROLL_JS = `
(function () {
  var scroller = document.querySelector('#root > div:nth-of-type(1)');
  if (scroller) scroller.scrollTop = 0;
  return true;
})();
`;

const HIDE_SCROLLBAR_CSS = `
  #root > div:nth-of-type(1) {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  #root > div:nth-of-type(1)::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
    background: transparent;
  }
`;

function buildEditorCss(colors: ReturnType<typeof useTheme>['colors']): string {
  return `
    ${HIDE_SCROLLBAR_CSS}
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: ${colors.text.primary};
      padding: 0;
      margin: 0;
      caret-color: ${colors.accent.primary};
    }
    h1 { font-size: 26px; font-weight: 700; margin: 12px 0 4px; }
    h2 { font-size: 22px; font-weight: 700; margin: 10px 0 4px; }
    h3 { font-size: 18px; font-weight: 600; margin: 8px 0 4px; }
    p { margin: 2px 0; }
    blockquote {
      border-left: 3px solid ${colors.accent.primary};
      padding-left: 12px;
      margin: 6px 0;
      color: ${colors.text.secondary};
      font-style: italic;
    }
    pre {
      background: ${colors.surface.input};
      border-radius: 8px;
      padding: 10px 12px;
      overflow-x: auto;
      margin: 6px 0;
    }
    code {
      font-family: ${Platform.OS === 'ios' ? 'Menlo' : 'monospace'};
      font-size: 13px;
    }
    p code {
      background: ${colors.surface.input};
      border-radius: 4px;
      padding: 1px 4px;
      font-size: 13px;
    }
    hr {
      border: none;
      border-top: 1px solid ${colors.border.default};
      margin: 14px 0;
    }
    ul, ol { padding-left: 20px; margin: 4px 0; }
    li { margin: 2px 0; }
    ul[data-type="taskList"] {
      list-style: none;
      padding-left: 0;
    }
    ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    ul[data-type="taskList"] li label { margin-top: 3px; }
    ul[data-type="taskList"] li[data-checked="true"] > div > p {
      text-decoration: line-through;
      opacity: 0.6;
    }
    #root div .ProseMirror {
      min-height: auto;
    }
    .ProseMirror p.is-editor-empty:first-child > br {
      display: none;
    }
    .ProseMirror:focus { outline: none; }
    .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: ${colors.text.tertiary};
      pointer-events: none;
      float: left;
      height: 0;
    }
    a { color: ${colors.accent.primary}; text-decoration: underline; }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 8px 0;
      display: block;
    }
    ::selection { background: ${colors.accent.selectionBg}; }
  `;
}

interface SlashDetectMessage {
  type: 'xopc-slash';
  active: boolean;
  query?: string;
  from?: number;
  to?: number;
}

interface SegmentFocusMessage {
  type: 'xopc-segment-focus';
}

export const NoteBlockEditor = memo(function NoteBlockEditor({
  contentKey,
  initialHtml,
  onChange,
  onEditorReady,
  slashMenuOpen,
  onSlashMenuClose,
  editable = true,
  focusOnEnable = false,
  onFocusApplied,
  embedded = false,
  onSegmentFocus,
  segmentKey,
}: NoteBlockEditorProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const loadedKeyRef = useRef('');
  const isExternalUpdateRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const slashItems = useMemo(() => createSlashItems(), []);
  const [slashMenu, setSlashMenu] = useState<{
    query: string;
    range: { from: number; to: number };
    selectedIndex: number;
  } | null>(null);
  const [manualSlashOpen, setManualSlashOpen] = useState(false);

  const [keyboardSeed, setKeyboardSeed] = useState(false);

  const editor = useEditorBridge({
    initialContent: initialHtml,
    autofocus: false,
    editable,
    avoidIosKeyboard: !embedded,
    dynamicHeight: embedded,
    bridgeExtensions: [
      ...TenTapStartKit,
      PlaceholderBridge.configureExtension({
        placeholder: pm.editorPlaceholderSlash,
      }),
    ],
  });

  const filteredSlashItems = useMemo(
    () => filterSlashItems(slashItems, slashMenu?.query ?? ''),
    [slashItems, slashMenu?.query],
  );

  const unifiedEditor = useMemo<UnifiedEditor>(() => ({
    toggleBold: () => editor.toggleBold(),
    toggleItalic: () => editor.toggleItalic(),
    toggleStrike: () => editor.toggleStrike(),
    toggleCode: () => editor.toggleCode(),
    toggleHeading: (level: number) => editor.toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6),
    setParagraph: () => editor.injectJS('window.editor.chain().focus().setParagraph().run()'),
    toggleBulletList: () => editor.toggleBulletList(),
    toggleOrderedList: () => editor.toggleOrderedList(),
    toggleTaskList: () => editor.toggleTaskList(),
    toggleBlockquote: () => editor.toggleBlockquote(),
    toggleCodeBlock: () => editor.injectJS('window.editor.chain().focus().toggleCodeBlock().run()'),
    setHorizontalRule: () => editor.injectJS('window.editor.chain().focus().setHorizontalRule().run()'),
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    focus: () => editor.focus(),
    insertText: (text: string) => {
      editor.injectJS(
        `(function(){var t=${JSON.stringify(text)};window.editor.chain().focus().insertContent(t).run();})()`,
      );
    },
    insertImage: (src: string, alt?: string) => {
      if (embedded) return;
      if (typeof editor.setImage === 'function') {
        editor.setImage(src);
        return;
      }
      const altAttr = alt ? ` alt=${JSON.stringify(alt)}` : '';
      editor.injectJS(
        `(function(){var s=${JSON.stringify(src)};window.editor.chain().focus().insertContent('<img src="'+s+'"${altAttr}>').run();})()`,
      );
    },
    getHTML: () => editor.getHTML(),
    setContent: (html: string) => editor.setContent(html),
    applySlashCommand: (commandId, range) => {
      const item = slashItems.find((entry) => entry.id === commandId);
      if (!item) return;
      if (range) {
        editor.injectJS(
          `window.editor.chain().focus().deleteRange({ from: ${range.from}, to: ${range.to} }).run()`,
        );
      }
      item.run(unifiedEditor);
      editor.focus();
    },
  }), [editor, slashItems]);

  useEffect(() => {
    onEditorReady?.(unifiedEditor);
  }, [onEditorReady, unifiedEditor]);

  const handleContentChange = useCallback(async () => {
    if (isExternalUpdateRef.current) return;
    try {
      const html = await editor.getHTML();
      onChangeRef.current(html);
    } catch {
      // Editor not ready yet
    }
  }, [editor]);

  useEffect(() => {
    const unsubscribe = editor._subscribeToContentUpdate(() => {
      if (!isExternalUpdateRef.current) {
        try {
          editor.injectJS(SLASH_DETECT_JS);
        } catch {
          // WebView may be torn down during navigation.
        }
        void handleContentChange();
      }
    });
    return unsubscribe;
  }, [editor, handleContentChange]);

  const resetEditorScroll = useCallback(() => {
    try {
      editor.injectJS(RESET_SCROLL_JS);
    } catch {
      // WebView may be torn down during navigation.
    }
  }, [editor]);

  useEffect(() => {
    if (loadedKeyRef.current === contentKey) return;
    loadedKeyRef.current = contentKey;
    isExternalUpdateRef.current = true;
    editor.setContent(initialHtml);
    setTimeout(() => {
      isExternalUpdateRef.current = false;
      if (!embedded) resetEditorScroll();
    }, 100);
  }, [contentKey, embedded, initialHtml, editor, resetEditorScroll]);

  useEffect(() => {
    if (editable || embedded) return;
    resetEditorScroll();
  }, [editable, embedded, resetEditorScroll]);

  useEffect(() => {
    try {
      editor.injectCSS(buildEditorCss(colors), 'xopc-editor-theme');
    } catch {
      // WebView may be torn down during navigation.
    }
  }, [colors, editor]);

  const applyEditorFocus = useCallback(() => {
    editor.focus('start');
    try {
      editor.injectJS(FOCUS_START_JS);
    } catch {
      // WebView may be torn down during navigation.
    }
    if (!embedded) resetEditorScroll();
    onFocusApplied?.();
  }, [editor, embedded, onFocusApplied, resetEditorScroll]);

  useEffect(() => {
    if (!editable || !focusOnEnable) return;
    setKeyboardSeed(true);
  }, [editable, focusOnEnable]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as SlashDetectMessage | SegmentFocusMessage;
      if (data.type === 'xopc-segment-focus') {
        onSegmentFocus?.();
        return;
      }
      if (data.type !== 'xopc-slash') return;
      if (data.active && data.from != null && data.to != null) {
        setSlashMenu({
          query: data.query ?? '',
          range: { from: data.from, to: data.to },
          selectedIndex: 0,
        });
        setManualSlashOpen(false);
      } else if (!manualSlashOpen) {
        setSlashMenu(null);
      }
    } catch {
      // Ignore non-JSON messages from TenTap
    }
  }, [manualSlashOpen, onSegmentFocus]);

  useEffect(() => {
    if (slashMenuOpen) setManualSlashOpen(true);
  }, [slashMenuOpen]);

  const handleSlashSelect = useCallback((item: SlashItem) => {
    if (slashMenu) {
      unifiedEditor.applySlashCommand?.(item.id, slashMenu.range);
    } else {
      item.run(unifiedEditor);
      editor.focus();
    }
    setSlashMenu(null);
    setManualSlashOpen(false);
    onSlashMenuClose?.();
  }, [editor, onSlashMenuClose, slashMenu, unifiedEditor]);

  useEffect(() => {
    if (!embedded) return;
    try {
      editor.injectJS(`
        (function () {
          if (window.__xopcSegmentFocusBound) return true;
          window.__xopcSegmentFocusBound = true;
          document.addEventListener('focusin', function () {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'xopc-segment-focus' }));
          }, true);
          return true;
        })();
      `);
    } catch {
      // WebView may be torn down during navigation.
    }
  }, [editor, embedded, segmentKey]);

  const slashVisible = editable && Boolean(slashMenu || manualSlashOpen);
  const menuItems = manualSlashOpen && !slashMenu
    ? slashItems
    : filteredSlashItems;

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {keyboardSeed ? (
        <TextInput
          autoFocus
          caretHidden
          style={styles.hiddenInput}
          onFocus={() => {
            setKeyboardSeed(false);
            const delay = Platform.OS === 'android' ? 100 : 40;
            setTimeout(() => applyEditorFocus(), delay);
          }}
        />
      ) : null}
      <RichText
        editor={editor}
        onMessage={handleWebViewMessage}
        exclusivelyUseCustomOnMessage={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onLoad={() => {
          if (!embedded) resetEditorScroll();
        }}
        style={[styles.richText, embedded && styles.richTextEmbedded, { backgroundColor: 'transparent' }]}
      />
      <SlashMenu
        items={menuItems}
        selectedIndex={slashMenu?.selectedIndex ?? 0}
        visible={slashVisible}
        onSelect={handleSlashSelect}
        onDismiss={() => {
          setSlashMenu(null);
          setManualSlashOpen(false);
          onSlashMenuClose?.();
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 200 },
  containerEmbedded: { flex: 0, minHeight: 48 },
  richText: { flex: 1 },
  richTextEmbedded: { flex: 0, minHeight: 48 },
  hiddenInput: {
    display: 'none',
    width: 0,
    height: 0,
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
