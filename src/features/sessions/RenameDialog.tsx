/**
 * Dialog for renaming a session.
 * Shows a text input pre-filled with the current name.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

const MAX_DIALOG_WIDTH = 340;
const DIALOG_MARGIN = 24;

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
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const dialogWidth = Math.min(MAX_DIALOG_WIDTH, screenWidth - DIALOG_MARGIN * 2);
  const [draft, setDraft] = useState(currentName);

  useEffect(() => {
    if (visible) setDraft(currentName);
  }, [visible, currentName]);

  const handleSubmit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
  }, [draft, onRename]);

  const cardStyle = useMemo(
    () => ({
      width: dialogWidth,
      backgroundColor: theme.colors.elevation.level3,
    }),
    [dialogWidth, theme.colors.elevation.level3],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={m.renameDialog.cancel}
        />
        <View style={[styles.card, cardStyle]}>
          <Text variant="titleLarge" style={styles.title}>
            {m.renameDialog.title}
          </Text>
          <TextInput
            mode="outlined"
            dense
            value={draft}
            onChangeText={setDraft}
            placeholder={m.renameDialog.placeholder}
            autoFocus
            onSubmitEditing={handleSubmit}
            disabled={loading}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Button onPress={onDismiss} disabled={loading}>
              {m.renameDialog.cancel}
            </Button>
            <Button
              onPress={handleSubmit}
              disabled={!draft.trim() || loading}
              loading={loading}
            >
              {m.renameDialog.rename}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: DIALOG_MARGIN,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    maxWidth: '100%',
  },
  title: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
});
