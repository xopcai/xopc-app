import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

export const ChatHeader = memo(function ChatHeader({
  agentName,
  gatewaySubtitle,
  paddingTop,
  headerBg,
  headerBorder,
  pillText,
  pillMuted,
  showRename,
  onMenuPress,
  onAgentPress,
  onGatewayPress,
  onRename,
  onNewChat,
}: {
  agentName: string;
  gatewaySubtitle: string;
  paddingTop: number;
  headerBg: string;
  headerBorder: string;
  pillText: string;
  pillMuted: string;
  showRename?: boolean;
  onMenuPress: () => void;
  onAgentPress: () => void;
  onGatewayPress: () => void;
  onRename?: () => void;
  onNewChat: () => void;
}) {
  const m = useMessages();
  const gatewayLabel = gatewaySubtitle;

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: headerBg, borderBottomColor: headerBorder, paddingTop },
      ]}
    >
      <View style={styles.headerSide}>
        <IconButton icon="menu" size={22} onPress={onMenuPress} />
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
          style={styles.titlePressable}
          onPress={onGatewayPress}
          accessibilityRole="button"
          accessibilityLabel={m.chat.headerGatewayPicker}
        >
          <Text style={[styles.gatewaySubtitle, { color: pillMuted }]} numberOfLines={1}>
            {gatewayLabel}
          </Text>
        </Pressable>
      </View>

      <View style={styles.headerSideRight}>
        {showRename && onRename ? (
          <IconButton icon="pencil-outline" size={22} onPress={onRename} />
        ) : null}
        <IconButton icon="plus" size={22} onPress={onNewChat} />
      </View>
    </View>
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
  agentTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  gatewaySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
