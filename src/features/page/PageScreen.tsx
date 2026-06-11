import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingHeader } from '../../components/FloatingHeader';

import { openChat } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
import {
  fetchNote,
  updateNote,
  recordNoteOpen,
  type Note,
  type NoteBlock,
} from '../../query/notes';
import { createSession } from '../../query/sessions';
import { useTheme } from '../../theme';

import { PageAiActions } from './PageAiActions';

function blockToText(block: NoteBlock): string {
  if ('text' in block) return block.text || '';
  return '';
}

export function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [snackMsg, setSnackMsg] = useState('');

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: async () => {
      const note = await fetchNote(id!);
      void recordNoteOpen(id!);
      return note;
    },
    enabled: Boolean(id),
  });

  const note = noteQuery.data;
  const blocks = note?.blocks ?? [];

  const plainText = useMemo(
    () => blocks.map(blockToText).filter(Boolean).join('\n'),
    [blocks],
  );

  const renameMutation = useMutation({
    mutationFn: (text: string) => updateNote(id!, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.note(id!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '保存失败'),
  });

  const startThreadMutation = useMutation({
    mutationFn: async (message: string) => {
      const sessionKey = await createSession();
      return { sessionKey, message };
    },
    onSuccess: ({ sessionKey, message }) => openChat(router, sessionKey, { msg: message }),
    onError: (err) => setSnackMsg(err instanceof Error ? err.message : '创建 AI 会话失败'),
  });

  const handleAiAction = useCallback((prompt: string) => {
    const title = note?.text ? `${prompt}：${note.text.slice(0, 40)}` : prompt;
    startThreadMutation.mutate(plainText ? `${title}\n\n${plainText}` : title);
  }, [note?.text, plainText, startThreadMutation]);

  const snippet = note?.text || blocks.map(blockToText).filter(Boolean).join('\n') || '';

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
      <FloatingHeader
        title="笔记"
        onBack={() => router.back()}
        rightIcon="message-processing-outline"
        onRightPress={() => handleAiAction('基于这个笔记发起 AI 会话')}
      />

      {!noteQuery.isLoading && !note ? (
        <View style={styles.center}>
          <Icon source="file-question-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>内容不存在</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}> 
          <TextInput
            value={snippet}
            onChangeText={(text) => {
              queryClient.setQueryData(queryKeys.note(id!), (prev: Note | undefined) => {
                if (!prev) return prev;
                return { ...prev, text };
              });
            }}
            onBlur={() => {
              const currentNote = queryClient.getQueryData<Note>(queryKeys.note(id!));
              if (currentNote?.text) renameMutation.mutate(currentNote.text);
            }}
            style={[styles.titleInput, { color: colors.text.primary }]}
            multiline
          />
          <PageAiActions
            onSummarize={() => handleAiAction('总结这个笔记')}
            onContinueWriting={() => handleAiAction('继续写这个笔记')}
            onExtractTasks={() => handleAiAction('从这个笔记提取任务')}
            onStartThread={() => handleAiAction('基于这个笔记发起 AI 会话')}
          />
          {blocks.length > 0 && (
            <View style={styles.blocks}>
              {blocks.map((block) => (
                <View key={block.id} style={[styles.blockCard, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]}> 
                  <Text style={[styles.blockText, { color: colors.text.primary }]}>{blockToText(block)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <Snackbar visible={!!snackMsg} onDismiss={() => setSnackMsg('')} duration={2200}>{snackMsg}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  titleInput: { fontSize: 22, fontWeight: '900', lineHeight: 30, paddingVertical: 8 },
  blocks: { gap: 10 },
  blockCard: { borderWidth: 1, borderRadius: 18, padding: 14 },
  blockText: { fontSize: 16, fontWeight: '600', lineHeight: 23 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
});
