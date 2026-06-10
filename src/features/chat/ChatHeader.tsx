import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import type { ChatModelOption } from '../../query/models';

import { ModelPickerMenu } from './ModelPickerMenu';

export const ChatHeader = memo(function ChatHeader({
  agentName,
  modelName,
  models,
  currentModelId,
  paddingTop,
  headerBg,
  headerBorder,
  pillText,
  pillMuted,
  onBackPress,
  onAgentPress,
  onModelSelect,
  onNewChat,
}: {
  agentName: string;
  modelName: string;
  models: ChatModelOption[];
  currentModelId: string;
  paddingTop: number;
  headerBg: string;
  headerBorder: string;
  pillText: string;
  pillMuted: string;
  onBackPress: () => void;
  onAgentPress: () => void;
  onModelSelect: (modelId: string) => void;
  onNewChat: () => void;
}) {
  const m = useMessages();
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const pickerTopOffset = paddingTop + 52;

  const openModelPicker = useCallback(() => {
    setModelPickerVisible(true);
  }, []);

  const closeModelPicker = useCallback(() => {
    setModelPickerVisible(false);
  }, []);

  return (
    <>
      <View
        style={[
          styles.header,
          { backgroundColor: headerBg, borderBottomColor: headerBorder, paddingTop },
        ]}
      >
        <View style={styles.headerSide}>
          <IconButton icon="arrow-left" size={22} onPress={onBackPress} />
        </View>

        <View style={styles.headerCenter}>
          <Pressable
            style={styles.titlePressable}
            onPress={onAgentPress}
            accessibilityRole="button"
            accessibilityLabel={m.chat.headerAgentPicker}
          >
            <Text style={[styles.agentTitle, { color: pillText }]} numberOfLines={1}>
              {agentName}
            </Text>
          </Pressable>
          <Pressable
            style={styles.modelPressable}
            onPress={openModelPicker}
            accessibilityRole="button"
            accessibilityLabel={m.chat.headerModelPicker}
          >
            <Text style={[styles.modelTitle, { color: pillText }]} numberOfLines={1}>
              {modelName}
            </Text>
            <Icon source="chevron-down" size={16} color={pillMuted} />
          </Pressable>
        </View>

        <View style={styles.headerSideRight}>
          <IconButton icon="plus" size={22} onPress={onNewChat} />
        </View>
      </View>

      <ModelPickerMenu
        visible={modelPickerVisible}
        topOffset={pickerTopOffset}
        models={models}
        currentModelId={currentModelId}
        onSelect={onModelSelect}
        onDismiss={closeModelPicker}
      />
    </>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: {
    width: 48,
    alignItems: 'flex-start',
  },
  headerSideRight: {
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  titlePressable: {
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  modelPressable: {
    maxWidth: '100%',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  agentTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  modelTitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1,
  },
});
