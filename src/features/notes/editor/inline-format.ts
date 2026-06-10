/**
 * Inline formatting utilities for markdown-style text marks.
 *
 * Supports wrapping/unwrapping selected text with:
 * - **bold** (double asterisks)
 * - *italic* (single asterisk)
 * - ~~strikethrough~~ (double tilde)
 * - `code` (backtick)
 */

export type InlineFormat = 'bold' | 'italic' | 'strikethrough' | 'code';

interface FormatDelimiters {
  open: string;
  close: string;
}

const FORMAT_DELIMITERS: Record<InlineFormat, FormatDelimiters> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  strikethrough: { open: '~~', close: '~~' },
  code: { open: '`', close: '`' },
};

export interface FormatResult {
  /** The full text after applying the format toggle. */
  text: string;
  /** New selection start (after delimiters shift). */
  selectionStart: number;
  /** New selection end (after delimiters shift). */
  selectionEnd: number;
}

/**
 * Check if the selected region is already wrapped with the given format's delimiters.
 * Handles the case where delimiters are just outside the selection.
 */
function isWrapped(
  text: string,
  start: number,
  end: number,
  delimiters: FormatDelimiters,
): boolean {
  const openLen = delimiters.open.length;
  const closeLen = delimiters.close.length;

  // Check if delimiters are immediately outside selection
  if (start >= openLen && end + closeLen <= text.length) {
    const before = text.slice(start - openLen, start);
    const after = text.slice(end, end + closeLen);
    if (before === delimiters.open && after === delimiters.close) return true;
  }

  // Check if delimiters are inside selection at boundaries
  if (end - start >= openLen + closeLen) {
    const selected = text.slice(start, end);
    if (selected.startsWith(delimiters.open) && selected.endsWith(delimiters.close)) return true;
  }

  return false;
}

/**
 * Toggle an inline format on a text selection.
 *
 * - If the selection is already wrapped → unwrap (remove delimiters).
 * - If not wrapped → wrap (add delimiters around selection).
 * - If selection is empty (cursor) → insert empty delimiters and place cursor between them.
 *
 * Special handling for bold/italic ambiguity: `***text***` is treated as
 * bold+italic. This function avoids creating that pattern — it always
 * toggles one format at a time using the outermost matching delimiters.
 */
export function toggleInlineFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: InlineFormat,
): FormatResult {
  const delimiters = FORMAT_DELIMITERS[format];
  const openLen = delimiters.open.length;
  const closeLen = delimiters.close.length;

  // Empty selection → insert empty delimiters, cursor between them
  if (selectionStart === selectionEnd) {
    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionStart);
    return {
      text: `${before}${delimiters.open}${delimiters.close}${after}`,
      selectionStart: selectionStart + openLen,
      selectionEnd: selectionStart + openLen,
    };
  }

  // Check if already wrapped (delimiters outside selection)
  if (
    selectionStart >= openLen &&
    selectionEnd + closeLen <= text.length &&
    text.slice(selectionStart - openLen, selectionStart) === delimiters.open &&
    text.slice(selectionEnd, selectionEnd + closeLen) === delimiters.close
  ) {
    // Unwrap: remove outer delimiters
    const before = text.slice(0, selectionStart - openLen);
    const selected = text.slice(selectionStart, selectionEnd);
    const after = text.slice(selectionEnd + closeLen);
    return {
      text: `${before}${selected}${after}`,
      selectionStart: selectionStart - openLen,
      selectionEnd: selectionEnd - openLen,
    };
  }

  // Check if already wrapped (delimiters inside selection)
  const selectedText = text.slice(selectionStart, selectionEnd);
  if (selectedText.startsWith(delimiters.open) && selectedText.endsWith(delimiters.close)) {
    // Unwrap: remove inner delimiters
    const inner = selectedText.slice(openLen, selectedText.length - closeLen);
    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);
    return {
      text: `${before}${inner}${after}`,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  // Wrap: add delimiters around selection
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  return {
    text: `${before}${delimiters.open}${selectedText}${delimiters.close}${after}`,
    selectionStart: selectionStart + openLen,
    selectionEnd: selectionEnd + openLen,
  };
}

/**
 * Detect which formats are currently active for the given selection.
 */
export function detectActiveFormats(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): Set<InlineFormat> {
  const active = new Set<InlineFormat>();
  for (const [format, delimiters] of Object.entries(FORMAT_DELIMITERS) as [InlineFormat, FormatDelimiters][]) {
    if (isWrapped(text, selectionStart, selectionEnd, delimiters)) {
      active.add(format);
    }
  }
  return active;
}
