import type { MarkdownRange } from './markdown-document';
import type { MarkdownInsertResult } from './markdown-insert';
import { getCurrentLineRange } from './markdown-editor-state';

export function continueMarkdownTodoOnEnter(
  markdown: string,
  selection: MarkdownRange,
): MarkdownInsertResult | null {
  const source = markdown.replace(/\r\n/g, '\n');
  if (selection.start !== selection.end) return null;
  const lineRange = getCurrentLineRange(source, selection.start);
  const line = source.slice(lineRange.start, lineRange.end);
  const todo = /^(\s*)-\s+\[([ xX])\]\s*(.*)$/.exec(line);
  if (!todo) return null;

  const beforeCaret = source.slice(lineRange.start, selection.start);
  const afterCaret = source.slice(selection.start, lineRange.end);
  const beforeTodo = /^(\s*)-\s+\[[ xX]\]\s*(.*)$/.exec(beforeCaret);
  if (!beforeTodo) return null;

  if (!beforeTodo[2].trim() && !afterCaret.trim()) {
    const cursor = lineRange.start + todo[1].length;
    return {
      markdown: `${source.slice(0, lineRange.start)}${todo[1]}${source.slice(lineRange.end)}`,
      selection: { start: cursor, end: cursor },
    };
  }

  const marker = `${todo[1]}- [ ] `;
  const insert = `\n${marker}`;
  const cursor = selection.start + insert.length;
  return {
    markdown: `${source.slice(0, selection.start)}${insert}${source.slice(selection.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function applyMarkdownEnterBehaviorFromTextChange(
  previousMarkdown: string,
  nextMarkdown: string,
  previousSelection: MarkdownRange,
): MarkdownInsertResult | null {
  if (previousSelection.start !== previousSelection.end) return null;
  const cursor = previousSelection.start;
  const expected = `${previousMarkdown.slice(0, cursor)}\n${previousMarkdown.slice(cursor)}`;
  if (nextMarkdown.replace(/\r\n/g, '\n') !== expected.replace(/\r\n/g, '\n')) return null;
  return continueMarkdownTodoOnEnter(previousMarkdown, previousSelection);
}
