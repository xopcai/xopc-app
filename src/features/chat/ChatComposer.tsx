/**
 * Chat composer — text / voice modes: left mic⇄keyboard toggle, hold-to-speak, swipe-up cancel, metering HUD.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { VoiceMeterBars } from './VoiceMeterBars';
import {
  beginRecording,
  discardRecording,
  finishRecording,
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
  onAbort,
  placeholder,
  suggestionDraft,
  onConsumeSuggestionDraft,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  placeholder?: string;
  suggestionDraft?: string;
  onConsumeSuggestionDraft?: () => void;
}) {
  const m = useMessages();
  const cm = m.chat;
  const scheme = useColorScheme();

  const [mode, setMode] = useState<InputMode>('text');
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const inputRef = useRef<TextInput>(null);

  const [hudOpen, setHudOpen] = useState(false);
  const [hudCancel, setHudCancel] = useState(false);
  const [meterSamples, setMeterSamples] = useState<number[]>([]);
  const [snack, setSnack] = useState('');

  const recordingRef = useRef<ExpoRecording | null>(null);
  const readyRef = useRef(false);
  const abortStartRef = useRef(false);
  const cancelZoneRef = useRef(false);
  const grantInFlightRef = useRef(false);

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

  const canSend = draft.trim().length > 0 && !streaming && !disabled;

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
      const { durationMillis } = await finishRecording(rec);
      if (durationMillis < MIN_VOICE_MS) {
        setSnack(cm.voiceTooShort);
        return;
      }
      setSnack(cm.voiceCapturedNoStt);
    } catch {
      setSnack(cm.voiceRecordingFailed);
    }
  }, [cm]);

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

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    setInputHeight(MIN_INPUT_HEIGHT);
  }, [draft, onSend]);

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

      <View style={styles.barRow}>
        <View style={[styles.inputShell, { backgroundColor: surface, borderColor: border }]}>
          <Pressable
            style={styles.modeToggle}
            onPress={toggleMode}
            disabled={disabled || streaming}
            accessibilityLabel={mode === 'text' ? 'Switch to voice input' : 'Switch to keyboard'}
          >
            <Icon
              source={mode === 'text' ? 'microphone-outline' : 'keyboard-outline'}
              size={20}
              color={disabled || streaming ? '#8E8E93' : accent}
            />
          </Pressable>

          {mode === 'text' ? (
            <>
              <TextInput
                ref={inputRef}
                style={[
                  styles.input,
                  {
                    height: inputHeight,
                    color: scheme === 'dark' ? '#F5F5F7' : '#1C1C1E',
                  },
                ]}
                placeholder={placeholder ?? 'Message'}
                placeholderTextColor="#8E8E93"
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!disabled}
                onContentSizeChange={onContentSizeChange}
                blurOnSubmit={false}
                returnKeyType="default"
                textAlignVertical={Platform.OS === 'android' ? 'top' : 'center'}
                autoCapitalize="sentences"
              />

              {streaming ? (
                <Pressable style={styles.sendHit} onPress={handleAbort} hitSlop={8}>
                  <Icon source="stop-circle" size={26} color="#EF4444" />
                </Pressable>
              ) : (
                <Pressable style={styles.sendHit} onPress={handleSend} disabled={!canSend} hitSlop={8}>
                  <Icon
                    source="send"
                    size={22}
                    color={canSend ? accent : scheme === 'dark' ? '#48484A' : '#C7C7CC'}
                  />
                </Pressable>
              )}
            </>
          ) : (
            <>
              <View
                style={[styles.holdPad, hudOpen && { opacity: 0.92 }]}
                {...panResponder.panHandlers}
              >
                <Text style={[styles.holdLabel, { color: scheme === 'dark' ? '#E5E5EA' : '#3A3A3C' }]}>
                  {cm.holdToSpeak}
                </Text>
              </View>

              {streaming ? (
                <Pressable style={styles.sendHit} onPress={handleAbort} hitSlop={8}>
                  <Icon source="stop-circle" size={26} color="#EF4444" />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>

      <Snackbar visible={Boolean(snack)} onDismiss={() => setSnack('')} duration={3200}>
        {snack}
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
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 20,
    paddingLeft: 3,
    paddingRight: 3,
    paddingVertical: 2,
    gap: 2,
    minHeight: MIN_INPUT_HEIGHT,
  },
  modeToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 2,
    marginLeft: 2,
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
  holdPad: {
    flex: 1,
    minHeight: MIN_INPUT_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
    marginHorizontal: 4,
    borderRadius: 14,
  },
  holdLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sendHit: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: Platform.OS === 'ios' ? 4 : 3,
  },
});
