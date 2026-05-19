import { Audio } from 'expo-av';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useGatewayStore } from '../../stores/gateway-store';
import type { AudioContent } from './messages.types';
import { audioNameFromPath, buildGatewayAudioUrl } from './audio-url';

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const AudioMessageBlock = memo(function AudioMessageBlock({
  audio,
  sessionKey,
}: {
  audio: AudioContent;
  sessionKey?: string | null;
}) {
  const isDark = useColorScheme() === 'dark';
  const m = useMessages();
  const token = useGatewayStore((s) => s.token);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState((audio.durationSeconds ?? 0) * 1000);
  const [error, setError] = useState<string | null>(null);

  const uri = useMemo(() => {
    if (audio.uri?.trim()) return audio.uri.trim();
    if (!audio.workspaceRelativePath?.trim()) return '';
    return buildGatewayAudioUrl(audio.workspaceRelativePath, sessionKey);
  }, [audio.uri, audio.workspaceRelativePath, sessionKey]);

  const title = audio.name?.trim() || audioNameFromPath(audio.workspaceRelativePath, 'voice.mp3');

  const unload = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (!sound) return;
    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload races when the component unmounts or source changes.
    }
  }, []);

  useEffect(() => {
    return () => {
      void unload();
    };
  }, [unload]);

  useEffect(() => {
    void unload();
    setPlaying(false);
    setPositionMillis(0);
    setDurationMillis((audio.durationSeconds ?? 0) * 1000);
    setError(null);
  }, [audio.durationSeconds, unload, uri]);

  const ensureSound = useCallback(async () => {
    if (soundRef.current) return soundRef.current;
    if (!uri) throw new Error(m.chat.audioMissingSource);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      {
        uri,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
      { shouldPlay: false },
      (status) => {
        if (!status.isLoaded) {
          setPlaying(false);
          return;
        }
        setPlaying(status.isPlaying);
        setPositionMillis(status.positionMillis ?? 0);
        setDurationMillis(status.durationMillis ?? durationMillis);
        if (status.didJustFinish) {
          setPlaying(false);
          void soundRef.current?.setPositionAsync(0).catch(() => {});
        }
      },
    );
    soundRef.current = sound;
    return sound;
  }, [durationMillis, m.chat.audioMissingSource, token, uri]);

  const toggle = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const sound = await ensureSound();
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch {
      setError(m.chat.audioPlaybackFailed);
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [ensureSound, loading, m.chat.audioPlaybackFailed]);

  const progress = durationMillis > 0 ? Math.min(1, Math.max(0, positionMillis / durationMillis)) : 0;
  const border = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';
  const bg = isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB';
  const text = isDark ? '#E5E7EB' : '#374151';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const accent = '#007AFF';

  return (
    <View style={[styles.card, { borderColor: border, backgroundColor: bg }]}>
      <Pressable
        style={[styles.playButton, { backgroundColor: accent }]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? m.chat.audioPause : m.chat.audioPlay}
      >
        <Icon source={loading ? 'loading' : playing ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={styles.body}>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{title}</Text>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? '#3A3A3C' : '#E5E7EB' }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
        </View>
        <Text style={[styles.meta, { color: error ? '#EF4444' : muted }]} numberOfLines={1}>
          {error ?? `${formatDuration(positionMillis)} / ${formatDuration(durationMillis)}`}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  meta: {
    fontSize: 11,
  },
});
