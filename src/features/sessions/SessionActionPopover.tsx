/**
 * Kimi-style horizontal action popover for session long-press.
 */
import { memo } from 'react';
import { Modal, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

export type SessionPopoverAction = 'edit' | 'delete' | 'multiSelect';

export const SessionActionPopover = memo(function SessionActionPopover({
  visible,
  anchorX,
  anchorY,
  anchorWidth,
  onAction,
  onDismiss,
}: {
  visible: boolean;
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  onAction: (action: SessionPopoverAction) => void;
  onDismiss: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();

  const panelBg = isDark ? 'rgba(44, 44, 46, 0.96)' : 'rgba(255, 255, 255, 0.98)';
  const textColor = isDark ? '#F5F5F7' : '#1C1C1E';
  const dividerColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const menuWidth = 228;
  const left = Math.max(12, Math.min(anchorX + anchorWidth / 2 - menuWidth / 2, anchorX + anchorWidth - menuWidth - 8));
  const top = Math.max(12, anchorY - 62);

  const items: Array<{
    key: SessionPopoverAction;
    label: string;
    icon: string;
    color?: string;
  }> = [
    { key: 'edit', label: m.sessionActions.edit, icon: 'pencil-outline' },
    { key: 'delete', label: m.sessionActions.delete, icon: 'delete-outline', color: '#FF453A' },
    { key: 'multiSelect', label: m.sessionActions.multiSelect, icon: 'checkbox-multiple-marked-outline' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={[styles.anchor, { top, left, width: menuWidth }]}>
          <View style={[styles.panel, { backgroundColor: panelBg }]}>
            {items.map((item, index) => (
              <View key={item.key} style={styles.itemWrap}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: dividerColor }]} /> : null}
                <Pressable
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => onAction(item.key)}
                  accessibilityRole="button"
                >
                  <Icon source={item.icon} size={18} color={item.color ?? textColor} />
                  <Text style={[styles.itemLabel, { color: item.color ?? textColor }]}>{item.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <View style={[styles.arrow, { borderTopColor: panelBg }]} />
        </View>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  anchor: {
    position: 'absolute',
    alignItems: 'center',
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  itemWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  arrow: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
