/**
 * expo-av microphone recording for hold-to-speak UX (native + web where supported).
 */
import { Audio } from 'expo-av';

export type ExpoRecording = InstanceType<typeof Audio.Recording>;

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function beginRecording(
  onStatus: (metering: number | undefined, durationMillis: number) => void,
): Promise<ExpoRecording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
    (status) => {
      if (status.isRecording) {
        onStatus(status.metering, status.durationMillis ?? 0);
      }
    },
    80,
  );

  return recording;
}

export async function discardRecording(rec: ExpoRecording): Promise<void> {
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    /* already unloaded / too short on Android */
  }
}

export async function finishRecording(rec: ExpoRecording): Promise<{ uri: string | null; durationMillis: number }> {
  const status = await rec.stopAndUnloadAsync();
  const uri = rec.getURI();
  return { uri, durationMillis: status.durationMillis ?? 0 };
}

export function inferRecordingMimeType(uri: string | null): string {
  const lower = uri?.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/mp4';
}

/** Map dB-ish metering to bar fill 0–1 (fallback when metering missing). */
export function meteringToLevel(db: number | undefined): number {
  if (db == null || !Number.isFinite(db)) return 0.22;
  const minDb = -55;
  const maxDb = -5;
  const t = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  return 0.14 + t * 0.86;
}
