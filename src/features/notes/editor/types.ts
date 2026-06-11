/**
 * Platform-agnostic editor interface.
 * Native uses @10play/tentap-editor (EditorBridge),
 * Web uses @tiptap/react (Editor).
 */

export interface UnifiedEditor {
  toggleBold(): void;
  toggleItalic(): void;
  toggleStrike(): void;
  toggleCode(): void;
  toggleHeading(level: number): void;
  setParagraph(): void;
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
  /** Delete slash token and run a block command (native slash menu). */
  applySlashCommand?(commandId: string, range?: { from: number; to: number }): void;
}

export interface NoteBlockEditorProps {
  /** Changes when note id or external content (AI patch) updates — triggers editor reload. */
  contentKey: string;
  initialHtml: string;
  onChange: (html: string) => void;
  onEditorReady?: (editor: UnifiedEditor) => void;
  /** When true, opens the slash command menu (toolbar fallback on native). */
  slashMenuOpen?: boolean;
  onSlashMenuClose?: () => void;
}
