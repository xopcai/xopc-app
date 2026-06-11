import type { Editor } from '@tiptap/core';

import type { UnifiedEditor } from './types';

export interface SlashItem {
  id: string;
  titleKey: keyof typeof SLASH_TITLE_KEYS;
  icon: string;
  keywords: string[];
  run: (editor: Editor | UnifiedEditor) => void;
}

/** Keys map to notesPage i18n fields. */
export const SLASH_TITLE_KEYS = {
  paragraph: 'editorBlockParagraph',
  heading1: 'editorBlockHeading',
  heading2: 'editorBlockHeading',
  heading3: 'editorBlockHeading',
  todo: 'editorBlockTodo',
  bulletList: 'editorBlockBulletList',
  numberedList: 'editorBlockNumberedList',
  quote: 'editorBlockQuote',
  code: 'editorBlockCode',
  divider: 'editorBlockDivider',
} as const;

function isTiptapEditor(editor: Editor | UnifiedEditor): editor is Editor {
  return 'chain' in editor && typeof editor.chain === 'function';
}

export function createSlashItems(): SlashItem[] {
  return [
    {
      id: 'paragraph',
      titleKey: 'paragraph',
      icon: '¶',
      keywords: ['text', 'paragraph', '正文', '段落'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().setParagraph().run();
        else editor.setParagraph();
      },
    },
    {
      id: 'heading1',
      titleKey: 'heading1',
      icon: 'H1',
      keywords: ['heading', 'h1', 'title', '标题', '大标题'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleHeading({ level: 1 }).run();
        else editor.toggleHeading(1);
      },
    },
    {
      id: 'heading2',
      titleKey: 'heading2',
      icon: 'H2',
      keywords: ['heading', 'h2', 'subtitle', '标题'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleHeading({ level: 2 }).run();
        else editor.toggleHeading(2);
      },
    },
    {
      id: 'heading3',
      titleKey: 'heading3',
      icon: 'H3',
      keywords: ['heading', 'h3', '标题'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleHeading({ level: 3 }).run();
        else editor.toggleHeading(3);
      },
    },
    {
      id: 'todo',
      titleKey: 'todo',
      icon: '☑',
      keywords: ['todo', 'task', 'checkbox', '待办', '任务'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleTaskList().run();
        else editor.toggleTaskList();
      },
    },
    {
      id: 'bulletList',
      titleKey: 'bulletList',
      icon: '•',
      keywords: ['bullet', 'list', 'ul', '列表'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleBulletList().run();
        else editor.toggleBulletList();
      },
    },
    {
      id: 'numberedList',
      titleKey: 'numberedList',
      icon: '1.',
      keywords: ['numbered', 'ordered', 'ol', '编号'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleOrderedList().run();
        else editor.toggleOrderedList();
      },
    },
    {
      id: 'quote',
      titleKey: 'quote',
      icon: '❝',
      keywords: ['quote', 'blockquote', '引用'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleBlockquote().run();
        else editor.toggleBlockquote();
      },
    },
    {
      id: 'code',
      titleKey: 'code',
      icon: '{ }',
      keywords: ['code', 'pre', '代码'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().toggleCodeBlock().run();
        else editor.toggleCodeBlock();
      },
    },
    {
      id: 'divider',
      titleKey: 'divider',
      icon: '—',
      keywords: ['divider', 'hr', 'line', '分割', '分隔'],
      run: (editor) => {
        if (isTiptapEditor(editor)) editor.chain().focus().setHorizontalRule().run();
        else editor.setHorizontalRule();
      },
    },
  ];
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    if (item.id.includes(q)) return true;
    return item.keywords.some((keyword) => keyword.toLowerCase().includes(q));
  });
}

export function getSlashItemTitle(
  item: SlashItem,
  labels: Record<string, string>,
): string {
  const key = SLASH_TITLE_KEYS[item.titleKey];
  const base = labels[key] ?? item.id;
  if (item.id === 'heading1') return `${base} 1`;
  if (item.id === 'heading2') return `${base} 2`;
  if (item.id === 'heading3') return `${base} 3`;
  return base;
}
