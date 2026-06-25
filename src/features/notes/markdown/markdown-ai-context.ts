import type { EditorSelectionContext } from '../editor/editor-protocol';

export type NativeEditorAiContextType = 'selection' | 'block' | 'note';

export function buildNativeEditorAiContext(
  markdown: string,
  from: number,
  to: number,
): EditorSelectionContext {
  const source = markdown.replace(/\r\n/g, '\n');
  const start = Math.max(0, Math.min(Math.min(from, to), source.length));
  const end = Math.max(0, Math.min(Math.max(from, to), source.length));
  const blockRange = getParagraphRange(source, start, end);
  const selectedMarkdown = source.slice(start, end);
  const currentBlockMarkdown = source.slice(blockRange.start, blockRange.end);
  const contextType: NativeEditorAiContextType = selectedMarkdown.trim()
    ? 'selection'
    : currentBlockMarkdown.trim()
      ? 'block'
      : 'note';
  const contextStart = contextType === 'note' ? 0 : blockRange.start;
  const contextEnd = contextType === 'note' ? source.length : blockRange.end;

  return {
    from: start,
    to: end,
    markdown: selectedMarkdown,
    currentBlockMarkdown,
    beforeMarkdown: source.slice(Math.max(0, contextStart - 1200), contextStart),
    afterMarkdown: source.slice(contextEnd, Math.min(source.length, contextEnd + 1200)),
    contextType,
  };
}

function getParagraphRange(markdown: string, start: number, end: number): { start: number; end: number } {
  const beforeBreak = markdown.lastIndexOf('\n\n', Math.max(0, start - 1));
  const afterBreak = markdown.indexOf('\n\n', end);
  return {
    start: beforeBreak < 0 ? 0 : beforeBreak + 2,
    end: afterBreak < 0 ? markdown.length : afterBreak,
  };
}
