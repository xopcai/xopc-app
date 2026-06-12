import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

function buildEditorCss(colors: ReturnType<typeof useTheme>['colors']): string {
  return `
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
    p { margin: 2px 0; min-height: 1.4em; }
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
    .ProseMirror:focus { outline: none; }
    .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: ${colors.text.tertiary};
      pointer-events: none;
      float: left;
      height: 0;
    }
    a { color: ${colors.accent.primary}; text-decoration: underline; }
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

export const NoteBlockEditor = memo(function NoteBlockEditor({
  contentKey,
  initialHtml,
  onChange,
  onEditorReady,
  slashMenuOpen,
  onSlashMenuClose,
  editable = true,
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

  const editor = useEditorBridge({
    initialContent: initialHtml,
    autofocus: false,
    avoidIosKeyboard: true,
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
        editor.injectJS(SLASH_DETECT_JS);
        void handleContentChange();
      }
    });
    return unsubscribe;
  }, [editor, handleContentChange]);

  useEffect(() => {
    if (loadedKeyRef.current === contentKey) return;
    loadedKeyRef.current = contentKey;
    isExternalUpdateRef.current = true;
    editor.setContent(initialHtml);
    setTimeout(() => {
      isExternalUpdateRef.current = false;
    }, 100);
  }, [contentKey, initialHtml, editor]);

  useEffect(() => {
    editor.injectCSS(buildEditorCss(colors), 'xopc-editor-theme');
  }, [colors, editor]);

  useEffect(() => {
    editor.injectJS(
      editable
        ? 'document.body.style.pointerEvents="auto";'
        : 'document.body.style.pointerEvents="none";',
    );
  }, [editable, editor]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as SlashDetectMessage;
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
  }, [manualSlashOpen]);

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

  const slashVisible = editable && Boolean(slashMenu || manualSlashOpen);
  const menuItems = manualSlashOpen && !slashMenu
    ? slashItems
    : filteredSlashItems;

  return (
    <View style={styles.container}>
      <RichText
        editor={editor}
        onMessage={handleWebViewMessage}
        exclusivelyUseCustomOnMessage={false}
        style={[styles.richText, { backgroundColor: 'transparent' }]}
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
  richText: { flex: 1 },
});
