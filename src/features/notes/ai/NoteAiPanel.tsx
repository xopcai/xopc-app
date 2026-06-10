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
import { useMessages } from '../../../i18n/messages';
import { useTheme } from '../../../theme';
import { applyNotePatch, type NoteAiPatch, type NoteBlock, type NotePatchOperation } from '../note-blocks';

/** Human-readable description of an AI patch operation for the diff preview. */
function describeOperation(op: NotePatchOperation): string {
  switch (op.type) {
    case 'replaceBlocks':
      return `Replace all blocks (${op.blocks.length} blocks)`;
    case 'insertBlocksAfter':
      return `Insert ${op.blocks.length} block${op.blocks.length > 1 ? 's' : ''}`;
    case 'updateBlock':
      return `Update block`;
    case 'updateMetadata': {
      const parts: string[] = [];
      if (op.title) parts.push(`title → "${op.title}"`);
      if (op.tags) parts.push(`tags → [${op.tags.join(', ')}]`);
      if (op.status) parts.push(`status → ${op.status}`);
      return parts.join(', ') || 'Update metadata';
    }
    default:
      return 'Change';
  }
}

export interface NoteAiPanelProps {
  noteId: string;
  blocks: NoteBlock[];
  isDark: boolean;
  onApplyBlocks: (blocks: NoteBlock[], patch: NoteAiPatch) => void;
  onMessage: (message: string) => void;
}

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
  const [acceptedOps, setAcceptedOps] = useState<Set<number>>(new Set());
  const [rejectedOps, setRejectedOps] = useState<Set<number>>(new Set());
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recordingRef = useRef<ExpoRecording | null>(null);
  const m = useMessages();
  const pm = m.notesPage;
  const { colors } = useTheme();

  const quickPrompts = [
    pm.aiPromptOrganize,
    pm.aiPromptExtractTodos,
    pm.aiPromptTitleTags,
    pm.aiPromptSummarize,
  ];

  const textColor = colors.text.primary;
  const mutedColor = colors.text.tertiary;
  const surface = colors.surface.panel;
  const border = colors.border.default;
  const accent = colors.accent.primary;

  const submitInstruction = useCallback(async (value?: string) => {
    const finalInstruction = (value ?? instruction).trim();
    if (!finalInstruction || loading) return;
    setLoading(true);
    try {
      const result = await requestNoteAiEdit(noteId, { instruction: finalInstruction, blocks });
      setPendingPatch(result.patch);
      setAcceptedOps(new Set());
      setRejectedOps(new Set());
      setInstruction('');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : pm.aiEditFailed);
    } finally {
      setLoading(false);
    }
  }, [blocks, instruction, loading, noteId, onMessage, pm.aiEditFailed]);

  const applyPatch = useCallback(() => {
    if (!pendingPatch) return;
    // Apply only accepted operations (or all if none explicitly selected)
    const ops = pendingPatch.operations;
    const hasSelections = acceptedOps.size > 0 || rejectedOps.size > 0;
    const selectedOps = hasSelections
      ? ops.filter((_, index) => acceptedOps.has(index) || (!rejectedOps.has(index) && !acceptedOps.size))
      : ops;

    if (selectedOps.length === 0) {
      setPendingPatch(null);
      return;
    }

    const filteredPatch: NoteAiPatch = { ...pendingPatch, operations: selectedOps };
    onApplyBlocks(applyNotePatch(blocks, filteredPatch), filteredPatch);
    setPendingPatch(null);
    setAcceptedOps(new Set());
    setRejectedOps(new Set());
  }, [acceptedOps, blocks, onApplyBlocks, pendingPatch, rejectedOps]);

  const toggleOpAccept = useCallback((index: number) => {
    setAcceptedOps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setRejectedOps((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const toggleOpReject = useCallback((index: number) => {
    setRejectedOps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setAcceptedOps((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

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
      onMessage(pm.aiNoVoiceContent);
      return;
    }

    setInstruction((currentInstruction) => {
      const currentText = currentInstruction.trim();
      return currentText ? `${currentText} ${transcribedText}` : transcribedText;
    });
  }, [onMessage, pm.aiNoVoiceContent]);

  const startVoiceInput = useCallback(async () => {
    if (recording || transcribing || loading) return;
    if (Platform.OS === 'web') {
      onMessage(pm.aiVoiceNotSupported);
      return;
    }

    const granted = await requestMicPermission();
    if (!granted) {
      onMessage(pm.aiMicRequired);
      return;
    }

    try {
      const nextRecording = await beginRecording(() => {});
      recordingRef.current = nextRecording;
      setRecording(true);
    } catch {
      onMessage(pm.aiRecordingFailed);
    }
  }, [loading, onMessage, pm, recording, transcribing]);

  const finishVoiceInput = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording || transcribing) return;

    recordingRef.current = null;
    setRecording(false);
    setTranscribing(true);

    try {
      const { uri, durationMillis } = await finishRecording(currentRecording);
      if (durationMillis < MIN_VOICE_MS) {
        onMessage(pm.aiVoiceTooShort);
        return;
      }
      if (!uri) {
        onMessage(pm.aiRecordingFailed);
        return;
      }

      const result = await transcribeVoice(uri, inferRecordingMimeType(uri));
      appendTranscribedText(result.refined || result.raw);
    } catch {
      onMessage(pm.aiVoiceFailed);
    } finally {
      setTranscribing(false);
    }
  }, [appendTranscribedText, onMessage, pm, transcribing]);

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
        {quickPrompts.map((prompt) => (
          <Pressable key={prompt} style={[styles.quickChip, { borderColor: border }]} onPress={() => void submitInstruction(prompt)}>
            <Text style={{ color: textColor, fontSize: 12 }}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {pendingPatch ? (
        <View style={[styles.suggestion, { borderColor: border }]}>
          <Text style={[styles.suggestionTitle, { color: textColor }]}>{pm.aiSuggestionTitle}</Text>
          <Text style={{ color: mutedColor, lineHeight: 19, fontSize: 13 }}>{pendingPatch.summary}</Text>

          {/* Per-operation diff preview */}
          {pendingPatch.operations.map((op, index) => {
            const isAccepted = acceptedOps.has(index);
            const isRejected = rejectedOps.has(index);
            const opLabel = describeOperation(op);
            return (
              <View
                key={index}
                style={[
                  styles.diffRow,
                  { borderColor: border },
                  isAccepted && { backgroundColor: `${colors.semantic.success}12` },
                  isRejected && { backgroundColor: `${colors.semantic.error}12`, opacity: 0.6 },
                ]}
              >
                <Text style={[styles.diffLabel, { color: textColor }]} numberOfLines={2}>{opLabel}</Text>
                <View style={styles.diffActions}>
                  <Pressable style={styles.diffBtn} onPress={() => toggleOpAccept(index)}>
                    <Icon source={isAccepted ? 'check-circle' : 'check-circle-outline'} size={20} color={colors.semantic.success} />
                  </Pressable>
                  <Pressable style={styles.diffBtn} onPress={() => toggleOpReject(index)}>
                    <Icon source={isRejected ? 'close-circle' : 'close-circle-outline'} size={20} color={colors.semantic.error} />
                  </Pressable>
                </View>
              </View>
            );
          })}

          <View style={styles.actionRow}>
            <Pressable style={[styles.secondaryButton, { borderColor: border }]} onPress={() => setPendingPatch(null)}>
              <Text style={{ color: mutedColor }}>{pm.aiDiscard}</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, { backgroundColor: accent }]} onPress={applyPatch}>
              <Text style={{ color: colors.text.inverse, fontWeight: '700' }}>{pm.aiApply}</Text>
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
          accessibilityLabel={recording ? pm.aiVoiceStop : pm.aiVoiceStart}
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
          placeholder={pm.aiInputPlaceholder}
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
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  diffLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  diffActions: { flexDirection: 'row', gap: 4 },
  diffBtn: { padding: 2 },
});
