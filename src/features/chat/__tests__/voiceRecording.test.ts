import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-audio', () => ({
  AudioModule: {
    AudioRecorder: class AudioRecorder {},
  },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      android: {
        outputFormat: 'mpeg4',
        audioEncoder: 'aac',
      },
      ios: {
        outputFormat: 'aac ',
        audioQuality: 127,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
      },
    },
  },
  requestRecordingPermissionsAsync: vi.fn(),
  setAudioModeAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { nativeRecordingOptionsForPlatform } from '../voiceRecording';

describe('nativeRecordingOptionsForPlatform', () => {
  it('flattens iOS recording preset fields for native AudioRecorder', () => {
    const options = nativeRecordingOptionsForPlatform('ios');

    expect(options).toMatchObject({
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      isMeteringEnabled: true,
      outputFormat: 'aac ',
      audioQuality: 127,
      linearPCMBitDepth: 16,
    });
    expect(options).not.toHaveProperty('ios');
    expect(options).not.toHaveProperty('android');
  });

  it('flattens Android recording preset fields for native AudioRecorder', () => {
    const options = nativeRecordingOptionsForPlatform('android');

    expect(options).toMatchObject({
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      isMeteringEnabled: true,
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
    });
    expect(options).not.toHaveProperty('ios');
    expect(options).not.toHaveProperty('android');
  });
});
