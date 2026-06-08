import { memo } from 'react';
import { Modal, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AttachmentPickSource } from './attachment-file-io';

type SheetItem = {
  source: AttachmentPickSource;
  icon: string;
  label: string;
};

export const AttachmentSourceSheet = memo(function AttachmentSourceSheet({
  visible,
  items,
  onPick,
  onClose,
}: {
  visible: boolean;
  items: SheetItem[];
  onPick: (source: AttachmentPickSource) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const surface = scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const tileBg = scheme === 'dark' ? '#2C2C2E' : '#F5F5F7';
  const textColor = scheme === 'dark' ? '#F5F5F7' : '#1C1C1E';
  const muted = scheme === 'dark' ? '#8E8E93' : '#6D6D70';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.panel, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.grid}>
          {items.map((item) => (
            <Pressable
              key={item.source}
              style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
              onPress={() => {
                onClose();
                onPick(item.source);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.iconTile, { backgroundColor: tileBg }]}>
                <Icon source={item.icon} size={26} color={textColor} />
              </View>
              <Text style={[styles.label, { color: muted }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 24,
  },
  cell: {
    alignItems: 'center',
    width: 72,
    gap: 8,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
