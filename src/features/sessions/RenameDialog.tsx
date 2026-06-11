/**
 * Kimi-style bottom sheet dialog for renaming a session.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMessages } from '../../i18n/messages';

type RenameDialogProps = {
  visible: boolean;
  currentName: string;
  onDismiss: () => void;
  onRename: (name: string) => void;
  loading?: boolean;
};

export const RenameDialog = memo(function RenameDialog({
  visible,
  currentName,
  onDismiss,
  onRename,
  loading = false,
}: RenameDialogProps) {
  const m = useMessages();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(currentName);

  useEffect(() => {
    if (visible) setDraft(currentName);
  }, [visible, currentName]);

  const handleSubmit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
  }, [draft, onRename]);

  const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#F5F5F7' : '#1C1C1E';
  const mutedBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const mutedText = isDark ? '#8E8E93' : '#6D6D70';
  const canSubmit = Boolean(draft.trim()) && !loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.title, { color: textColor }]}>{m.renameDialog.title}</Text>
            <IconButton icon="close" size={20} onPress={onDismiss} disabled={loading} />
          </View>

          <TextInput
            mode="outlined"
            value={draft}
            onChangeText={setDraft}
            placeholder={m.renameDialog.placeholder}
            autoFocus
            onSubmitEditing={handleSubmit}
            disabled={loading}
            outlineColor={isDark ? '#38383A' : '#E5E5EA'}
            activeOutlineColor="#007AFF"
            textColor={textColor}
            placeholderTextColor={mutedText}
            style={styles.input}
            contentStyle={styles.inputContent}
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: mutedBg }]}
              onPress={onDismiss}
              disabled={loading}
            >
              <Text style={[styles.actionLabel, { color: textColor }]}>{m.renameDialog.cancel}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionButton,
                {
                  backgroundColor: canSubmit
                    ? (isDark ? '#3A3A3C' : '#E5E5EA')
                    : (isDark ? '#2C2C2E' : '#F2F2F7'),
                },
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              <Text
                style={[
                  styles.actionLabel,
                  { color: canSubmit ? textColor : mutedText },
                ]}
              >
                {m.renameDialog.confirm}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  inputContent: {
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
