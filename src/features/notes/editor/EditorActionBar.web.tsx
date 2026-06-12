import { memo, useCallback, useMemo } from 'react';
import { useTheme } from '../../../theme';
import type { UnifiedEditor } from './types';

export interface EditorActionBarProps {
  editor: UnifiedEditor | null;
  onAiPress?: () => void;
  onSlashPress?: () => void;
  onVoicePress?: () => void;
  voiceActive?: boolean;
  voiceDisabled?: boolean;
  voiceLabel?: string;
}

interface ActionItem {
  id: string;
  icon: string;
  title: string;
  action: (editor: UnifiedEditor) => void;
}

const ICON_MAP: Record<string, string> = {
  slash: '/',
  bold: '𝐁',
  italic: '𝐼',
  strike: 'S̶',
  code: '<>',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  bullet: '•',
  number: '1.',
  task: '☑',
  quote: '❝',
  codeblock: '{ }',
  divider: '—',
  undo: '↩',
  redo: '↪',
};

export const EditorActionBar = memo(function EditorActionBar({
  editor,
  onAiPress,
  onSlashPress,
  onVoicePress,
  voiceActive = false,
  voiceDisabled = false,
  voiceLabel,
}: EditorActionBarProps) {
  const { colors } = useTheme();

  const actions = useMemo<ActionItem[]>(() => [
    { id: 'bold', icon: 'bold', title: 'Bold', action: (e) => e.toggleBold() },
    { id: 'italic', icon: 'italic', title: 'Italic', action: (e) => e.toggleItalic() },
    { id: 'strike', icon: 'strike', title: 'Strikethrough', action: (e) => e.toggleStrike() },
    { id: 'code', icon: 'code', title: 'Inline Code', action: (e) => e.toggleCode() },
    { id: 'h1', icon: 'h1', title: 'Heading 1', action: (e) => e.toggleHeading(1) },
    { id: 'h2', icon: 'h2', title: 'Heading 2', action: (e) => e.toggleHeading(2) },
    { id: 'h3', icon: 'h3', title: 'Heading 3', action: (e) => e.toggleHeading(3) },
    { id: 'bullet', icon: 'bullet', title: 'Bullet List', action: (e) => e.toggleBulletList() },
    { id: 'number', icon: 'number', title: 'Numbered List', action: (e) => e.toggleOrderedList() },
    { id: 'task', icon: 'task', title: 'Task List', action: (e) => e.toggleTaskList() },
    { id: 'quote', icon: 'quote', title: 'Blockquote', action: (e) => e.toggleBlockquote() },
    { id: 'codeblock', icon: 'codeblock', title: 'Code Block', action: (e) => e.toggleCodeBlock() },
    { id: 'divider', icon: 'divider', title: 'Divider', action: (e) => e.setHorizontalRule() },
    { id: 'undo', icon: 'undo', title: 'Undo', action: (e) => e.undo() },
    { id: 'redo', icon: 'redo', title: 'Redo', action: (e) => e.redo() },
  ], []);

  const handlePress = useCallback((item: ActionItem) => {
    if (!editor) return;
    item.action(editor);
    editor.focus();
  }, [editor]);

  return (
    <div style={{
      borderTop: `1px solid ${colors.border.subtle}`,
      backgroundColor: colors.surface.panel,
      padding: '6px 4px',
      display: 'flex',
      gap: 2,
      overflowX: 'auto',
    }}>
      {onSlashPress && (
        <button
          title="Insert block"
          onClick={onSlashPress}
          style={actionBtnStyle(colors, colors.accent.primary)}
        >
          {ICON_MAP.slash}
        </button>
      )}
      {onVoicePress && (
        <button
          title={voiceLabel ?? 'Voice input'}
          onClick={onVoicePress}
          disabled={voiceDisabled}
          style={{
            ...actionBtnStyle(colors, voiceActive ? '#FF3B30' : colors.accent.primary),
            opacity: voiceDisabled ? 0.4 : 1,
          }}
        >
          {voiceActive ? '■' : '🎤'}
        </button>
      )}
      {onAiPress && (
        <button
          title="AI"
          onClick={onAiPress}
          style={actionBtnStyle(colors, colors.accent.primary)}
        >
          ✦
        </button>
      )}
      {actions.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => handlePress(item)}
          disabled={!editor}
          style={{
            ...actionBtnStyle(colors, colors.text.secondary),
            opacity: editor ? 1 : 0.4,
          }}
        >
          {ICON_MAP[item.id] ?? item.id}
        </button>
      ))}
    </div>
  );
});

function actionBtnStyle(
  colors: ReturnType<typeof useTheme>['colors'],
  color: string,
): React.CSSProperties {
  return {
    width: 38,
    height: 34,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    color,
    flexShrink: 0,
  };
}
