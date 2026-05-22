/**
 * Chat composer — Kimi-style compact/expanded input, attachments, text / voice modes.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { Icon, Snackbar } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { transcribeVoice } from '../../api/agent-client';
import { ChatPendingFollowUpStack } from './ChatPendingFollowUpStack';
import { canSendComposerDraft } from './composer-send-helpers';
import type { WireAttachment } from './composer.types';
import type { PendingFollowUp } from './pending-follow-up.types';
import { wireFollowUpAttachmentsToComposer } from './follow-up-utils';
import { useComposerActions } from './use-composer-actions';
import { AttachmentSourceSheet } from './attachment-source-sheet';
import { ComposerAttachmentStrip } from './composer-attachment-strip';
import { CommandPaletteBar } from './CommandPaletteBar';
import { SlashTokenInput } from './SlashTokenInput';
import {
  clampComposerInputHeight,
  estimateComposerInputHeight,
  MAX_COMPOSER_INPUT_HEIGHT,
  MIN_COMPOSER_INPUT_HEIGHT,
} from './composer-layout';
import { useCommandPalette } from './useCommandPalette';
import { useComposerAttachments } from './use-composer-attachments';
import { VoiceMeterBars } from './VoiceMeterBars';
import {
  beginRecording,
  discardRecording,
  finishRecording,
  inferRecordingMimeType,
  meteringToLevel,
  requestMicPermission,
  type ExpoRecording,
} from './voiceRecording';

const SWIPE_CANCEL_PX = 56;
const MIN_VOICE_MS = 380;

type InputMode = 'text' | 'voice';

export const ChatComposer = memo(function ChatComposer({
  disabled,
  streaming,
  onSend,
  onSendVoice,
  onAbort,
  placeholder,
  suggestionDraft,
  onConsumeSuggestionDraft,
  keyboardVisible = false,
  onAddPendingFollowUp,
  pendingFollowUps = [],
  editingFollowUpId = null,
  onBeginEditFollowUp,
  onCancelEditFollowUp,
  onCommitEditFollowUp,
  onPendingFollowUpRemove,
  onPendingFollowUpMove,
  onPendingFollowUpSteer,
  steeringFollowUpId = null,
  onQueueFull,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string, attachments?: WireAttachment[]) => Promise<boolean>;
  onSendVoice?: (payload: { uri: string; durationMillis: number; mimeType?: string }) => void | Promise<void>;
  onAbort: () => void;
  placeholder?: string;
  suggestionDraft?: string;
  onConsumeSuggestionDraft?: () => void;
  keyboardVisible?: boolean;
  onAddPendingFollowUp?: (text: string, attachments?: WireAttachment[]) => void | Promise<void>;
  pendingFollowUps?: PendingFollowUp[];
  editingFollowUpId?: string | null;
  onBeginEditFollowUp?: (id: string) => void;
  onCancelEditFollowUp?: () => void;
  onCommitEditFollowUp?: (
    id: string,
    text: string,
    attachments?: PendingFollowUp['attachments'],
  ) => void;
  onPendingFollowUpRemove?: (id: string) => void;
  onPendingFollowUpMove?: (id: string, dir: 'up' | 'down') => void;
  onPendingFollowUpSteer?: (id: string) => void;
  steeringFollowUpId?: string | null;
  onQueueFull?: () => void;
}) {
  const m = useMessages();
  const cm = m.chat;
  const scheme = useColorScheme();

  const [mode, setMode] = useState<InputMode>('text');
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_COMPOSER_INPUT_HEIGHT);
  const [inputWidth, setInputWidth] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const att = useComposerAttachments({
    maxAttachmentsReached: cm.maxAttachmentsReached,
    maxAttachmentsTruncated: cm.maxAttachmentsTruncated,
    attachmentFileTooLarge: cm.attachmentFileTooLarge,
    attachmentLoadFailed: cm.attachmentLoadFailed,
    attachmentPermissionDenied: cm.attachmentPermissionDenied,
  });

  const palette = useCommandPalette(draft, cursorPos);

  const [hudOpen, setHudOpen] = useState(false);
  const [hudCancel, setHudCancel] = useState(false);
  const [meterSamples, setMeterSamples] = useState<number[]>([]);
  const [snack, setSnack] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  const recordingRef = useRef<ExpoRecording | null>(null);
  const readyRef = useRef(false);
  const abortStartRef = useRef(false);
  const cancelZoneRef = useRef(false);
  const grantInFlightRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastLoadedEditFollowUpIdRef = useRef<string | null>(null);

  const runBusy = streaming || disabled;
  const hasDraft = canSendComposerDraft(draft, att.attachments.length);

  const clearEditFollowUpRef = useCallback(() => {
    lastLoadedEditFollowUpIdRef.current = null;
  }, []);

  const resetEditor = useCallback(() => {
    setDraft('');
    setCursorPos(0);
    setInputHeight(MIN_COMPOSER_INPUT_HEIGHT);
  }, []);

  const actions = useComposerActions({
    chat: cm,
    runBusy,
    voiceRecording: hudOpen,
    stopVoiceRecording: () => {
      abortStartRef.current = true;
    },
    editingFollowUpId,
    getTextValue: () => draftRef.current,
    getAttachmentCount: () => att.attachments.length,
    wireAttachmentsPayload: att.toWirePayload,
    onSend: (text, attachments) => {
      void onSend(text, attachments);
    },
    onAddPendingFollowUp,
    onCommitEditFollowUp: onCommitEditFollowUp ?? (() => {}),
    onQueueFull,
    pendingFollowUpsCount: pendingFollowUps.length,
    resetEditor,
    clearAttachments: att.clearAttachments,
    clearEditFollowUpRef,
  });

  const isExpanded = useMemo(
    () =>
      isFocused ||
      draft.length > 0 ||
      att.attachments.length > 0 ||
      keyboardVisible ||
      palette.open,
    [isFocused, draft.length, att.attachments.length, keyboardVisible, palette.open],
  );

  useEffect(() => {
    if (streaming && mode === 'voice') {
      setMode('text');
    }
  }, [streaming, mode]);

  const updateDraft = useCallback(
    (nextDraft: string) => {
      setDraft(nextDraft);
      setCursorPos(nextDraft.length);
      setInputHeight(estimateComposerInputHeight(nextDraft, inputWidth || undefined));
    },
    [inputWidth],
  );

  useEffect(() => {
    if (suggestionDraft == null || suggestionDraft === '') return;
    updateDraft(suggestionDraft);
    setMode('text');
    onConsumeSuggestionDraft?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [suggestionDraft, onConsumeSuggestionDraft, updateDraft]);

  useEffect(() => {
    if (!editingFollowUpId) {
      if (lastLoadedEditFollowUpIdRef.current) {
        att.clearAttachments();
        resetEditor();
        lastLoadedEditFollowUpIdRef.current = null;
      }
      return;
    }
    if (editingFollowUpId === lastLoadedEditFollowUpIdRef.current) return;
    const row = pendingFollowUps.find((r) => r.id === editingFollowUpId);
    if (!row) {
      onCancelEditFollowUp?.();
      return;
    }
    lastLoadedEditFollowUpIdRef.current = editingFollowUpId;
    att.setAttachments(wireFollowUpAttachmentsToComposer(row.attachments ?? []));
    updateDraft(row.text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [
    att,
    editingFollowUpId,
    onCancelEditFollowUp,
    pendingFollowUps,
    resetEditor,
    updateDraft,
  ]);

  const canSendIdle = hasDraft && !disabled && !runBusy;
  const canQueueWhileBusy = runBusy && hasDraft;

  const finalizeRecordingInteraction = useCallback(async () => {
    const rec = recordingRef.current;
    const shouldDiscard = cancelZoneRef.current;

    recordingRef.current = null;
    readyRef.current = false;
    abortStartRef.current = false;
    grantInFlightRef.current = false;
    cancelZoneRef.current = false;
    setHudOpen(false);
    setHudCancel(false);
    setMeterSamples([]);

    if (!rec) return;

    if (shouldDiscard) {
      await discardRecording(rec);
      return;
    }

    try {
      const { uri, durationMillis } = await finishRecording(rec);
      if (durationMillis < MIN_VOICE_MS) {
        setSnack(cm.voiceTooShort);
        return;
      }
      if (!uri) {
        setSnack(cm.voiceRecordingFailed);
        return;
      }

      const mimeType = inferRecordingMimeType(uri);

      // Try STT transcription → fill draft for editing
      setTranscribing(true);
      try {
        const result = await transcribeVoice(uri, mimeType);
        const text = result.refined || result.raw;
        if (text.trim()) {
          // Append to existing draft or set as new draft
          const currentDraft = draftRef.current;
          const nextDraft = currentDraft.trim()
            ? `${currentDraft.trim()} ${text.trim()}`
            : text.trim();
          updateDraft(nextDraft);
          setMode('text');
          requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          setSnack(cm.voiceNoSpeechDetected);
        }
      } catch {
        // Transcription failed — fallback to sending voice message directly
        if (onSendVoice) {
          await onSendVoice({ uri, durationMillis, mimeType });
        } else {
          setSnack(cm.voiceTranscribeFailed);
        }
      } finally {
        setTranscribing(false);
      }
    } catch {
      setSnack(cm.voiceRecordingFailed);
    }
  }, [cm, onSendVoice, updateDraft]);

  const startGrantFlow = useCallback(() => {
    if (disabled || streaming || grantInFlightRef.current) return;
    abortStartRef.current = false;
    readyRef.current = false;
    recordingRef.current = null;
    cancelZoneRef.current = false;
    setHudCancel(false);
    setMeterSamples([]);
    grantInFlightRef.current = true;

    if (Platform.OS === 'web') {
      grantInFlightRef.current = false;
      setSnack(cm.voiceWebUnsupported);
      return;
    }

    void (async () => {
      const ok = await requestMicPermission();
      if (!ok) {
        grantInFlightRef.current = false;
        setSnack(cm.voicePermissionDenied);
        return;
      }
      try {
        const rec = await beginRecording((metering) => {
          setMeterSamples((prev) => [...prev.slice(-47), meteringToLevel(metering)]);
        });
        if (abortStartRef.current) {
          await discardRecording(rec);
          grantInFlightRef.current = false;
          return;
        }
        recordingRef.current = rec;
        readyRef.current = true;
        grantInFlightRef.current = false;
        setHudOpen(true);
      } catch {
        grantInFlightRef.current = false;
        setSnack(cm.voiceRecordingFailed);
      }
    })();
  }, [cm, disabled, streaming]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => mode === 'voice' && !disabled && !streaming,
        onMoveShouldSetPanResponder: () => mode === 'voice' && !disabled && !streaming,
        onPanResponderGrant: () => {
          cancelZoneRef.current = false;
          setHudCancel(false);
          startGrantFlow();
        },
        onPanResponderMove: (_, g) => {
          const cancel = g.dy < -SWIPE_CANCEL_PX;
          cancelZoneRef.current = cancel;
          setHudCancel(cancel);
        },
        onPanResponderRelease: () => {
          if (!readyRef.current) {
            abortStartRef.current = true;
            return;
          }
          void finalizeRecordingInteraction();
        },
        onPanResponderTerminate: () => {
          if (!readyRef.current) {
            abortStartRef.current = true;
            return;
          }
          cancelZoneRef.current = true;
          void finalizeRecordingInteraction();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [finalizeRecordingInteraction, mode, disabled, streaming, startGrantFlow],
  );

  const handlePaletteSelect = useCallback(
    (item: import('./command-palette.types').PaletteItem) => {
      updateDraft(palette.applyItem(item));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [palette, updateDraft],
  );

  const handleSend = useCallback(() => {
    if (canQueueWhileBusy) {
      void actions.flushSteeringDraft();
      return;
    }
    if (!canSendIdle || runBusy) return;

    const previousDraft = draft;
    const previousAttachments = att.attachments;
    const wire = att.toWirePayload();

    resetEditor();
    att.clearAttachments();
    inputRef.current?.blur();

    void onSend(previousDraft.trim(), wire.length ? wire : undefined)
      .then((accepted) => {
        if (accepted) return;
        updateDraft(previousDraft);
        att.restoreAttachments(previousAttachments);
        requestAnimationFrame(() => inputRef.current?.focus());
      })
      .catch(() => {
        updateDraft(previousDraft);
        att.restoreAttachments(previousAttachments);
        requestAnimationFrame(() => inputRef.current?.focus());
      });
  }, [actions, att, canQueueWhileBusy, canSendIdle, draft, onSend, resetEditor, runBusy, updateDraft]);

  const handleAbort = useCallback(() => {
    onAbort();
  }, [onAbort]);

  const onContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      setInputHeight(clampComposerInputHeight(e.nativeEvent.contentSize.height));
    },
    [],
  );

  const handleInputLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextInputWidth = event.nativeEvent.layout.width;
      setInputWidth(nextInputWidth);
      if (draft.length > 0) {
        setInputHeight(estimateComposerInputHeight(draft, nextInputWidth));
      }
    },
    [draft],
  );

  const surface = scheme === 'dark' ? '#1C1C1E' : '#F5F5F7';
  const border = scheme === 'dark' ? '#3A3A3C' : '#E5E5EA';
  const barBg = scheme === 'dark' ? '#000000' : '#FFFFFF';
  const hintMuted = scheme === 'dark' ? '#8E8E93' : '#6D6D70';
  const accent = '#007AFF';
  const waveTrack = scheme === 'dark' ? 'rgba(100,160,255,0.35)' : 'rgba(0,122,255,0.25)';

  const toggleMode = useCallback(() => {
    if (disabled || streaming || hudOpen) return;
    setMode((prev) => (prev === 'text' ? 'voice' : 'text'));
  }, [disabled, streaming, hudOpen]);

  const openAttachmentSheet = useCallback(() => {
    if (disabled) return;
    Keyboard.dismiss();
    att.openSheet();
  }, [att, disabled]);

  const sheetItems = useMemo(
    () => [
      { source: 'camera' as const, icon: 'camera-outline', label: cm.takePhoto },
      { source: 'photos' as const, icon: 'image-outline', label: cm.photos },
      { source: 'document' as const, icon: 'folder-outline', label: cm.localFiles },
    ],
    [cm.takePhoto, cm.photos, cm.localFiles],
  );

  const renderVoiceToggle = () => (
    <Pressable
      style={styles.toolBtn}
      onPress={toggleMode}
      disabled={disabled || streaming}
      accessibilityLabel={mode === 'text' ? 'Switch to voice input' : 'Switch to keyboard'}
    >
      <Icon
        source={mode === 'text' ? 'microphone-outline' : 'keyboard-outline'}
        size={22}
        color={disabled || streaming ? '#8E8E93' : accent}
      />
    </Pressable>
  );

  const renderAttachButton = () => (
    <Pressable
      style={styles.toolBtn}
      onPress={openAttachmentSheet}
      disabled={disabled || att.attachments.length >= att.maxAttachments}
      accessibilityLabel={cm.attachFile}
    >
      <Icon
        source="plus-circle-outline"
        size={24}
        color={disabled ? '#8E8E93' : accent}
      />
    </Pressable>
  );

  const renderAbortButton = () => (
    <Pressable style={styles.sendCircle} onPress={handleAbort} hitSlop={8} accessibilityLabel={cm.stop}>
      <Icon source="stop" size={20} color="#FFFFFF" />
    </Pressable>
  );

  const renderQueueSendButton = () => (
    <Pressable
      style={[styles.sendCircle, { backgroundColor: accent }]}
      onPress={handleSend}
      hitSlop={8}
      accessibilityLabel={cm.send}
    >
      <Icon source="arrow-up" size={20} color="#FFFFFF" />
    </Pressable>
  );

  const renderStreamingRightActions = () => (
    <View style={styles.streamingActions}>
      {renderAttachButton()}
      {canQueueWhileBusy && isExpanded ? renderQueueSendButton() : null}
      {renderAbortButton()}
    </View>
  );

  const composerPlaceholder = runBusy
    ? editingFollowUpId
      ? cm.inputPlaceholderSteeringEdit
      : cm.inputPlaceholderSteering
    : (placeholder ?? cm.inputPlaceholder);

  const renderSendOrStop = () => {
    if (streaming) return renderStreamingRightActions();
    if (!isExpanded) return null;
    return (
      <Pressable
        style={[styles.sendCircle, { backgroundColor: canSendIdle ? '#1C1C1E' : scheme === 'dark' ? '#48484A' : '#C7C7CC' }]}
        onPress={handleSend}
        disabled={!canSendIdle}
        hitSlop={8}
        accessibilityLabel={cm.send}
      >
        <Icon source="arrow-up" size={22} color="#FFFFFF" />
      </Pressable>
    );
  };

  const textInputProps = {
    placeholder: composerPlaceholder,
    placeholderTextColor: '#8E8E93',
    value: draft,
    onChangeText: updateDraft,
    onCursorChange: setCursorPos,
    cursorPos,
    isDark: scheme === 'dark',
    multiline: true as const,
    editable: !disabled,
    onContentSizeChange,
    blurOnSubmit: false,
    returnKeyType: 'default' as const,
    textAlignVertical: (Platform.OS === 'android' ? 'top' : 'center') as 'top' | 'center',
    autoCapitalize: 'sentences' as const,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  };

  return (
    <View style={[styles.wrap, { backgroundColor: barBg, borderTopColor: border }]}>
      {pendingFollowUps.length > 0 ? (
        <ChatPendingFollowUpStack
          items={pendingFollowUps}
          disabled={disabled}
          editingFollowUpId={editingFollowUpId}
          onEditInComposer={(id) => onBeginEditFollowUp?.(id)}
          onRemove={(id) => onPendingFollowUpRemove?.(id)}
          onMove={(id, dir) => onPendingFollowUpMove?.(id, dir)}
          onSteer={(id) => onPendingFollowUpSteer?.(id)}
          steeringBusyId={steeringFollowUpId}
        />
      ) : null}
      {hudOpen || transcribing ? (
        <View style={styles.voiceHud} pointerEvents="none">
          {transcribing ? (
            <Text style={[styles.hudHint, { color: accent }]}>
              {cm.voiceTranscribing}
            </Text>
          ) : (
            <>
              <VoiceMeterBars samples={meterSamples} accentColor={accent} trackColor={waveTrack} />
              <Text style={[styles.hudHint, { color: hudCancel ? '#EF4444' : hintMuted }]}>
                {hudCancel ? cm.voiceCancelZoneHint : cm.voiceReleaseSwipeHint}
              </Text>
              <View style={[styles.hudPill, { backgroundColor: accent }]} />
            </>
          )}
        </View>
      ) : null}

      {palette.open ? (
        <CommandPaletteBar
          items={palette.items}
          query={palette.query}
          loading={palette.loading}
          onSelect={handlePaletteSelect}
        />
      ) : null}

      {att.attachments.length > 0 ? (
        <ComposerAttachmentStrip
          attachments={att.attachments}
          onRemove={att.removeAttachment}
          removeLabel={cm.removeAttachment}
        />
      ) : null}

      <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
        {mode === 'text' ? (
          <>
            <View style={isExpanded ? undefined : styles.compactRow}>
              {!isExpanded ? renderVoiceToggle() : null}
              <View
                style={isExpanded ? styles.expandedInput : styles.compactInputWrap}
                onLayout={handleInputLayout}
              >
                <SlashTokenInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    isExpanded ? styles.inputExpanded : styles.inputCompact,
                    {
                      color: scheme === 'dark' ? '#F5F5F7' : '#1C1C1E',
                      ...(isExpanded
                        ? { minHeight: inputHeight }
                        : { height: MIN_COMPOSER_INPUT_HEIGHT }),
                    },
                  ]}
                  {...textInputProps}
                />
              </View>
              {!isExpanded ? (streaming ? renderStreamingRightActions() : renderAttachButton()) : null}
            </View>
            {isExpanded ? (
              <View style={styles.toolRow}>
                {renderVoiceToggle()}
                <View style={styles.toolSpacer} />
                {streaming ? (
                  renderStreamingRightActions()
                ) : (
                  <>
                    {renderAttachButton()}
                    {renderSendOrStop()}
                  </>
                )}
              </View>
            ) : null}
          </>
        ) : isExpanded ? (
          <>
            <View
              style={[styles.holdPad, styles.holdPadExpanded, hudOpen && { opacity: 0.92 }]}
              {...panResponder.panHandlers}
            >
              <Text style={[styles.holdLabel, { color: scheme === 'dark' ? '#E5E5EA' : '#3A3A3C' }]}>
                {cm.holdToSpeak}
              </Text>
            </View>
            <View style={styles.toolRow}>
              {renderVoiceToggle()}
              <View style={styles.toolSpacer} />
              {streaming ? (
                renderStreamingRightActions()
              ) : (
                <>
                  {renderAttachButton()}
                  {renderSendOrStop()}
                </>
              )}
            </View>
          </>
        ) : (
          <View style={styles.compactRow}>
            {renderVoiceToggle()}
            <View
              style={[styles.holdPad, styles.holdPadCompact, hudOpen && { opacity: 0.92 }]}
              {...panResponder.panHandlers}
            >
              <Text style={[styles.holdLabel, { color: scheme === 'dark' ? '#E5E5EA' : '#3A3A3C' }]}>
                {cm.holdToSpeak}
              </Text>
            </View>
            {streaming ? renderStreamingRightActions() : renderAttachButton()}
          </View>
        )}
      </View>

      <AttachmentSourceSheet
        visible={att.sheetOpen}
        items={sheetItems}
        onClose={att.closeSheet}
        onPick={(source) => void att.addFromSource(source)}
      />

      <Snackbar visible={Boolean(snack)} onDismiss={() => setSnack('')} duration={3200}>
        {snack}
      </Snackbar>
      <Snackbar visible={Boolean(att.snack)} onDismiss={att.dismissSnack} duration={3200}>
        {att.snack}
      </Snackbar>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  voiceHud: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  hudHint: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  hudPill: {
    width: '88%',
    maxWidth: 420,
    height: 12,
    borderRadius: 6,
    opacity: 0.85,
  },
  shell: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  expandedInput: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  compactInputWrap: {
    flex: 1,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    paddingTop: 2,
    gap: 4,
  },
  toolSpacer: {
    flex: 1,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  streamingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: Platform.OS === 'ios' ? 5 : 4,
    maxHeight: MAX_COMPOSER_INPUT_HEIGHT,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as Record<string, string>,
      default: {},
    }),
  },
  inputCompact: {
    flex: 1,
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
  },
  inputExpanded: {
    alignSelf: 'stretch',
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
  },
  holdPad: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  holdPadCompact: {
    flex: 1,
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
    marginVertical: 1,
  },
  holdPadExpanded: {
    minHeight: 44,
    marginHorizontal: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  holdLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
