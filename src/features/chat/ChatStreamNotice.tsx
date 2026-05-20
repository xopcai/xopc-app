import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';

import { chatColors } from './styles';

type ChatStreamNoticeProps = {
  isDark: boolean;
  reconnecting?: boolean;
  reconnectingLabel: string;
  resumeVisible?: boolean;
  resumeLabel: string;
  resumeActionLabel: string;
  onResume?: () => void;
};

export const ChatStreamNotice = memo(function ChatStreamNotice({
  isDark,
  reconnecting,
  reconnectingLabel,
  resumeVisible,
  resumeLabel,
  resumeActionLabel,
  onResume,
}: ChatStreamNoticeProps) {
  if (reconnecting) {
    return (
      <View
        style={[
          styles.bar,
          {
            backgroundColor: isDark ? 'rgba(37, 99, 235, 0.14)' : '#EFF6FF',
            borderBottomColor: isDark ? 'rgba(59, 130, 246, 0.22)' : '#DBEAFE',
          },
        ]}
      >
        <ActivityIndicator size={14} color={chatColors.accent} />
        <Text style={[styles.message, { color: isDark ? '#BFDBFE' : '#1D4ED8' }]} numberOfLines={2}>
          {reconnectingLabel}
        </Text>
      </View>
    );
  }

  if (resumeVisible) {
    return (
      <View
        style={[
          styles.bar,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB',
          },
        ]}
      >
        <Icon source="sync" size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
        <Text style={[styles.message, { color: isDark ? '#D1D5DB' : '#4B5563' }]} numberOfLines={2}>
          {resumeLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onResume}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: isDark ? 'rgba(37, 99, 235, 0.22)' : '#DBEAFE',
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <Text style={[styles.actionLabel, { color: chatColors.accent }]}>{resumeActionLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
