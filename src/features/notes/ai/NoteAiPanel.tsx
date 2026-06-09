import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';

import { requestNoteAiEdit } from '../../../query/notes';
import { applyNotePatch, type NoteAiPatch, type NoteBlock } from '../note-blocks';

export interface NoteAiPanelProps {
  noteId: string;
  blocks: NoteBlock[];
  isDark: boolean;
  onApplyBlocks: (blocks: NoteBlock[], patch: NoteAiPatch) => void;
  onMessage: (message: string) => void;
}

const QUICK_PROMPTS = [
  '整理成结构化笔记',
  '提取待办事项',
  '生成标题和标签',
  '压缩成摘要',
];

export const NoteAiPanel = memo(function NoteAiPanel({
  noteId,
  blocks,
  isDark,
  onApplyBlocks,
  onMessage,
}: NoteAiPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<NoteAiPatch | null>(null);

  const textColor = isDark ? '#E5E7EB' : '#1C1C1E';
  const mutedColor = '#8E8E93';
  const surface = isDark ? '#1C1C1E' : '#FFFFFF';
  const border = isDark ? '#3A3A3C' : '#E5E5EA';
  const accent = '#007AFF';

  const submitInstruction = useCallback(async (value?: string) => {
    const finalInstruction = (value ?? instruction).trim();
    if (!finalInstruction || loading) return;
    setLoading(true);
    try {
      const result = await requestNoteAiEdit(noteId, { instruction: finalInstruction, blocks });
      setPendingPatch(result.patch);
      setInstruction('');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'AI 整理失败');
    } finally {
      setLoading(false);
    }
  }, [blocks, instruction, loading, noteId, onMessage]);

  const applyPatch = useCallback(() => {
    if (!pendingPatch) return;
    onApplyBlocks(applyNotePatch(blocks, pendingPatch), pendingPatch);
    setPendingPatch(null);
  }, [blocks, onApplyBlocks, pendingPatch]);

  return (
    <View style={[styles.panel, { backgroundColor: surface, borderColor: border }]}> 
      <View style={styles.headerRow}>
        <Icon source="creation" size={18} color={accent} />
        <Text style={[styles.title, { color: textColor }]}>AI 持续整理</Text>
      </View>

      <View style={styles.quickRow}>
        {QUICK_PROMPTS.map((prompt) => (
          <Pressable key={prompt} style={[styles.quickChip, { borderColor: border }]} onPress={() => void submitInstruction(prompt)}>
            <Text style={{ color: textColor, fontSize: 12 }}>{prompt}</Text>
          </Pressable>
        ))}
      </View>

      {pendingPatch ? (
        <View style={[styles.suggestion, { borderColor: border }]}> 
          <Text style={[styles.suggestionTitle, { color: textColor }]}>AI 建议</Text>
          <Text style={{ color: mutedColor, lineHeight: 19 }}>{pendingPatch.summary}</Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.secondaryButton, { borderColor: border }]} onPress={() => setPendingPatch(null)}>
              <Text style={{ color: mutedColor }}>放弃</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, { backgroundColor: accent }]} onPress={applyPatch}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>应用</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.inputRow, { borderColor: border }]}> 
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={instruction}
          onChangeText={setInstruction}
          placeholder="告诉 AI 如何整理这篇笔记…"
          placeholderTextColor={mutedColor}
          multiline
        />
        <Pressable style={[styles.sendButton, { backgroundColor: instruction.trim() ? accent : border }]} onPress={() => void submitInstruction()} disabled={!instruction.trim() || loading}>
          {loading ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Icon source="arrow-up" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '700', fontSize: 14 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  suggestion: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  suggestionTitle: { fontWeight: '700' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondaryButton: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  primaryButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  inputRow: { borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'flex-end', padding: 6, gap: 6 },
  input: { flex: 1, minHeight: 34, maxHeight: 90, paddingHorizontal: 6, paddingVertical: 6, fontSize: 14, lineHeight: 19 },
  sendButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
