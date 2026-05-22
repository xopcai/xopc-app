/**
 * Kimi-style LLM model picker dropdown anchored below the chat header.
 */
import { memo, useCallback } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import type { ChatModelOption } from '../../query/models';

export const ModelPickerMenu = memo(function ModelPickerMenu({
  visible,
  topOffset,
  models,
  currentModelId,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  topOffset: number;
  models: ChatModelOption[];
  currentModelId: string;
  onSelect: (modelId: string) => void;
  onDismiss: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      onDismiss();
    },
    [onDismiss, onSelect],
  );

  const panelBg = isDark ? '#2C2C2E' : '#FFFFFF';
  const titleColor = isDark ? '#F5F5F7' : '#1C1C1E';
  const descColor = isDark ? '#8E8E93' : '#6D6D70';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable
          style={[
            styles.panel,
            {
              top: topOffset,
              backgroundColor: panelBg,
              shadowColor: isDark ? '#000000' : '#1C1C1E',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            style={styles.scrollArea}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {models.length === 0 ? (
              <Text style={[styles.emptyText, { color: descColor }]}>{m.chat.modelPickerEmpty}</Text>
            ) : (
              models.map((model) => {
                const isActive = model.id === currentModelId;
                return (
                  <Pressable
                    key={model.id}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => handleSelect(model.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>
                        {model.name ?? model.id}
                      </Text>
                      {model.description ? (
                        <Text style={[styles.rowDesc, { color: descColor }]} numberOfLines={2}>
                          {model.description}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? <Icon source="check" size={20} color="#007AFF" /> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  panel: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 18,
    paddingVertical: 8,
    maxHeight: 360,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  scrollArea: {
    maxHeight: 344,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
});
