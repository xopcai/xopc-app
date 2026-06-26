export type NoteEditorTheme = {
  background: string;
  panel: string;
  input: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  accent: string;
  accentSoft: string;
  danger: string;
};

export type NoteEditorLabels = {
  placeholder: string;
  aiPlaceholder: string;
  aiRewrite: string;
  aiShorten: string;
  aiContinue: string;
  aiTodo: string;
  aiApply: string;
  aiDiscard: string;
  aiThinking: string;
  image: string;
  wikiLink: string;
  wikiLinkPlaceholder: string;
  wikiLinkInsertTyped: string;
  wikiLinkNoResults: string;
  heading: string;
  link: string;
  undo: string;
  redo: string;
  bold: string;
  italic: string;
  todo: string;
  bullet: string;
  ordered: string;
  quote: string;
  code: string;
  linkUrlPlaceholder: string;
  removeLink: string;
};

export type EditorSelectionContext = {
  from: number;
  to: number;
  markdown: string;
  currentBlockMarkdown: string;
  beforeMarkdown: string;
  afterMarkdown: string;
};

export type EditorAiRequest = {
  instruction: string;
  markdown: string;
  selection: EditorSelectionContext;
};

export type EditorAiResponse = {
  id: string;
  summary: string;
  markdown: string;
  title?: string | null;
  tags?: string[];
  status?: 'inbox' | 'processed' | 'archived' | 'trashed';
};

export type EditorAiMetadata = Pick<EditorAiResponse, 'title' | 'tags' | 'status'>;

export type EditorImagePickResult = {
  /** Canonical markdown src persisted in the note. */
  src: string;
  /** Display-only browser src used by the DOM editor. */
  displaySrc?: string;
  alt?: string;
} | null;

export type EditorWikiLinkCandidate = {
  id: string;
  title: string;
  subtitle?: string;
};

export type EditorCommand =
  | { id: number; type: 'focus'; position?: 'start' | 'end' | number }
  | { id: number; type: 'toggleBold' }
  | { id: number; type: 'toggleItalic' }
  | { id: number; type: 'toggleTaskList' }
  | { id: number; type: 'toggleBulletList' }
  | { id: number; type: 'toggleOrderedList' }
  | { id: number; type: 'toggleBlockquote' }
  | { id: number; type: 'toggleCodeBlock' }
  | { id: number; type: 'toggleHeading'; level: 1 | 2 | 3 }
  | { id: number; type: 'openWikiLink' }
  | { id: number; type: 'toggleAi' }
  | { id: number; type: 'insertImage' }
  | { id: number; type: 'setLink'; title: string; url: string }
  | { id: number; type: 'removeLink' }
  | { id: number; type: 'undo' }
  | { id: number; type: 'redo' };

export type EditorRuntimeState = {
  ready: boolean;
  focused: boolean;
  selection: { from: number; to: number };
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  todo: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  code: boolean;
  headingLevel: 0 | 1 | 2 | 3;
  link: boolean;
  image: boolean;
};
