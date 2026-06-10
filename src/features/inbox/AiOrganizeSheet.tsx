import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../theme';

interface AiOrganizeSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Placeholder — AI organize will be implemented after LLM integration. */
export function AiOrganizeSheet({ visible, onDismiss }: AiOrganizeSheetProps) {
  const { colors, isDark } = useTheme();
  const backgroundColor = isDark ? '#171A20' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor }]}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text.primary }]}>AI 整理建议</Text>
          <Pressable style={styles.closeButton} onPress={onDismiss}>
            <Icon source="close" size={20} color={colors.text.tertiary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          <View style={[styles.emptyCard, { borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>AI 整理功能即将上线</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(127,127,127,0.35)', marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '900' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 10, paddingBottom: 24 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  emptyText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
