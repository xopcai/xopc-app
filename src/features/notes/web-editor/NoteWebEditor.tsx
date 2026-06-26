'use dom';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from 'tiptap-markdown';

import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorAttachmentPickSource,
  EditorAttachmentPickResult,
  EditorCommand,
  EditorRuntimeState,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
  NoteEditorTheme,
} from '../editor/editor-protocol';

type DomProps = import('expo/dom').DOMProps;

export interface NoteWebEditorProps {
  noteId: string;
  initialMarkdown: string;
  attachmentSrcMap?: Record<string, string>;
  editable?: boolean;
  theme: NoteEditorTheme;
  labels: NoteEditorLabels;
  command?: EditorCommand | null;
  dom?: DomProps;
  onChangeMarkdown: (markdown: string) => Promise<void>;
  onSelectionChange: (context: EditorSelectionContext) => Promise<void>;
  onStateChange?: (state: EditorRuntimeState) => Promise<void> | void;
  onRequestEdit?: () => Promise<void> | void;
  onRequestAttachment: (source: EditorAttachmentPickSource) => Promise<EditorAttachmentPickResult>;
  onRequestAi: (request: EditorAiRequest) => Promise<EditorAiResponse | null>;
  onApplyAiMetadata: (metadata: EditorAiMetadata) => Promise<void>;
  onRequestWikiLink: (query: string) => Promise<EditorWikiLinkCandidate[]>;
}

type PendingAiPreview = EditorAiResponse & {
  beforeMarkdown: string;
  beforeSnippet: string;
  afterSnippet: string;
};

const EMPTY_IMAGE_SRC = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E';

const UnderlineMark = Mark.create({
  name: 'underline',
  parseHTML() {
    return [
      { tag: 'u' },
      {
        style: 'text-decoration',
        consuming: false,
        getAttrs: (value) => (typeof value === 'string' && value.includes('underline') ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0];
  },
});

const TextAlignAttribute = Extension.create({
  name: 'xopcTextAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) => {
              const align = attributes.textAlign;
              return align === 'center' || align === 'right' ? { style: `text-align: ${align}` } : {};
            },
          },
        },
      },
    ];
  },
});

function isXopcAttachmentSrc(src: string): boolean {
  return src.startsWith('xopc-attachment://');
}

function markdownFromEditor(editor: NonNullable<ReturnType<typeof useEditor>>): string {
  const storage = editor.storage as unknown as { markdown?: { getMarkdown?: () => string } };
  return storage.markdown?.getMarkdown?.() ?? editor.getText();
}

function setEditorMarkdown(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  markdown: string,
): void {
  editor.commands.setContent(markdown, { emitUpdate: false });
}

function selectionContext(markdown: string, from: number, to: number): EditorSelectionContext {
  const start = Math.max(0, Math.min(from, to, markdown.length));
  const end = Math.max(0, Math.min(Math.max(from, to), markdown.length));
  const beforeBreak = markdown.lastIndexOf('\n\n', start - 1);
  const afterBreak = markdown.indexOf('\n\n', end);
  const blockStart = beforeBreak < 0 ? 0 : beforeBreak + 2;
  const blockEnd = afterBreak < 0 ? markdown.length : afterBreak;
  return {
    from: start,
    to: end,
    markdown: markdown.slice(start, end),
    currentBlockMarkdown: markdown.slice(blockStart, blockEnd),
    beforeMarkdown: markdown.slice(Math.max(0, blockStart - 1200), blockStart),
    afterMarkdown: markdown.slice(blockEnd, Math.min(markdown.length, blockEnd + 1200)),
  };
}

function editorRuntimeState(editor: NonNullable<ReturnType<typeof useEditor>>): EditorRuntimeState {
  const { from, to } = editor.state.selection;
  const textAlign = getActiveTextAlign(editor);
  return {
    ready: true,
    focused: editor.isFocused,
    selection: { from, to },
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    todo: editor.isActive('taskList'),
    bullet: editor.isActive('bulletList'),
    ordered: editor.isActive('orderedList'),
    quote: editor.isActive('blockquote'),
    code: editor.isActive('codeBlock'),
    headingLevel: editor.isActive('heading', { level: 1 })
      ? 1
      : editor.isActive('heading', { level: 2 })
        ? 2
        : editor.isActive('heading', { level: 3 })
          ? 3
          : 0,
    textAlign,
    link: editor.isActive('link'),
    image: editor.isActive('image'),
  };
}

function getActiveTextAlign(editor: NonNullable<ReturnType<typeof useEditor>>): EditorRuntimeState['textAlign'] {
  const raw = editor.getAttributes('heading').textAlign || editor.getAttributes('paragraph').textAlign;
  return raw === 'center' || raw === 'right' ? raw : 'left';
}

function setTextAlign(editor: NonNullable<ReturnType<typeof useEditor>>, align: EditorRuntimeState['textAlign']): void {
  const chain = editor.chain().focus();
  if (editor.isActive('heading')) {
    chain.updateAttributes('heading', { textAlign: align === 'left' ? null : align }).run();
    return;
  }
  chain.updateAttributes('paragraph', { textAlign: align === 'left' ? null : align }).run();
}

function adjustListIndent(editor: NonNullable<ReturnType<typeof useEditor>>, direction: 'in' | 'out'): void {
  const chain = editor.chain().focus();
  if (direction === 'in') {
    if (editor.can().sinkListItem('listItem')) {
      chain.sinkListItem('listItem').run();
      return;
    }
    if (editor.can().sinkListItem('taskItem')) {
      chain.sinkListItem('taskItem').run();
    }
    return;
  }

  if (editor.can().liftListItem('listItem')) {
    chain.liftListItem('listItem').run();
    return;
  }
  if (editor.can().liftListItem('taskItem')) {
    chain.liftListItem('taskItem').run();
  }
}

function sanitizeLinkText(value: string): string {
  return value.replace(/[<>&]/g, '');
}

function isLikelyUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)\S+\.\S+$/i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/?\S*$/i.test(value);
}

function normalizedUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^www\./i, 'www.')}`;
}

export default function NoteWebEditor({
  noteId,
  initialMarkdown,
  attachmentSrcMap,
  editable = true,
  theme,
  labels,
  command,
  onChangeMarkdown,
  onSelectionChange,
  onStateChange,
  onRequestEdit,
  onRequestAttachment,
  onRequestAi,
  onApplyAiMetadata,
  onRequestWikiLink,
}: NoteWebEditorProps) {
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentSrcMapRef = useRef<Record<string, string>>(attachmentSrcMap ?? {});
  const latestMarkdownRef = useRef(initialMarkdown);
  const lastSentMarkdownRef = useRef(initialMarkdown);
  const noteIdRef = useRef(noteId);
  const contentSeededRef = useRef(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingAi, setPendingAi] = useState<PendingAiPreview | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiCandidates, setWikiCandidates] = useState<EditorWikiLinkCandidate[]>([]);
  const handledCommandIdRef = useRef<number | null>(null);

  attachmentSrcMapRef.current = attachmentSrcMap ?? {};

  const XopcImage = useMemo(() => Image.extend({
    renderHTML({ HTMLAttributes }) {
      const canonicalSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
      const displaySrc = canonicalSrc ? attachmentSrcMapRef.current[canonicalSrc] : undefined;
      const attrs = displaySrc
        ? { ...HTMLAttributes, src: displaySrc, 'data-xopc-src': canonicalSrc }
        : isXopcAttachmentSrc(canonicalSrc)
          ? { ...HTMLAttributes, src: EMPTY_IMAGE_SRC, 'data-xopc-src': canonicalSrc }
          : HTMLAttributes;
      return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)];
    },
  }), []);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineMark,
      TextAlignAttribute,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: { class: 'xopc-editor-link' },
      }),
      XopcImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'xopc-editor-image' },
      }),
      Placeholder.configure({
        placeholder: labels.placeholder,
      }),
      Markdown.configure({
        html: true,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'xopc-editor-content',
        autocapitalize: 'sentences',
        autocomplete: 'on',
        autocorrect: 'on',
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const markdown = markdownFromEditor(nextEditor);
      latestMarkdownRef.current = markdown;
      void onStateChange?.(editorRuntimeState(nextEditor));
      if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
      changeTimerRef.current = setTimeout(() => {
        if (lastSentMarkdownRef.current === latestMarkdownRef.current) return;
        lastSentMarkdownRef.current = latestMarkdownRef.current;
        void onChangeMarkdown(latestMarkdownRef.current);
      }, 240);
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const markdown = markdownFromEditor(nextEditor);
      latestMarkdownRef.current = markdown;
      const { from, to } = nextEditor.state.selection;
      void onStateChange?.(editorRuntimeState(nextEditor));
      void onSelectionChange(selectionContext(markdown, from, to));
    },
    onFocus: ({ editor: nextEditor }) => {
      void onStateChange?.(editorRuntimeState(nextEditor));
    },
    onBlur: ({ editor: nextEditor }) => {
      void onStateChange?.(editorRuntimeState(nextEditor));
    },
    onCreate: ({ editor: nextEditor }) => {
      void onStateChange?.(editorRuntimeState(nextEditor));
    },
  }, [XopcImage, labels.placeholder, onSelectionChange, onStateChange]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    void onStateChange?.(editorRuntimeState(editor));
  }, [editable, editor, onStateChange]);

  useEffect(() => {
    if (editable) return;
    setAiOpen(false);
    setPendingAi(null);
    setWikiOpen(false);
  }, [editable]);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;
    root.querySelectorAll<HTMLImageElement>('img[data-xopc-src]').forEach((img) => {
      const canonicalSrc = img.getAttribute('data-xopc-src') ?? '';
      const displaySrc = attachmentSrcMapRef.current[canonicalSrc];
      if (displaySrc && img.getAttribute('src') !== displaySrc) {
        img.setAttribute('src', displaySrc);
      } else if (!displaySrc && isXopcAttachmentSrc(canonicalSrc) && img.getAttribute('src') !== EMPTY_IMAGE_SRC) {
        img.setAttribute('src', EMPTY_IMAGE_SRC);
      }
    });
  }, [attachmentSrcMap, editor]);

  useEffect(() => {
    if (!editor) return;
    const noteChanged = noteIdRef.current !== noteId;
    const externalChanged = initialMarkdown !== latestMarkdownRef.current;
    const localClean = latestMarkdownRef.current === lastSentMarkdownRef.current;
    if (contentSeededRef.current && !noteChanged && (!externalChanged || !localClean)) return;
    contentSeededRef.current = true;
    noteIdRef.current = noteId;
    latestMarkdownRef.current = initialMarkdown;
    lastSentMarkdownRef.current = initialMarkdown;
    setEditorMarkdown(editor, initialMarkdown);
    void onStateChange?.(editorRuntimeState(editor));
  }, [editor, initialMarkdown, noteId, onStateChange]);

  useEffect(() => () => {
    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
  }, []);

  const runAi = useCallback(async (instruction: string) => {
    if (!editor || !editable || aiLoading) return;
    const trimmed = instruction.trim();
    if (!trimmed) return;
    const markdown = markdownFromEditor(editor);
    const { from, to } = editor.state.selection;
    setAiLoading(true);
    try {
      const result = await onRequestAi({
        instruction: trimmed,
        markdown,
        selection: selectionContext(markdown, from, to),
      });
      if (result) {
        setPendingAi({
          ...result,
          beforeMarkdown: markdown,
          ...diffPreview(markdown, result.markdown),
        });
      }
      setAiInstruction('');
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, editable, editor, onRequestAi]);

  const applyPendingAi = useCallback(() => {
    if (!editor || !editable || !pendingAi) return;
    setEditorMarkdown(editor, pendingAi.markdown);
    latestMarkdownRef.current = pendingAi.markdown;
    lastSentMarkdownRef.current = pendingAi.markdown;
    void onChangeMarkdown(pendingAi.markdown);
    void onApplyAiMetadata({
      title: pendingAi.title,
      tags: pendingAi.tags,
      status: pendingAi.status,
    });
    setPendingAi(null);
    setAiOpen(false);
  }, [editable, editor, onApplyAiMetadata, onChangeMarkdown, pendingAi]);

  const insertAttachment = useCallback(async (source: EditorAttachmentPickSource) => {
    if (!editor || !editable) return;
    const picked = await onRequestAttachment(source);
    if (!picked) return;
    const label = sanitizeLinkText(picked.alt?.trim() || 'attachment');
    if (picked.kind === 'document') {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: label,
          marks: [{ type: 'link', attrs: { href: picked.src } }],
        })
        .run();
      return;
    }
    if (picked.displaySrc) {
      attachmentSrcMapRef.current = {
        ...attachmentSrcMapRef.current,
        [picked.src]: picked.displaySrc,
      };
    }
    editor.chain().focus().setImage({ src: picked.src, alt: picked.alt }).run();
  }, [editable, editor, onRequestAttachment]);

  const applyLink = useCallback((title: string, url: string) => {
    if (!editor || !editable) return;
    const href = normalizedUrl(url);
    if (!href || !isLikelyUrl(href)) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, ' ').trim();
    const label = (title.trim() || selected || href).trim();
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: sanitizeLinkText(label),
        marks: [{ type: 'link', attrs: { href } }],
      })
      .run();
  }, [editable, editor]);

  const removeLink = useCallback(() => {
    if (!editor || !editable) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }, [editable, editor]);

  const focusEditorFromSurface = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!editor) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, a')) return;
    if (!editable) {
      void onRequestEdit?.();
      return;
    }
    const content = editor.view.dom;
    if (target && !content.contains(target)) {
      editor.commands.focus('end');
      return;
    }
    editor.commands.focus();
  }, [editable, editor, onRequestEdit]);

  const openWikiLink = useCallback(() => {
    if (!editor || !editable) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, ' ').trim();
    setWikiQuery(selected);
    setWikiOpen(true);
    setWikiCandidates([]);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.xopc-editor-wiki-bar input');
      input?.focus();
    }, 0);
  }, [editable, editor]);

  const insertWikiLink = useCallback((title: string) => {
    if (!editor || !editable) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    editor.chain().focus().insertContent(`[[${trimmed}]]`).run();
    setWikiOpen(false);
    setWikiQuery('');
    setWikiCandidates([]);
  }, [editable, editor]);

  useEffect(() => {
    if (!wikiOpen) return;
    let cancelled = false;
    setWikiLoading(true);
    const timer = setTimeout(() => {
      void onRequestWikiLink(wikiQuery)
        .then((items) => {
          if (!cancelled) setWikiCandidates(items);
        })
        .finally(() => {
          if (!cancelled) setWikiLoading(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onRequestWikiLink, wikiOpen, wikiQuery]);

  useEffect(() => {
    if (!editor || !editable || !command || handledCommandIdRef.current === command.id) return;
    handledCommandIdRef.current = command.id;

    switch (command.type) {
      case 'focus':
        editor.commands.focus(command.position ?? undefined);
        break;
      case 'toggleBold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'toggleItalic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'toggleUnderline':
        editor.chain().focus().toggleMark('underline').run();
        break;
      case 'toggleTaskList':
        editor.chain().focus().toggleTaskList().run();
        break;
      case 'toggleBulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'toggleOrderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'toggleBlockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'toggleCodeBlock':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'setParagraph':
        editor.chain().focus().setParagraph().run();
        break;
      case 'toggleHeading':
        editor.chain().focus().toggleHeading({ level: command.level }).run();
        break;
      case 'setTextAlign':
        setTextAlign(editor, command.align);
        break;
      case 'indent':
        adjustListIndent(editor, 'in');
        break;
      case 'outdent':
        adjustListIndent(editor, 'out');
        break;
      case 'openWikiLink':
        openWikiLink();
        break;
      case 'toggleAi':
        setAiOpen((value) => !value);
        break;
      case 'insertAttachment':
        void insertAttachment(command.source);
        break;
      case 'setLink':
        applyLink(command.title, command.url);
        break;
      case 'removeLink':
        removeLink();
        break;
      case 'undo':
        editor.chain().focus().undo().run();
        break;
      case 'redo':
        editor.chain().focus().redo().run();
        break;
    }

    void onStateChange?.(editorRuntimeState(editor));
  }, [applyLink, command, editable, editor, insertAttachment, onStateChange, openWikiLink, removeLink]);

  return (
    <main
      className="xopc-editor-root"
      style={{
        '--xopc-bg': theme.background,
        '--xopc-panel': theme.panel,
        '--xopc-input': theme.input,
        '--xopc-text': theme.text,
        '--xopc-text-secondary': theme.textSecondary,
        '--xopc-text-tertiary': theme.textTertiary,
        '--xopc-border': theme.border,
        '--xopc-accent': theme.accent,
        '--xopc-accent-soft': theme.accentSoft,
        '--xopc-danger': theme.danger,
      } as React.CSSProperties}
    >
      <style>{EDITOR_CSS}</style>
      <section className="xopc-editor-scroll" data-editable={editable ? 'true' : 'false'} onPointerDown={focusEditorFromSurface}>
        <EditorContent editor={editor} />
      </section>
      {pendingAi ? (
        <section className="xopc-editor-ai-preview">
          <div>
            <strong>{pendingAi.summary}</strong>
          </div>
          <div className="xopc-editor-ai-diff">
            <div>
              <span>{labels.aiDiscard}</span>
              <p>{pendingAi.beforeSnippet || labels.placeholder}</p>
            </div>
            <div>
              <span>{labels.aiApply}</span>
              <p>{pendingAi.afterSnippet || labels.placeholder}</p>
            </div>
          </div>
          <div className="xopc-editor-ai-actions">
            <button type="button" onClick={() => setPendingAi(null)}>{labels.aiDiscard}</button>
            <button type="button" onClick={applyPendingAi}>{labels.aiApply}</button>
          </div>
        </section>
      ) : null}
      {aiOpen ? (
        <form
          className="xopc-editor-ai-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void runAi(aiInstruction);
          }}
        >
          <input
            value={aiInstruction}
            onChange={(event) => setAiInstruction(event.target.value)}
            placeholder={labels.aiPlaceholder}
            disabled={aiLoading}
          />
          <button type="submit" disabled={aiLoading || !aiInstruction.trim()}>
            {aiLoading ? labels.aiThinking : labels.aiApply}
          </button>
          <div className="xopc-editor-ai-prompts">
            {[labels.aiRewrite, labels.aiShorten, labels.aiContinue, labels.aiTodo].map((label) => (
              <button key={label} type="button" onClick={() => void runAi(label)} disabled={aiLoading}>
                {label}
              </button>
            ))}
          </div>
        </form>
      ) : null}
      {wikiOpen ? (
        <section className="xopc-editor-wiki-bar">
          <input
            value={wikiQuery}
            onChange={(event) => setWikiQuery(event.target.value)}
            placeholder={labels.wikiLinkPlaceholder}
          />
          <div className="xopc-editor-wiki-results">
            {wikiCandidates.length ? wikiCandidates.map((item) => (
              <button key={item.id} type="button" onClick={() => insertWikiLink(item.title)}>
                <strong>{item.title}</strong>
                {item.subtitle ? <span>{item.subtitle}</span> : null}
              </button>
            )) : (
              <button type="button" onClick={() => insertWikiLink(wikiQuery)} disabled={wikiLoading || !wikiQuery.trim()}>
                {wikiLoading
                  ? labels.aiThinking
                  : wikiQuery.trim()
                    ? labels.wikiLinkInsertTyped.replace('{{title}}', wikiQuery.trim())
                    : labels.wikiLinkNoResults}
              </button>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function diffPreview(before: string, after: string): { beforeSnippet: string; afterSnippet: string } {
  if (before === after) return { beforeSnippet: '', afterSnippet: '' };
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix += 1;

  let beforeSuffix = before.length - 1;
  let afterSuffix = after.length - 1;
  while (beforeSuffix >= prefix && afterSuffix >= prefix && before[beforeSuffix] === after[afterSuffix]) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const contextStart = Math.max(0, prefix - 80);
  const beforeContextEnd = Math.min(before.length, beforeSuffix + 81);
  const afterContextEnd = Math.min(after.length, afterSuffix + 81);
  return {
    beforeSnippet: before.slice(contextStart, beforeContextEnd).trim(),
    afterSnippet: after.slice(contextStart, afterContextEnd).trim(),
  };
}

const EDITOR_CSS = `
html, body, #root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--xopc-bg);
}
* {
  box-sizing: border-box;
}
button, input {
  font: inherit;
}
.xopc-editor-root {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--xopc-bg);
  color: var(--xopc-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
}
.xopc-editor-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 20px 120px;
}
.xopc-editor-content {
  display: block;
  min-height: calc(100vh - 160px);
  outline: none;
  font-size: 17px;
  line-height: 1.58;
  letter-spacing: 0;
  color: var(--xopc-text);
  padding-bottom: 80px;
}
.xopc-editor-scroll[data-editable="false"] .xopc-editor-content {
  cursor: default;
  caret-color: transparent;
}
.xopc-editor-content p {
  margin: 0.55em 0;
}
.xopc-editor-content h1,
.xopc-editor-content h2,
.xopc-editor-content h3 {
  line-height: 1.18;
  margin: 1.05em 0 0.4em;
  font-weight: 650;
}
.xopc-editor-content h1 {
  font-size: 28px;
}
.xopc-editor-content h2 {
  font-size: 23px;
}
.xopc-editor-content h3 {
  font-size: 19px;
}
.xopc-editor-content ul,
.xopc-editor-content ol {
  padding-left: 1.35em;
}
.xopc-editor-content blockquote {
  margin: 0.8em 0;
  padding-left: 0.9em;
  border-left: 3px solid var(--xopc-border);
  color: var(--xopc-text-secondary);
}
.xopc-editor-content pre {
  overflow-x: auto;
  border-radius: 8px;
  padding: 12px;
  background: var(--xopc-input);
  font-size: 14px;
}
.xopc-editor-content code {
  border-radius: 5px;
  padding: 1px 4px;
  background: var(--xopc-input);
}
.xopc-editor-link {
  color: var(--xopc-accent);
}
.xopc-editor-content a[href^="xopc-attachment://"] {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  min-height: 32px;
  margin: 2px 0;
  padding: 5px 9px;
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  background: var(--xopc-input);
  text-decoration: none;
  vertical-align: middle;
}
.xopc-editor-content u {
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.16em;
}
.xopc-editor-image {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
}
.xopc-editor-content .is-empty::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--xopc-text-tertiary);
}
.xopc-editor-ai-bar button,
.xopc-editor-ai-preview button {
  min-width: 38px;
  min-height: 38px;
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  background: var(--xopc-panel);
  color: var(--xopc-text);
}
.xopc-editor-ai-button {
  color: var(--xopc-accent) !important;
  border-color: var(--xopc-accent) !important;
}
.xopc-editor-ai-bar,
.xopc-editor-ai-preview,
.xopc-editor-wiki-bar {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: calc(58px + env(safe-area-inset-bottom));
  z-index: 2;
  border: 1px solid var(--xopc-border);
  border-radius: 10px;
  padding: 8px;
  background: var(--xopc-panel);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
}
.xopc-editor-ai-bar input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--xopc-input);
  color: var(--xopc-text);
  outline: none;
}
.xopc-editor-wiki-bar input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--xopc-input);
  color: var(--xopc-text);
  outline: none;
}
.xopc-editor-wiki-results {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.xopc-editor-wiki-results button {
  min-height: 42px;
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  padding: 7px 9px;
  background: var(--xopc-panel);
  color: var(--xopc-text);
  text-align: left;
}
.xopc-editor-wiki-results span {
  display: block;
  margin-top: 2px;
  color: var(--xopc-text-tertiary);
  font-size: 12px;
}
.xopc-editor-ai-diff {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.xopc-editor-ai-diff div {
  border: 1px solid var(--xopc-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--xopc-input);
}
.xopc-editor-ai-diff span {
  display: block;
  margin-bottom: 4px;
  color: var(--xopc-text-tertiary);
  font-size: 11px;
  font-weight: 700;
}
.xopc-editor-ai-diff p {
  margin: 0;
  color: var(--xopc-text-secondary);
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
}
.xopc-editor-ai-bar > button {
  width: 100%;
  margin-top: 8px;
  background: var(--xopc-accent);
  border-color: var(--xopc-accent);
  color: white;
}
.xopc-editor-ai-prompts {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-top: 8px;
}
.xopc-editor-ai-prompts button {
  white-space: nowrap;
  padding: 0 10px;
}
.xopc-editor-ai-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
`;
