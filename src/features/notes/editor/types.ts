/**
 * Platform-agnostic editor interface.
 * Native uses @10play/tentap-editor (EditorBridge),
 * Web uses @tiptap/react (Editor).
 */

import type { NoteBlock } from '../note-blocks';

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
  /** Insert plain text at the current cursor position. */
  insertText(text: string): void;
  /** Insert an inline image at the current cursor position. */
  insertImage(src: string, alt?: string): void;
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
  /** When false, the editor is read-only (view mode). */
  editable?: boolean;
  /** Focus editor (and keyboard) once editable becomes true — used when entering edit from view. */
  focusOnEnable?: boolean;
  onFocusApplied?: () => void;
  /** Embedded in outer ScrollView: auto-height, no internal scroll, no inline images. */
  embedded?: boolean;
  /** Called when this segment receives editor focus (hybrid editor). */
  onSegmentFocus?: () => void;
  /** Segment key for stable identity inside hybrid editor. */
  segmentKey?: string;
}

export interface HybridNoteEditorProps extends Omit<NoteBlockEditorProps, 'initialHtml' | 'onChange'> {
  blocks: NoteBlock[];
  onBlocksChange: (blocks: NoteBlock[]) => void;
}

export interface HybridNoteEditorHandle {
  insertImageBlock: (src: string, alt?: string) => void;
}
