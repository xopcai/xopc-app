import { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  RichText,
  useEditorBridge,
  TenTapStartKit,
  PlaceholderBridge,
} from '@10play/tentap-editor';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { blocksToHtml, htmlToBlocks } from '../note-blocks';
import type { NoteBlockEditorProps, UnifiedEditor } from './types';

// ── Custom CSS for editor appearance ───────────────────────

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
    ul[data-type="taskList"] li label {
      margin-top: 3px;
    }
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

// ── Component ──────────────────────────────────────────────

export const NoteBlockEditor = memo(function NoteBlockEditor({
  blocks,
  onChange,
  onEditorReady,
}: NoteBlockEditorProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const initialHtml = useRef(blocksToHtml(blocks));
  const isUpdatingFromOutside = useRef(false);
  const latestBlocksRef = useRef(blocks);
  latestBlocksRef.current = blocks;

  const editor = useEditorBridge({
    initialContent: initialHtml.current,
    autofocus: false,
    avoidIosKeyboard: true,
    bridgeExtensions: [
      ...TenTapStartKit,
      PlaceholderBridge.configureExtension({
        placeholder: pm.editorPlaceholderSlash,
      }),
    ],
  });

  // Wrap EditorBridge as UnifiedEditor for platform-agnostic API
  const unifiedEditor = useRef<UnifiedEditor | null>(null);
  if (!unifiedEditor.current) {
    unifiedEditor.current = {
      toggleBold: () => editor.toggleBold(),
      toggleItalic: () => editor.toggleItalic(),
      toggleStrike: () => editor.toggleStrike(),
      toggleCode: () => editor.toggleCode(),
      toggleHeading: (level: number) => editor.toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6),
      toggleBulletList: () => editor.toggleBulletList(),
      toggleOrderedList: () => editor.toggleOrderedList(),
      toggleTaskList: () => editor.toggleTaskList(),
      toggleBlockquote: () => editor.toggleBlockquote(),
      toggleCodeBlock: () => editor.injectJS('window.editor.chain().focus().toggleCodeBlock().run()'),
      setHorizontalRule: () => editor.injectJS('window.editor.chain().focus().setHorizontalRule().run()'),
      undo: () => editor.undo(),
      redo: () => editor.redo(),
      focus: () => editor.focus(),
      getHTML: () => editor.getHTML(),
      setContent: (html: string) => editor.setContent(html),
    };
  }

  // Notify parent when editor bridge is ready
  useEffect(() => {
    onEditorReady?.(unifiedEditor.current!);
  }, [editor, onEditorReady]);

  // Sync content changes back to parent as NoteBlock[]
  const handleContentChange = useCallback(async () => {
    if (isUpdatingFromOutside.current) return;
    try {
      const html = await editor.getHTML();
      const nextBlocks = htmlToBlocks(html);
      onChange(nextBlocks);
    } catch {
      // Editor might not be ready yet — ignore
    }
  }, [editor, onChange]);

  // Subscribe to editor content changes via the bridge's content update subscription
  useEffect(() => {
    const unsubscribe = editor._subscribeToContentUpdate(handleContentChange);
    return unsubscribe;
  }, [editor, handleContentChange]);

  // When blocks change from outside (e.g. AI patch), sync into editor
  useEffect(() => {
    const currentHtml = blocksToHtml(blocks);
    if (currentHtml !== initialHtml.current) {
      isUpdatingFromOutside.current = true;
      editor.setContent(currentHtml);
      initialHtml.current = currentHtml;
      // Small delay to allow the editor to process the update
      setTimeout(() => {
        isUpdatingFromOutside.current = false;
      }, 100);
    }
  }, [blocks, editor]);

  // Inject theme-aware CSS
  useEffect(() => {
    const css = buildEditorCss(colors);
    editor.injectCSS(css, 'xopc-editor-theme');
  }, [colors, editor]);

  return (
    <View style={styles.container}>
      <RichText
        editor={editor}
        style={[styles.richText, { backgroundColor: 'transparent' }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 200 },
  richText: { flex: 1 },
});
