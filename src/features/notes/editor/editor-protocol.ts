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
  bold: string;
  italic: string;
  todo: string;
  bullet: string;
  ordered: string;
  quote: string;
  code: string;
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
