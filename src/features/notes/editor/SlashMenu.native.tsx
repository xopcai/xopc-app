import { memo, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { getSlashItemTitle, type SlashItem } from './slash-items';

export interface SlashMenuProps {
  items: SlashItem[];
  selectedIndex: number;
  visible: boolean;
  onSelect: (item: SlashItem) => void;
  onDismiss: () => void;
}

export const SlashMenu = memo(function SlashMenu({
  items,
  selectedIndex,
  visible,
  onSelect,
  onDismiss,
}: SlashMenuProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, selectedIndex * 44 - 88), animated: true });
  }, [selectedIndex, visible]);

  if (!visible || items.length === 0) return null;

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
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={[styles.menu, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
        <Text variant="labelSmall" style={{ color: colors.text.tertiary, paddingHorizontal: 12, paddingTop: 8 }}>
          {pm.editorSlashFilter}
        </Text>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="always" style={styles.scroll}>
          {items.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              style={[
                styles.row,
                index === selectedIndex && { backgroundColor: colors.accent.selectionBg },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.surface.input }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>
                  {item.icon}
                </Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>
                {getSlashItemTitle(item, labels)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  menu: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 280,
    overflow: 'hidden',
  },
  scroll: {
    maxHeight: 240,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
