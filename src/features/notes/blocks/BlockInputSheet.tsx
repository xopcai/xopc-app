import { memo, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';

export interface BlockInputSheetProps {
  visible: boolean;
  title: string;
  placeholder: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export const BlockInputSheet = memo(function BlockInputSheet({
  visible,
  title,
  placeholder,
  initialValue = '',
  submitLabel,
  onSubmit,
  onClose,
}: BlockInputSheetProps) {
  const { colors } = useTheme();
  const m = useMessages();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface.panel, borderColor: colors.border.default }]}>
          <Text variant="titleSmall" style={{ color: colors.text.primary }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.text.tertiary}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(value.trim())}
            style={[
              styles.input,
              {
                color: colors.text.primary,
                borderColor: colors.border.default,
                backgroundColor: colors.surface.input,
              },
            ]}
          />
          <View style={styles.actions}>
            <Button mode="text" onPress={onClose}>{m.common.cancel}</Button>
            <Button mode="contained" onPress={() => onSubmit(value.trim())}>{submitLabel}</Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
