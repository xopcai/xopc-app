/**
 * Bottom sheet for quick agent/model switching within the chat screen.
 * Shows the agent list with current selection highlighted, tap to switch.
 */
import { memo, useCallback } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import type { ChatAgentOption } from '../../query/agents';
import { useMessages } from '../../i18n/messages';

export const AgentPickerSheet = memo(function AgentPickerSheet({
  visible,
  agents,
  currentAgentId,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  agents: ChatAgentOption[];
  currentAgentId: string;
  onSelect: (agentId: string) => void;
  onDismiss: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();

  const handleSelect = useCallback(
    (agentId: string) => {
      onSelect(agentId);
      onDismiss();
    },
    [onSelect, onDismiss],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text
            variant="titleSmall"
            style={[styles.sheetTitle, { color: isDark ? '#F5F5F7' : '#1C1C1E' }]}
          >
            {m.chat.agentPickerTitle}
          </Text>

          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {agents.map((agent) => {
              const isActive = agent.id === currentAgentId;
              return (
                <Pressable
                  key={agent.id}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: isActive
                        ? (isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)')
                        : 'transparent',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => handleSelect(agent.id)}
                >
                  <View style={styles.rowContent}>
                    <Text
                      style={[
                        styles.agentName,
                        { color: isDark ? '#E5E5EA' : '#1C1C1E' },
                        isActive && styles.agentNameActive,
                      ]}
                      numberOfLines={1}
                    >
                      {agent.name ?? agent.id}
                    </Text>
                    {agent.description ? (
                      <Text
                        style={[styles.agentDesc, { color: isDark ? '#8E8E93' : '#6B7280' }]}
                        numberOfLines={1}
                      >
                        {agent.description}
                      </Text>
                    ) : null}
                  </View>
                  {isActive ? (
                    <Icon source="check" size={18} color="#3B82F6" />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  scrollArea: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  agentName: {
    fontSize: 15,
    fontWeight: '500',
  },
  agentNameActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  agentDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
