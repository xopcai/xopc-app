/**
 * WeChat-style voice overlay: center = send voice, left X = cancel, right 字 = to text.
 */
import { memo, useMemo } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { VoiceMeterBars } from './VoiceMeterBars';

export type VoiceRecordingZone = 'center' | 'cancel' | 'text';

export const VoiceRecordingOverlay = memo(function VoiceRecordingOverlay({
  visible,
  zone,
  transcribing,
  meterSamples,
  centerHint,
  textHint,
  cancelHint,
  transcribingLabel,
  isDark,
}: {
  visible: boolean;
  zone: VoiceRecordingZone;
  transcribing: boolean;
  meterSamples: number[];
  centerHint: string;
  textHint: string;
  cancelHint: string;
  transcribingLabel: string;
  isDark: boolean;
}) {
  const accent = '#007AFF';
  const waveTrack = isDark ? 'rgba(100,160,255,0.35)' : 'rgba(0,122,255,0.25)';
  const bubbleBg = isDark ? '#3D5C3D' : '#C8F0C8';
  const sideIdle = isDark ? 'rgba(60,60,60,0.95)' : 'rgba(30,30,30,0.88)';
  const sideActiveCancel = isDark ? 'rgba(80,40,40,0.98)' : 'rgba(50,50,50,0.95)';
  const sideActiveText = isDark ? 'rgba(40,70,50,0.98)' : 'rgba(50,50,50,0.95)';

  const mainHint = useMemo(() => {
    if (transcribing) return transcribingLabel;
    if (zone === 'cancel') return cancelHint;
    if (zone === 'text') return textHint;
    return centerHint;
  }, [transcribing, zone, centerHint, textHint, cancelHint, transcribingLabel]);

  const mainHintColor = transcribing
    ? accent
    : zone === 'cancel'
      ? '#EF4444'
      : 'rgba(255,255,255,0.92)';

  const showCancelHint = !transcribing && zone === 'cancel';
  const showTextHint = !transcribing && zone === 'text';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="none">
        <View style={styles.content}>
          <View style={styles.bubbleSection}>
            <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
              {transcribing ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <VoiceMeterBars samples={meterSamples} accentColor="#2E9B4B" trackColor={waveTrack} />
              )}
            </View>
            <Text style={[styles.mainHint, { color: mainHintColor }]} numberOfLines={2}>
              {mainHint}
            </Text>
          </View>

          {!transcribing ? (
            <View style={styles.actionBand}>
              <View style={styles.actionSlot}>
                {showCancelHint ? (
                  <Text style={[styles.actionHint, styles.actionHintCancel]}>{cancelHint}</Text>
                ) : (
                  <View style={styles.actionHintPlaceholder} />
                )}
                <View
                  style={[
                    styles.sideBtn,
                    { backgroundColor: zone === 'cancel' ? sideActiveCancel : sideIdle },
                  ]}
                >
                  <Icon source="close" size={26} color="#FFFFFF" />
                </View>
              </View>

              <View style={styles.actionSlot}>
                {showTextHint ? (
                  <Text style={styles.actionHint}>{textHint}</Text>
                ) : (
                  <View style={styles.actionHintPlaceholder} />
                )}
                <View
                  style={[
                    styles.sideBtn,
                    { backgroundColor: zone === 'text' ? sideActiveText : sideIdle },
                  ]}
                >
                  <Text style={styles.zoneChar}>字</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.bottomArc}>
            <View style={[styles.arcInner, { backgroundColor: isDark ? '#3A3A3C' : '#E8E8ED' }]}>
              <Icon source="microphone-outline" size={26} color={isDark ? '#8E8E93' : '#8E8E93'} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bubbleSection: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 18,
    minWidth: 168,
    maxWidth: 280,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  mainHint: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 280,
  },
  actionBand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingBottom: 12,
    minHeight: 96,
  },
  actionSlot: {
    width: 72,
    alignItems: 'center',
    gap: 10,
  },
  actionHint: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    minHeight: 18,
    color: 'rgba(255,255,255,0.9)',
  },
  actionHintCancel: {
    color: '#EF4444',
  },
  actionHintPlaceholder: {
    minHeight: 18,
  },
  sideBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneChar: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomArc: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  arcInner: {
    width: '100%',
    height: 80,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
});
