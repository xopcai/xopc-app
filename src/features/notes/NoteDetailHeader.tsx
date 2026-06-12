import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';

export type NoteScreenMode = 'view' | 'edit';

interface NoteDetailHeaderProps {
  mode: NoteScreenMode;
  onBack: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDone?: () => void;
}

export function NoteDetailHeader({
  mode,
  onBack,
  onUndo,
  onRedo,
  onDone,
}: NoteDetailHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const backgroundColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.05)';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <Pressable
        style={[styles.iconButton, { backgroundColor }]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon source="chevron-left" size={24} color={colors.text.secondary} />
      </Pressable>

      <View style={styles.spacer} />

      {mode === 'edit' ? (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.iconButton, { backgroundColor }]}
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo"
          >
            <Icon source="undo" size={20} color={colors.text.secondary} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, { backgroundColor }]}
            onPress={onRedo}
            accessibilityRole="button"
            accessibilityLabel="Redo"
          >
            <Icon source="redo" size={20} color={colors.text.secondary} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, { backgroundColor }]}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Icon source="check" size={22} color={colors.text.secondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  spacer: { flex: 1 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
  },
});
