import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';

import { requestNoteAiEdit } from '../../../query/notes';
import { transcribeVoice } from '../../../api/agent-client';
import {
  MAX_COMPOSER_INPUT_HEIGHT,
  MIN_COMPOSER_INPUT_HEIGHT,
} from '../../chat/composer-layout';
import {
  beginRecording,
  discardRecording,
  finishRecording,
  inferRecordingMimeType,
  requestMicPermission,
  type ExpoRecording,
} from '../../chat/voiceRecording';
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

const MIN_VOICE_MS = 380;

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
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recordingRef = useRef<ExpoRecording | null>(null);

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

  useEffect(() => () => {
    const recordingToDiscard = recordingRef.current;
    recordingRef.current = null;
    if (recordingToDiscard) {
      void discardRecording(recordingToDiscard);
    }
  }, []);

  const appendTranscribedText = useCallback((text: string) => {
    const transcribedText = text.trim();
    if (!transcribedText) {
      onMessage('没有识别到语音内容');
      return;
    }

    setInstruction((currentInstruction) => {
      const currentText = currentInstruction.trim();
      return currentText ? `${currentText} ${transcribedText}` : transcribedText;
    });
  }, [onMessage]);

  const startVoiceInput = useCallback(async () => {
    if (recording || transcribing || loading) return;
    if (Platform.OS === 'web') {
      onMessage('当前环境暂不支持语音输入');
      return;
    }

    const granted = await requestMicPermission();
    if (!granted) {
      onMessage('需要麦克风权限才能语音输入');
      return;
    }

    try {
      const nextRecording = await beginRecording(() => {});
      recordingRef.current = nextRecording;
      setRecording(true);
    } catch {
      onMessage('语音录制失败');
    }
  }, [loading, onMessage, recording, transcribing]);

  const finishVoiceInput = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording || transcribing) return;

    recordingRef.current = null;
    setRecording(false);
    setTranscribing(true);

    try {
      const { uri, durationMillis } = await finishRecording(currentRecording);
      if (durationMillis < MIN_VOICE_MS) {
        onMessage('说话时间太短了');
        return;
      }
      if (!uri) {
        onMessage('语音录制失败');
        return;
      }

      const result = await transcribeVoice(uri, inferRecordingMimeType(uri));
      appendTranscribedText(result.refined || result.raw);
    } catch {
      onMessage('语音转文字失败');
    } finally {
      setTranscribing(false);
    }
  }, [appendTranscribedText, onMessage, transcribing]);

  const toggleVoiceInput = useCallback(() => {
    if (recording) {
      void finishVoiceInput();
      return;
    }
    void startVoiceInput();
  }, [finishVoiceInput, recording, startVoiceInput]);

  const voiceDisabled = loading || transcribing;

  return (
    <View style={[styles.panel, { backgroundColor: surface, borderColor: border }]}> 
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRow}
        keyboardShouldPersistTaps="handled"
      >
        {QUICK_PROMPTS.map((prompt) => (
          <Pressable key={prompt} style={[styles.quickChip, { borderColor: border }]} onPress={() => void submitInstruction(prompt)}>
            <Text style={{ color: textColor, fontSize: 12 }}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
        <Pressable
          style={[
            styles.voiceButton,
            {
              backgroundColor: recording ? '#FF3B30' : isDark ? '#2C2C2E' : '#F2F2F7',
              opacity: voiceDisabled ? 0.5 : 1,
            },
          ]}
          onPress={toggleVoiceInput}
          disabled={voiceDisabled}
          accessibilityRole="button"
          accessibilityLabel={recording ? '结束语音输入' : '开始语音输入'}
        >
          {transcribing ? (
            <ActivityIndicator size={16} color={accent} />
          ) : (
            <Icon source={recording ? 'stop' : 'microphone-outline'} size={18} color={recording ? '#FFFFFF' : accent} />
          )}
        </Pressable>
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={instruction}
          onChangeText={setInstruction}
          placeholder="告诉 AI 如何整理这篇笔记…"
          placeholderTextColor={mutedColor}
          multiline
          textAlignVertical="center"
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          blurOnSubmit={false}
          returnKeyType="default"
        />
        <Pressable style={[styles.sendButton, { backgroundColor: instruction.trim() ? accent : border }]} onPress={() => void submitInstruction()} disabled={!instruction.trim() || loading || recording || transcribing}>
          {loading ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Icon source="arrow-up" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  quickRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  quickChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  suggestion: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  suggestionTitle: { fontWeight: '700' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondaryButton: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  primaryButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  inputRow: {
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  input: {
    flex: 1,
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
    maxHeight: MAX_COMPOSER_INPUT_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontSize: 15,
    lineHeight: 20,
    textAlignVertical: 'center',
    borderWidth: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : null),
    ...Platform.select({
      web: { outlineStyle: 'none' } as Record<string, string>,
      default: {},
    }),
  },
  voiceButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
