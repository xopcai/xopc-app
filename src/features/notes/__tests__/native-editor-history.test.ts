import { describe, expect, it } from 'vitest';

import {
  createNativeEditorHistory,
  pushNativeEditorHistory,
  redoNativeEditorHistory,
  undoNativeEditorHistory,
} from '../markdown/native-editor-history';

describe('native-editor-history', () => {
  it('pushes snapshots and supports undo redo', () => {
    let history = createNativeEditorHistory();
    const first = { markdown: 'A', selection: { start: 1, end: 1 } };
    const second = { markdown: 'AB', selection: { start: 2, end: 2 } };
    history = pushNativeEditorHistory(history, first);
    history = pushNativeEditorHistory(history, second);

    const undo = undoNativeEditorHistory(history, { markdown: 'ABC', selection: { start: 3, end: 3 } });
    expect(undo.snapshot).toEqual(second);
    const redo = redoNativeEditorHistory(undo.history, undo.snapshot!);
    expect(redo.snapshot).toEqual({ markdown: 'ABC', selection: { start: 3, end: 3 } });
  });

  it('does not push duplicate snapshots', () => {
    let history = createNativeEditorHistory();
    const snapshot = { markdown: 'A', selection: { start: 1, end: 1 } };
    history = pushNativeEditorHistory(history, snapshot);
    history = pushNativeEditorHistory(history, snapshot);
    expect(history.past).toHaveLength(1);
  });

  it('keeps one typing history point inside the merge window', () => {
    let history = createNativeEditorHistory();
    history = pushNativeEditorHistory(history, { markdown: 'A', selection: { start: 1, end: 1 } }, { reason: 'typing', now: 1000 });
    history = pushNativeEditorHistory(history, { markdown: 'AB', selection: { start: 2, end: 2 } }, { reason: 'typing', now: 1200 });
    expect(history.past).toHaveLength(1);
    expect(undoNativeEditorHistory(history, { markdown: 'ABC', selection: { start: 3, end: 3 } }).snapshot).toEqual({
      markdown: 'A',
      selection: { start: 1, end: 1 },
    });
  });
});
