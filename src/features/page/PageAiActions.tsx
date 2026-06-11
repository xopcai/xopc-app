import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../theme';

interface PageAiActionsProps {
  onSummarize: () => void;
  onContinueWriting: () => void;
  onExtractTasks: () => void;
  onStartThread: () => void;
}

const ACTIONS = [
  { key: 'summarize', label: '总结', icon: 'text-box-search-outline' },
  { key: 'continue', label: '续写', icon: 'creation-outline' },
  { key: 'tasks', label: '提取任务', icon: 'checkbox-marked-circle-outline' },
  { key: 'thread', label: '问 AI', icon: 'message-processing-outline' },
] as const;

export function PageAiActions({
  onSummarize,
  onContinueWriting,
  onExtractTasks,
  onStartThread,
}: PageAiActionsProps) {
  const { colors, isDark } = useTheme();
  const handlers = {
    summarize: onSummarize,
    continue: onContinueWriting,
    tasks: onExtractTasks,
    thread: onStartThread,
  };

  return (
    <View style={styles.row}>
      {ACTIONS.map((action) => (
        <Pressable
          key={action.key}
          style={[
            styles.button,
            { backgroundColor: isDark ? 'rgba(109,93,251,0.18)' : 'rgba(109,93,251,0.10)' },
          ]}
          onPress={handlers[action.key]}
        >
          <Icon source={action.icon} size={16} color="#6D5DFB" />
          <Text style={[styles.label, { color: colors.text.primary }]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: { fontSize: 12, fontWeight: '800' },
});
