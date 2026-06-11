/**
 * Platform-agnostic editor interface.
 * Native uses @10play/tentap-editor (EditorBridge),
 * Web uses @tiptap/react (Editor).
 */

import type { NoteBlock } from '../note-blocks';

/** Unified editor handle exposed to parent components (toolbar, AI panel, etc.). */
export interface UnifiedEditor {
  toggleBold(): void;
  toggleItalic(): void;
  toggleStrike(): void;
  toggleCode(): void;
  toggleHeading(level: number): void;
  toggleBulletList(): void;
  toggleOrderedList(): void;
  toggleTaskList(): void;
  toggleBlockquote(): void;
  toggleCodeBlock(): void;
  setHorizontalRule(): void;
  undo(): void;
  redo(): void;
  focus(): void;
  getHTML(): Promise<string> | string;
  setContent(html: string): void;
}

export interface NoteBlockEditorProps {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  onEditorReady?: (editor: UnifiedEditor) => void;
}
