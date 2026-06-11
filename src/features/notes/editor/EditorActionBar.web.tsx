import { memo, useCallback, useMemo } from 'react';
import { useTheme } from '../../../theme';
import type { UnifiedEditor } from './types';

export interface EditorActionBarProps {
  editor: UnifiedEditor | null;
  onAiPress?: () => void;
}

interface ActionItem {
  id: string;
  icon: string;
  title: string;
  action: (editor: UnifiedEditor) => void;
}

const ICON_MAP: Record<string, string> = {
  bold: '𝐁',
  italic: '𝐼',
  strike: 'S̶',
  code: '<>',
  heading: 'H2',
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
}: EditorActionBarProps) {
  const { colors } = useTheme();

  const actions = useMemo<ActionItem[]>(() => [
    { id: 'bold', icon: 'bold', title: 'Bold', action: (e) => e.toggleBold() },
    { id: 'italic', icon: 'italic', title: 'Italic', action: (e) => e.toggleItalic() },
    { id: 'strike', icon: 'strike', title: 'Strikethrough', action: (e) => e.toggleStrike() },
    { id: 'code', icon: 'code', title: 'Inline Code', action: (e) => e.toggleCode() },
    { id: 'heading', icon: 'heading', title: 'Heading', action: (e) => e.toggleHeading(2) },
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
      {onAiPress && (
        <button
          title="AI"
          onClick={onAiPress}
          style={{
            width: 38,
            height: 34,
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: colors.accent.primary,
            flexShrink: 0,
          }}
        >
          ✦
        </button>
      )}
      {actions.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => handlePress(item)}
          style={{
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
            color: colors.text.secondary,
            flexShrink: 0,
          }}
        >
          {ICON_MAP[item.id] ?? item.id}
        </button>
      ))}
    </div>
  );
});
