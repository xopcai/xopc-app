import { memo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
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
  const { width } = useWindowDimensions();
  const li = m.listInteraction;
  const dialogWidth = Math.min(400, Math.max(0, width - 52));

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, { width: dialogWidth }]}>
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
    alignSelf: 'center',
  },
});
