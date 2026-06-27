import { Extension, Mark, mergeAttributes, Node as TiptapNode, nodeInputRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

export const EMPTY_IMAGE_SRC = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E';
const WIKI_LINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;
const WIKI_LINK_INPUT_PATTERN = /\[\[([^\]\n]+)\]\]$/;

type WikiLinkParts = {
  target: string;
  label: string;
};

export function isXopcAttachmentSrc(src: string): boolean {
  return src.startsWith('xopc-attachment://');
}

function wikiLinkParts(raw: string): WikiLinkParts {
  const [targetPart, labelPart] = raw.split('|');
  const target = targetPart.trim();
  const label = (labelPart?.trim() || target.split('#')[0]?.trim() || target).trim();
  return { target, label };
}

function escapeWikiLinkValue(value: string): string {
  return value.replace(/\]/g, '').trim();
}

function replaceWikiLinkTextNodes(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('pre, code, a, button, input, textarea, [data-xopc-note-link]')) {
        return NodeFilter.FILTER_REJECT;
      }
      WIKI_LINK_PATTERN.lastIndex = 0;
      return WIKI_LINK_PATTERN.test(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const text = node.textContent ?? '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    WIKI_LINK_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
      const index = match.index ?? 0;
      if (index > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, index)));
      }
      const { target, label } = wikiLinkParts(match[1] ?? '');
      if (target) {
        const chip = document.createElement('span');
        chip.setAttribute('data-xopc-note-link', target);
        chip.setAttribute('data-label', label);
        chip.textContent = label;
        fragment.append(chip);
      } else {
        fragment.append(document.createTextNode(match[0]));
      }
      cursor = index + match[0].length;
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }
    node.replaceWith(fragment);
  }
}

export const UnderlineMark = Mark.create({
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

export const TextAlignAttribute = Extension.create({
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

export const NoteLink = TiptapNode.create({
  name: 'noteLink',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-xopc-note-link') ?? '',
        renderHTML: (attributes) => ({ 'data-xopc-note-link': attributes.target }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-label': attributes.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-xopc-note-link]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const label = String(node.attrs.label || node.attrs.target || '').trim();
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'xopc-note-link-chip',
        contenteditable: 'false',
      }),
      label,
    ];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: WIKI_LINK_INPUT_PATTERN,
        type: this.type,
        getAttributes: (match) => wikiLinkParts(match[1] ?? ''),
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const target = escapeWikiLinkValue(String(node.attrs.target || ''));
          const label = escapeWikiLinkValue(String(node.attrs.label || ''));
          if (!target) return;
          state.write(label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            replaceWikiLinkTextNodes(element);
          },
        },
      },
    };
  },
});

export function createXopcImage(getDisplaySrc: (canonicalSrc: string) => string | undefined) {
  return Image.extend({
    renderHTML({ HTMLAttributes }) {
      const canonicalSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
      const displaySrc = canonicalSrc ? getDisplaySrc(canonicalSrc) : undefined;
      const attrs = displaySrc
        ? { ...HTMLAttributes, src: displaySrc, 'data-xopc-src': canonicalSrc }
        : isXopcAttachmentSrc(canonicalSrc)
          ? { ...HTMLAttributes, src: EMPTY_IMAGE_SRC, 'data-xopc-src': canonicalSrc }
          : HTMLAttributes;
      return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)];
    },
  });
}
