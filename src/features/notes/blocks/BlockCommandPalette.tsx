import { memo } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NoteBlockType } from '../../../query/notes';
import { useTheme } from '../../../theme';

export type BlockCommandPaletteItem = {
  key: string;
  icon: string;
  label: string;
  blockType: NoteBlockType;
};

export const BlockCommandPalette = memo(function BlockCommandPalette({
  visible,
  query,
  filterPlaceholder,
  emptyLabel,
  items,
  onPick,
  onClose,
}: {
  visible: boolean;
  query: string;
  filterPlaceholder: string;
  emptyLabel: string;
  items: BlockCommandPaletteItem[];
  onPick: (blockType: NoteBlockType) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.palette,
            {
              backgroundColor: colors.surface.panel,
              borderColor: colors.border.default,
              marginBottom: insets.bottom + 10,
            },
          ]}
        >
          <View style={[styles.filterRow, { borderBottomColor: colors.border.subtle }]}>
            <Icon source="slash-forward" size={18} color={colors.text.tertiary} />
            <TextInput
              value={query}
              editable={false}
              pointerEvents="none"
              placeholder={filterPlaceholder}
              placeholderTextColor={colors.text.tertiary}
              style={[styles.filterInput, { color: colors.text.primary }]}
            />
          </View>
          {items.length === 0 ? (
            <Text style={[styles.empty, { color: colors.text.tertiary }]}>{emptyLabel}</Text>
          ) : (
            items.map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.item,
                  pressed && { backgroundColor: colors.surface.hover },
                ]}
                onPress={() => onPick(item.blockType)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={[styles.iconBox, { backgroundColor: colors.surface.base }]}>
                  <Icon source={item.icon} size={20} color={colors.text.primary} />
                </View>
                <Text style={[styles.label, { color: colors.text.primary }]}>{item.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  palette: {
    marginHorizontal: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: 420,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 14,
  },
});
