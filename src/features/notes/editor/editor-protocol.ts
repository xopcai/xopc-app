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
  headingOne: string;
  headingTwo: string;
  headingThree: string;
  link: string;
  undo: string;
  redo: string;
  style: string;
  normalText: string;
  bold: string;
  italic: string;
  underline: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignment: string;
  lists: string;
  indent: string;
  outdent: string;
  todo: string;
  bullet: string;
  ordered: string;
  quote: string;
  code: string;
  linkUrlPlaceholder: string;
  removeLink: string;
  imageFromLibrary: string;
  imageCamera: string;
  imageScan: string;
  imageDocument: string;
  unavailable: string;
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

export type EditorAttachmentPickSource = 'photos' | 'camera' | 'document';

export type EditorAttachmentPickResult = {
  /** Canonical markdown src persisted in the note. */
  src: string;
  /** Display-only browser src used by the DOM editor. */
  displaySrc?: string;
  alt?: string;
  kind: 'image' | 'document';
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
  | { id: number; type: 'toggleUnderline' }
  | { id: number; type: 'toggleTaskList' }
  | { id: number; type: 'toggleBulletList' }
  | { id: number; type: 'toggleOrderedList' }
  | { id: number; type: 'toggleBlockquote' }
  | { id: number; type: 'toggleCodeBlock' }
  | { id: number; type: 'setParagraph' }
  | { id: number; type: 'toggleHeading'; level: 1 | 2 | 3 }
  | { id: number; type: 'setTextAlign'; align: 'left' | 'center' | 'right' }
  | { id: number; type: 'indent' }
  | { id: number; type: 'outdent' }
  | { id: number; type: 'openWikiLink' }
  | { id: number; type: 'toggleAi' }
  | { id: number; type: 'insertAttachment'; source: EditorAttachmentPickSource }
  | { id: number; type: 'setLink'; title: string; url: string }
  | { id: number; type: 'removeLink' }
  | { id: number; type: 'undo' }
  | { id: number; type: 'redo' }
  | { id: number; type: 'flushMarkdown' };

export type EditorCommandInput = EditorCommand extends infer Command
  ? Command extends { id: number }
    ? Omit<Command, 'id'>
    : never
  : never;

export type EditorRuntimeState = {
  ready: boolean;
  focused: boolean;
  selection: { from: number; to: number };
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  todo: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  code: boolean;
  headingLevel: 0 | 1 | 2 | 3;
  textAlign: 'left' | 'center' | 'right';
  link: boolean;
  image: boolean;
};
