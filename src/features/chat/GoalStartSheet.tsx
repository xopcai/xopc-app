/**
 * Bottom sheet to describe a new /goal mission before sending.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

export const GoalStartSheet = memo(function GoalStartSheet({
  visible,
  submitting,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  submitting?: boolean;
  onDismiss: () => void;
  onSubmit: (goalText: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const t = m.chat.emptyShortcuts;
  const [text, setText] = useState('');

  useEffect(() => {
    if (!visible) setText('');
  }, [visible]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSubmit(trimmed);
  }, [onSubmit, submitting, text]);

  const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const fieldBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const textColor = isDark ? '#F5F5F7' : '#1C1C1E';
  const muted = '#8E8E93';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: sheetBg }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <Text variant="titleSmall" style={[styles.title, { color: textColor }]}>
              {t.goalSheetTitle}
            </Text>
            <Text variant="bodySmall" style={[styles.hint, { color: muted }]}>
              {t.goalSheetHint}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: fieldBg, color: textColor }]}
              placeholder={t.goalSheetPlaceholder}
              placeholderTextColor={muted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              editable={!submitting}
              autoFocus
            />
            <View style={styles.actions}>
              <Button mode="text" onPress={onDismiss} disabled={submitting}>
                {m.chat.goal.cancel}
              </Button>
              <Button mode="contained" onPress={handleSubmit} loading={submitting} disabled={!text.trim()}>
                {t.goalSheetSubmit}
              </Button>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.45)',
    marginBottom: 4,
  },
  title: {
    fontWeight: '600',
  },
  hint: {
    lineHeight: 20,
  },
  input: {
    minHeight: 96,
    maxHeight: 160,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
});
