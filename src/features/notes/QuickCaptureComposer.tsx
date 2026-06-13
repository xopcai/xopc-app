import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icon, Snackbar } from 'react-native-paper';

import { transcribeVoice } from '../../api/agent-client';
import { useMessages } from '../../i18n/messages';
import { typography, useTheme } from '../../theme';
import type { AttachmentPickSource } from '../chat/attachment-file-io';
import { AttachmentSourceSheet } from '../chat/attachment-source-sheet';
import { MIN_COMPOSER_INPUT_HEIGHT } from '../chat/composer-layout';
import {
  VoiceRecordingOverlay,
  type VoiceRecordingZone,
} from '../chat/VoiceRecordingOverlay';
import {
  beginRecording,
  discardRecording,
  finishRecording,
  inferRecordingMimeType,
  meteringToLevel,
  requestMicPermission,
  type ExpoRecording,
} from '../chat/voiceRecording';

const ZONE_CANCEL_DX = -72;
const ZONE_TEXT_DX = 72;
const MIN_VOICE_MS = 380;

function voiceZoneFromGesture(dx: number): VoiceRecordingZone {
  if (dx < ZONE_CANCEL_DX) return 'cancel';
  if (dx > ZONE_TEXT_DX) return 'text';
  return 'center';
}

type InputMode = 'text' | 'voice';

export interface QuickCaptureComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onVoiceCapture: (payload: { uri: string; durationMillis: number; mimeType: string }) => void;
  onAttachmentSource: (source: AttachmentPickSource) => void;
  placeholder: string;
  disabled?: boolean;
  submitting?: boolean;
}

export function QuickCaptureComposer({
  value,
  onChangeText,
  onSubmit,
  onVoiceCapture,
  onAttachmentSource,
  placeholder,
  disabled = false,
  submitting = false,
}: QuickCaptureComposerProps) {
  const { colors, isDark } = useTheme();
  const { chat: cm } = useMessages();
  const [mode, setMode] = useState<InputMode>('text');
  const [hudOpen, setHudOpen] = useState(false);
  const [voiceZone, setVoiceZone] = useState<VoiceRecordingZone>('center');
  const [meterSamples, setMeterSamples] = useState<number[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [snack, setSnack] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const recordingRef = useRef<ExpoRecording | null>(null);
  const readyRef = useRef(false);
  const abortStartRef = useRef(false);
  const cancelZoneRef = useRef(false);
  const releaseZoneRef = useRef<VoiceRecordingZone>('center');
  const grantInFlightRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const accent = colors.accent.primary;
  const surface = colors.surface.input;
  const border = colors.border.default;
  const canSubmit = value.trim().length > 0 && !disabled && !submitting;

  const finalizeRecordingInteraction = useCallback(async () => {
    const rec = recordingRef.current;
    const shouldDiscard = cancelZoneRef.current;
    const releaseZone = releaseZoneRef.current;

    recordingRef.current = null;
    readyRef.current = false;
    abortStartRef.current = false;
    grantInFlightRef.current = false;
    cancelZoneRef.current = false;
    releaseZoneRef.current = 'center';
    setHudOpen(false);
    setVoiceZone('center');
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

      if (releaseZone === 'text') {
        setTranscribing(true);
        try {
          const result = await transcribeVoice(uri, mimeType);
          const text = (result.refined || result.raw).trim();
          if (text) {
            const current = valueRef.current.trim();
            onChangeText(current ? `${current} ${text}` : text);
            setMode('text');
          } else {
            setSnack(cm.voiceNoSpeechDetected);
          }
        } catch {
          setSnack(cm.voiceTranscribeFailed);
        } finally {
          setTranscribing(false);
        }
        return;
      }

      onVoiceCapture({ uri, durationMillis, mimeType });
      setMode('text');
    } catch {
      setSnack(cm.voiceRecordingFailed);
    }
  }, [cm, onChangeText, onVoiceCapture]);

  const startGrantFlow = useCallback(() => {
    if (disabled || submitting || transcribing || grantInFlightRef.current) return;
    abortStartRef.current = false;
    readyRef.current = false;
    recordingRef.current = null;
    cancelZoneRef.current = false;
    releaseZoneRef.current = 'center';
    setVoiceZone('center');
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
  }, [cm, disabled, submitting, transcribing]);

  const canCaptureVoice = mode === 'voice' && !disabled && !submitting && !transcribing;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canCaptureVoice,
        onMoveShouldSetPanResponder: () => canCaptureVoice,
        onPanResponderGrant: () => {
          cancelZoneRef.current = false;
          releaseZoneRef.current = 'center';
          setVoiceZone('center');
          startGrantFlow();
        },
        onPanResponderMove: (_, g) => {
          const zone = voiceZoneFromGesture(g.dx);
          cancelZoneRef.current = zone === 'cancel';
          releaseZoneRef.current = zone;
          setVoiceZone(zone);
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
          releaseZoneRef.current = 'center';
          setVoiceZone('cancel');
          void finalizeRecordingInteraction();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [canCaptureVoice, finalizeRecordingInteraction, startGrantFlow],
  );

  const toggleMode = useCallback(() => {
    if (disabled || submitting || hudOpen || transcribing) return;
    setMode((prev) => (prev === 'text' ? 'voice' : 'text'));
  }, [disabled, submitting, hudOpen, transcribing]);

  const sheetItems = useMemo(
    () => [
      { source: 'camera' as const, icon: 'camera-outline', label: cm.takePhoto },
      { source: 'photos' as const, icon: 'image-outline', label: cm.photos },
      { source: 'document' as const, icon: 'folder-outline', label: cm.localFiles },
    ],
    [cm.localFiles, cm.photos, cm.takePhoto],
  );

  const renderVoiceToggle = () => (
    <Pressable
      style={styles.toolBtn}
      onPress={toggleMode}
      disabled={disabled || submitting}
      accessibilityLabel={mode === 'text' ? 'Switch to voice input' : 'Switch to keyboard'}
    >
      <Icon
        source={mode === 'text' ? 'microphone-outline' : 'keyboard-outline'}
        size={22}
        color={disabled || submitting ? colors.text.tertiary : accent}
      />
    </Pressable>
  );

  const renderAttachButton = () => (
    <Pressable
      style={styles.toolBtn}
      onPress={() => setSheetOpen(true)}
      disabled={disabled || submitting}
      accessibilityLabel={cm.attachFile}
    >
      <Icon
        source="plus-circle-outline"
        size={24}
        color={disabled || submitting ? colors.text.tertiary : accent}
      />
    </Pressable>
  );

  const renderSendButton = () => (
    <Pressable
      style={[styles.sendCircle, { backgroundColor: canSubmit ? colors.text.primary : colors.surface.active }]}
      onPress={onSubmit}
      disabled={!canSubmit}
      hitSlop={8}
      accessibilityLabel={cm.send}
    >
      <Icon source="arrow-up" size={20} color={colors.text.inverse} />
    </Pressable>
  );

  const renderRightAction = () => (canSubmit ? renderSendButton() : renderAttachButton());

  return (
    <>
      <VoiceRecordingOverlay
        visible={hudOpen || transcribing}
        zone={voiceZone}
        transcribing={transcribing}
        meterSamples={meterSamples}
        centerHint={cm.voiceReleaseCenterHint}
        textHint={cm.voiceReleaseTextHint}
        cancelHint={cm.voiceReleaseCancelHint}
        transcribingLabel={cm.voiceTranscribing}
        isDark={isDark}
      />

      <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
        {mode === 'text' ? (
          <View style={styles.compactRow}>
            {renderVoiceToggle()}
            <View style={styles.compactInputWrap}>
              <TextInput
                style={[styles.input, { color: colors.text.primary }]}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                value={value}
                onChangeText={onChangeText}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
                multiline
                blurOnSubmit
                editable={!disabled && !submitting}
                textAlignVertical="center"
              />
            </View>
            {renderRightAction()}
          </View>
        ) : (
          <View style={styles.compactRow}>
            {renderVoiceToggle()}
            <View
              style={[styles.holdPad, hudOpen && { opacity: 0.92 }]}
              {...panResponder.panHandlers}
            >
              <Text style={[styles.holdLabel, { color: colors.text.secondary }]}>
                {cm.holdToSpeak}
              </Text>
            </View>
            {renderAttachButton()}
          </View>
        )}
      </View>

      <AttachmentSourceSheet
        visible={sheetOpen}
        items={sheetItems}
        onClose={() => setSheetOpen(false)}
        onPick={(source) => {
          setSheetOpen(false);
          setMode('text');
          onAttachmentSource(source);
        }}
      />

      <Snackbar visible={Boolean(snack)} onDismiss={() => setSnack('')} duration={3200}>
        {snack}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  compactInputWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
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
  },
  input: {
    ...typography.body,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: Platform.select({ ios: 5, android: 4, default: 4 }),
    maxHeight: 100,
    borderWidth: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : null),
  },
  holdPad: {
    flex: 1,
    minHeight: MIN_COMPOSER_INPUT_HEIGHT,
    marginVertical: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  holdLabel: {
    ...typography.body,
    fontWeight: '600',
  },
});
