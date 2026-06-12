import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useTheme } from '../../../theme';
import { VoiceMeterBars } from '../../chat/VoiceMeterBars';
import { formatVoiceDuration, NOTE_VOICE_MAX_MS, type NoteVoiceInputPhase } from './useNoteVoiceInput';

export interface NoteVoiceInputBarProps {
  phase: NoteVoiceInputPhase;
  durationMillis: number;
  meterSamples: number[];
  onStop: () => void;
  stopLabel: string;
  transcribingLabel: string;
}

export const NoteVoiceInputBar = memo(function NoteVoiceInputBar({
  phase,
  durationMillis,
  meterSamples,
  onStop,
  stopLabel,
  transcribingLabel,
}: NoteVoiceInputBarProps) {
  const { colors } = useTheme();
  const accent = colors.accent.primary;
  const trackBg = colors.surface.input;
  const progress = Math.min(1, durationMillis / NOTE_VOICE_MAX_MS);

  if (phase === 'idle') return null;

  const isRecording = phase === 'recording';

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: trackBg,
          borderColor: colors.border.subtle,
        },
      ]}
    >
      <Pressable
        style={[styles.stopBtn, { borderColor: colors.border.default }]}
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel={stopLabel}
        disabled={!isRecording}
      >
        {isRecording ? (
          <View style={styles.stopSquare} />
        ) : (
          <ActivityIndicator size={16} color={accent} />
        )}
      </Pressable>

      <View style={styles.trackWrap}>
        {isRecording ? (
          <View style={styles.meterWrap}>
            <VoiceMeterBars
              samples={meterSamples}
              accentColor={accent}
              trackColor={colors.border.subtle}
            />
          </View>
        ) : (
          <View style={styles.transcribingRow}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={[styles.transcribingText, { color: colors.text.secondary }]}>
              {transcribingLabel}
            </Text>
          </View>
        )}
        {isRecording ? (
          <View
            style={[
              styles.playhead,
              { backgroundColor: accent, left: `${Math.max(4, Math.min(96, progress * 100))}%` },
            ]}
          />
        ) : null}
      </View>

      <Text style={[styles.time, { color: colors.text.secondary }]}>
        {formatVoiceDuration(durationMillis)}
        {' / '}
        {formatVoiceDuration(NOTE_VOICE_MAX_MS)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#FF3B30',
  },
  trackWrap: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  meterWrap: {
    transform: [{ scaleY: 0.72 }],
  },
  playhead: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 2,
    borderRadius: 1,
    marginLeft: -1,
  },
  transcribingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 40,
  },
  transcribingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  time: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 92,
    textAlign: 'right',
  },
});
