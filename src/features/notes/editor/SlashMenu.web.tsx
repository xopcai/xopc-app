import { memo, useEffect, useRef } from 'react';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { getSlashItemTitle, type SlashItem } from './slash-items';

export interface SlashMenuProps {
  items: SlashItem[];
  selectedIndex: number;
  clientRect: (() => DOMRect | null) | null;
  onSelect: (item: SlashItem) => void;
}

export const SlashMenu = memo(function SlashMenu({
  items,
  selectedIndex,
  clientRect,
  onSelect,
}: SlashMenuProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = menuRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!clientRect || items.length === 0) return null;

  const rect = clientRect();
  if (!rect) return null;

  const labels: Record<string, string> = {
    editorBlockParagraph: pm.editorBlockParagraph,
    editorBlockHeading: pm.editorBlockHeading,
    editorBlockTodo: pm.editorBlockTodo,
    editorBlockBulletList: pm.editorBlockBulletList,
    editorBlockNumberedList: pm.editorBlockNumberedList,
    editorBlockQuote: pm.editorBlockQuote,
    editorBlockCode: pm.editorBlockCode,
    editorBlockDivider: pm.editorBlockDivider,
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        zIndex: 9999,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: 280,
        overflowY: 'auto',
        borderRadius: 10,
        border: `1px solid ${colors.border.default}`,
        backgroundColor: colors.surface.panel,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: 4,
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          data-selected={index === selectedIndex ? 'true' : 'false'}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            textAlign: 'left',
            backgroundColor: index === selectedIndex ? colors.accent.selectionBg ?? 'rgba(109,93,251,0.12)' : 'transparent',
            color: colors.text.primary,
          }}
        >
          <span style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface.input,
            fontSize: 12,
            fontWeight: 700,
            color: colors.text.secondary,
            flexShrink: 0,
          }}>
            {item.icon}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {getSlashItemTitle(item, labels)}
          </span>
        </button>
      ))}
    </div>
  );
});
