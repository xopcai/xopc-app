import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Paragraph, Portal } from 'react-native-paper';

import { t, useMessages } from '../i18n/messages';
import { useTheme } from '../theme';

type BatchDeleteConfirmDialogProps = {
  visible: boolean;
  count: number;
  onDismiss: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export const BatchDeleteConfirmDialog = memo(function BatchDeleteConfirmDialog({
  visible,
  count,
  onDismiss,
  onConfirm,
  loading = false,
}: BatchDeleteConfirmDialogProps) {
  const m = useMessages();
  const { colors } = useTheme();
  const li = m.listInteraction;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{li.batchDeleteTitle}</Dialog.Title>
        <Dialog.Content>
          <Paragraph>{t(li.batchDeleteMessage, { count })}</Paragraph>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>
            {m.common.cancel}
          </Button>
          <Button
            onPress={onConfirm}
            disabled={loading}
            loading={loading}
            textColor={colors.semantic.errorBold}
          >
            {li.batchDeleteConfirm}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
});

const styles = StyleSheet.create({
  dialog: {
    maxWidth: 400,
    alignSelf: 'center',
  },
});
