import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import type { SuggestionProps } from '@tiptap/suggestion';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { createSlashCommandExtension } from './createSlashCommandExtension';
import { SlashMenu } from './SlashMenu.web';
import { createSlashItems, type SlashItem } from './slash-items';
import type { NoteBlockEditorProps, UnifiedEditor } from './types';

export const NoteBlockEditor = memo(function NoteBlockEditor({
  contentKey,
  initialHtml,
  onChange,
  onEditorReady,
  slashMenuOpen,
  onSlashMenuClose,
}: NoteBlockEditorProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const loadedKeyRef = useRef('');
  const isExternalUpdateRef = useRef(false);

  const slashItems = useMemo(() => createSlashItems(), []);
  const [manualSlashOpen, setManualSlashOpen] = useState(false);
  const [slashState, setSlashState] = useState<{
    items: SlashItem[];
    selectedIndex: number;
    command: ((item: SlashItem) => void) | null;
    clientRect: (() => DOMRect | null) | null;
  } | null>(null);

  const slashHandlersRef = useRef({
    onStart: (props: SuggestionProps<SlashItem>) => {
      setSlashState({
        items: props.items,
        selectedIndex: 0,
        command: (item) => props.command(item),
        clientRect: props.clientRect ?? null,
      });
    },
    onUpdate: (props: SuggestionProps<SlashItem>) => {
      setSlashState((prev) => ({
        items: props.items,
        selectedIndex: prev?.selectedIndex ?? 0,
        command: (item) => props.command(item),
        clientRect: props.clientRect ?? null,
      }));
    },
    onExit: () => setSlashState(null),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSlashState((prev) => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex + prev.items.length - 1) % prev.items.length,
        } : null);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSlashState((prev) => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % prev.items.length,
        } : null);
        return true;
      }
      if (event.key === 'Enter') {
        setSlashState((prev) => {
          if (prev?.items[prev.selectedIndex] && prev.command) {
            prev.command(prev.items[prev.selectedIndex]);
          }
          return null;
        });
        return true;
      }
      return false;
    },
  });

  const slashExtension = useMemo(
    () => createSlashCommandExtension(slashHandlersRef.current),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: pm.editorPlaceholderSlash,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      slashExtension,
    ],
    content: initialHtml,
    onUpdate: ({ editor: tiptapEditor }) => {
      if (isExternalUpdateRef.current) return;
      onChangeRef.current(tiptapEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const unified: UnifiedEditor = {
      toggleBold: () => { editor.chain().focus().toggleBold().run(); },
      toggleItalic: () => { editor.chain().focus().toggleItalic().run(); },
      toggleStrike: () => { editor.chain().focus().toggleStrike().run(); },
      toggleCode: () => { editor.chain().focus().toggleCode().run(); },
      toggleHeading: (level) => { editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run(); },
      setParagraph: () => { editor.chain().focus().setParagraph().run(); },
      toggleBulletList: () => { editor.chain().focus().toggleBulletList().run(); },
      toggleOrderedList: () => { editor.chain().focus().toggleOrderedList().run(); },
      toggleTaskList: () => { editor.chain().focus().toggleTaskList().run(); },
      toggleBlockquote: () => { editor.chain().focus().toggleBlockquote().run(); },
      toggleCodeBlock: () => { editor.chain().focus().toggleCodeBlock().run(); },
      setHorizontalRule: () => { editor.chain().focus().setHorizontalRule().run(); },
      undo: () => { editor.chain().focus().undo().run(); },
      redo: () => { editor.chain().focus().redo().run(); },
      focus: () => { editor.chain().focus().run(); },
      getHTML: () => editor.getHTML(),
      setContent: (html) => { editor.commands.setContent(html); },
    };
    onEditorReady?.(unified);
  }, [editor, onEditorReady]);

  // Reload only on external contentKey changes (note load / AI patch).
  useEffect(() => {
    if (!editor || loadedKeyRef.current === contentKey) return;
    loadedKeyRef.current = contentKey;
    isExternalUpdateRef.current = true;
    editor.commands.setContent(initialHtml);
    requestAnimationFrame(() => {
      isExternalUpdateRef.current = false;
    });
  }, [contentKey, initialHtml, editor]);

  useEffect(() => {
    if (slashMenuOpen) setManualSlashOpen(true);
  }, [slashMenuOpen]);

  const handleSlashSelect = useCallback((item: SlashItem) => {
    if (slashState?.command) {
      slashState.command(item);
    } else if (editor) {
      item.run(editor);
      editor.chain().focus().run();
    }
    setSlashState(null);
    setManualSlashOpen(false);
    onSlashMenuClose?.();
  }, [editor, onSlashMenuClose, slashState]);

  const manualMenuVisible = manualSlashOpen && !slashState;
  const manualClientRect = useCallback(
    () => ({
      bottom: 180,
      left: 24,
      top: 160,
      right: 260,
      width: 0,
      height: 0,
      x: 24,
      y: 160,
      toJSON: () => ({}),
    }) as DOMRect,
    [],
  );

  return (
    <div className="xopc-editor-container" style={containerStyle}>
      <style>{buildEditorCss(colors)}</style>
      {editor && <EditorContent editor={editor} style={editorContentStyle} />}
      {slashState && (
        <SlashMenu
          items={slashState.items}
          selectedIndex={slashState.selectedIndex}
          clientRect={slashState.clientRect}
          onSelect={handleSlashSelect}
        />
      )}
      {manualMenuVisible && (
        <SlashMenu
          items={slashItems}
          selectedIndex={0}
          clientRect={manualClientRect}
          onSelect={handleSlashSelect}
        />
      )}
    </div>
  );
});

const containerStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 200,
};

const editorContentStyle: React.CSSProperties = {
  flex: 1,
};

function buildEditorCss(colors: ReturnType<typeof useTheme>['colors']): string {
  return `
    .xopc-editor-container .tiptap {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: ${colors.text.primary};
      outline: none;
      min-height: 200px;
      padding-bottom: 24px;
    }
    .xopc-editor-container .tiptap h1 { font-size: 26px; font-weight: 700; margin: 12px 0 4px; }
    .xopc-editor-container .tiptap h2 { font-size: 22px; font-weight: 700; margin: 10px 0 4px; }
    .xopc-editor-container .tiptap h3 { font-size: 18px; font-weight: 600; margin: 8px 0 4px; }
    .xopc-editor-container .tiptap p { margin: 2px 0; min-height: 1.4em; }
    .xopc-editor-container .tiptap blockquote {
      border-left: 3px solid ${colors.accent.primary};
      padding-left: 12px;
      margin: 6px 0;
      color: ${colors.text.secondary};
      font-style: italic;
    }
    .xopc-editor-container .tiptap pre {
      background: ${colors.surface.input};
      border-radius: 8px;
      padding: 10px 12px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .xopc-editor-container .tiptap code {
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
    }
    .xopc-editor-container .tiptap p code {
      background: ${colors.surface.input};
      border-radius: 4px;
      padding: 1px 4px;
    }
    .xopc-editor-container .tiptap hr {
      border: none;
      border-top: 1px solid ${colors.border.default};
      margin: 14px 0;
    }
    .xopc-editor-container .tiptap ul,
    .xopc-editor-container .tiptap ol { padding-left: 20px; margin: 4px 0; }
    .xopc-editor-container .tiptap li { margin: 2px 0; }
    .xopc-editor-container .tiptap ul[data-type="taskList"] {
      list-style: none;
      padding-left: 0;
    }
    .xopc-editor-container .tiptap ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .xopc-editor-container .tiptap ul[data-type="taskList"] li label {
      margin-top: 3px;
    }
    .xopc-editor-container .tiptap ul[data-type="taskList"] li[data-checked="true"] > div > p {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .xopc-editor-container .tiptap p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: ${colors.text.tertiary};
      pointer-events: none;
      float: left;
      height: 0;
    }
    .xopc-editor-container .tiptap a { color: ${colors.accent.primary}; text-decoration: underline; }
    .xopc-editor-container .tiptap ::selection { background: ${colors.accent.selectionBg ?? 'rgba(109,93,251,0.2)'}; }
  `;
}
