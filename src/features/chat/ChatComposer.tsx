/**
 * Chat composer — Kimi-style compact/expanded input, attachments, text / voice modes.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
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
import { canSendComposerDraft } from './composer-send-helpers';
import type { WireAttachment } from './composer.types';
import { AttachmentSourceSheet } from './attachment-source-sheet';
import { ComposerAttachmentStrip } from './composer-attachment-strip';
import { CommandPaletteBar } from './CommandPaletteBar';
import { SlashTokenInput } from './SlashTokenInput';
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

const MAX_INPUT_HEIGHT = 120;
const MIN_INPUT_HEIGHT = 36;
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
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string, attachments?: WireAttachment[]) => void;
  onSendVoice?: (payload: { uri: string; durationMillis: number; mimeType?: string }) => void | Promise<void>;
  onAbort: () => void;
  placeholder?: string;
  suggestionDraft?: string;
  onConsumeSuggestionDraft?: () => void;
  keyboardVisible?: boolean;
}) {
  const m = useMessages();
  const cm = m.chat;
  const scheme = useColorScheme();

  const [mode, setMode] = useState<InputMode>('text');
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
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

  const recordingRef = useRef<ExpoRecording | null>(null);
  const readyRef = useRef(false);
  const abortStartRef = useRef(false);
  const cancelZoneRef = useRef(false);
  const grantInFlightRef = useRef(false);

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

  useEffect(() => {
    if (suggestionDraft == null || suggestionDraft === '') return;
    setDraft(suggestionDraft);
    setMode('text');
    onConsumeSuggestionDraft?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [suggestionDraft, onConsumeSuggestionDraft]);

  const canSend = canSendComposerDraft(draft, att.attachments.length) && !streaming && !disabled;

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
      if (!onSendVoice) {
        setSnack(cm.voiceCapturedNoStt);
        return;
      }
      await onSendVoice({ uri, durationMillis, mimeType: inferRecordingMimeType(uri) });
    } catch {
      setSnack(cm.voiceRecordingFailed);
    }
  }, [cm, onSendVoice]);

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
      const newDraft = palette.applyItem(item);
      setDraft(newDraft);
      setCursorPos(newDraft.length);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [palette],
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const wire = att.toWirePayload();
    onSend(draft.trim(), wire.length ? wire : undefined);
    setDraft('');
    setCursorPos(0);
    setInputHeight(MIN_INPUT_HEIGHT);
    att.clearAttachments();
    inputRef.current?.blur();
  }, [att, canSend, draft, onSend]);

  const handleAbort = useCallback(() => {
    onAbort();
  }, [onAbort]);

  const onContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      const h = Math.min(Math.max(e.nativeEvent.contentSize.height, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
      setInputHeight(h);
    },
    [],
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
    if (disabled || streaming) return;
    Keyboard.dismiss();
    att.openSheet();
  }, [att, disabled, streaming]);

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
      disabled={disabled || streaming || att.attachments.length >= att.maxAttachments}
      accessibilityLabel={cm.attachFile}
    >
      <Icon
        source="plus-circle-outline"
        size={24}
        color={disabled || streaming ? '#8E8E93' : accent}
      />
    </Pressable>
  );

  const renderSendOrStop = () => {
    if (streaming) {
      return (
        <Pressable style={styles.sendCircle} onPress={handleAbort} hitSlop={8} accessibilityLabel={cm.stop}>
          <Icon source="stop" size={20} color="#FFFFFF" />
        </Pressable>
      );
    }
    if (!isExpanded) return null;
    return (
      <Pressable
        style={[styles.sendCircle, { backgroundColor: canSend ? '#1C1C1E' : scheme === 'dark' ? '#48484A' : '#C7C7CC' }]}
        onPress={handleSend}
        disabled={!canSend}
        hitSlop={8}
        accessibilityLabel={cm.send}
      >
        <Icon source="arrow-up" size={22} color="#FFFFFF" />
      </Pressable>
    );
  };

  const textInputProps = {
    placeholder: placeholder ?? 'Message',
    placeholderTextColor: '#8E8E93',
    value: draft,
    onChangeText: (text: string) => {
      setDraft(text);
      setCursorPos(text.length);
    },
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
      {hudOpen ? (
        <View style={styles.voiceHud} pointerEvents="none">
          <VoiceMeterBars samples={meterSamples} accentColor={accent} trackColor={waveTrack} />
          <Text style={[styles.hudHint, { color: hudCancel ? '#EF4444' : hintMuted }]}>
            {hudCancel ? cm.voiceCancelZoneHint : cm.voiceReleaseSwipeHint}
          </Text>
          <View style={[styles.hudPill, { backgroundColor: accent }]} />
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
          isExpanded ? (
            <>
              <View style={styles.expandedInput}>
                <SlashTokenInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    styles.inputExpanded,
                    { color: scheme === 'dark' ? '#F5F5F7' : '#1C1C1E', height: inputHeight },
                  ]}
                  {...textInputProps}
                />
              </View>
              <View style={styles.toolRow}>
                {renderVoiceToggle()}
                <View style={styles.toolSpacer} />
                {renderAttachButton()}
                {renderSendOrStop()}
              </View>
            </>
          ) : (
            <View style={styles.compactRow}>
              {renderVoiceToggle()}
              <SlashTokenInput
                ref={inputRef}
                style={[
                  styles.input,
                  styles.inputCompact,
                  { color: scheme === 'dark' ? '#F5F5F7' : '#1C1C1E', height: MIN_INPUT_HEIGHT },
                ]}
                {...textInputProps}
              />
              {renderAttachButton()}
            </View>
          )
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
              {renderAttachButton()}
              {streaming ? renderSendOrStop() : null}
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
            {renderAttachButton()}
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
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: Platform.OS === 'ios' ? 5 : 4,
    maxHeight: MAX_INPUT_HEIGHT,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as Record<string, string>,
      default: {},
    }),
  },
  inputCompact: {
    minHeight: MIN_INPUT_HEIGHT,
  },
  inputExpanded: {
    minHeight: MIN_INPUT_HEIGHT,
  },
  holdPad: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  holdPadCompact: {
    flex: 1,
    minHeight: MIN_INPUT_HEIGHT,
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
