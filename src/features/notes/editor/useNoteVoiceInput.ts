import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { transcribeVoice } from '../../../api/agent-client';
import {
  beginRecording,
  discardRecording,
  finishRecording,
  inferRecordingMimeType,
  meteringToLevel,
  requestMicPermission,
  type ExpoRecording,
} from '../../chat/voiceRecording';

const MIN_VOICE_MS = 380;
export const NOTE_VOICE_MAX_MS = 2 * 60 * 60 * 1000;

export type NoteVoiceInputPhase = 'idle' | 'recording' | 'transcribing';

export interface UseNoteVoiceInputOptions {
  onTranscription: (text: string) => void;
  onMessage: (message: string) => void;
  messages: {
    voiceNotSupported: string;
    micRequired: string;
    recordingFailed: string;
    voiceTooShort: string;
    voiceFailed: string;
    noVoiceContent: string;
  };
}

export function formatVoiceDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function useNoteVoiceInput({
  onTranscription,
  onMessage,
  messages,
}: UseNoteVoiceInputOptions) {
  const [phase, setPhase] = useState<NoteVoiceInputPhase>('idle');
  const [durationMillis, setDurationMillis] = useState(0);
  const [meterSamples, setMeterSamples] = useState<number[]>([]);

  const recordingRef = useRef<ExpoRecording | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMaxTimer = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearMaxTimer();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) void discardRecording(rec);
  }, [clearMaxTimer]);

  const finishAndTranscribe = useCallback(async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording || phase !== 'recording') return;

    clearMaxTimer();
    recordingRef.current = null;
    setPhase('transcribing');

    try {
      const { uri, durationMillis: recordedMs } = await finishRecording(currentRecording);
      setDurationMillis(recordedMs);

      if (recordedMs < MIN_VOICE_MS) {
        onMessage(messages.voiceTooShort);
        return;
      }
      if (!uri) {
        onMessage(messages.recordingFailed);
        return;
      }

      const result = await transcribeVoice(uri, inferRecordingMimeType(uri));
      const text = (result.refined || result.raw).trim();
      if (!text) {
        onMessage(messages.noVoiceContent);
        return;
      }
      onTranscription(text);
    } catch {
      onMessage(messages.voiceFailed);
    } finally {
      setPhase('idle');
      setMeterSamples([]);
    }
  }, [clearMaxTimer, messages, onMessage, onTranscription, phase]);

  const startRecording = useCallback(async () => {
    if (phase !== 'idle') return;
    if (Platform.OS === 'web') {
      onMessage(messages.voiceNotSupported);
      return;
    }

    const granted = await requestMicPermission();
    if (!granted) {
      onMessage(messages.micRequired);
      return;
    }

    try {
      setDurationMillis(0);
      setMeterSamples([]);
      const nextRecording = await beginRecording((metering, ms) => {
        setDurationMillis(ms);
        setMeterSamples((prev) => [...prev.slice(-35), meteringToLevel(metering)]);
      });
      recordingRef.current = nextRecording;
      setPhase('recording');

      clearMaxTimer();
      maxTimerRef.current = setTimeout(() => {
        void finishAndTranscribe();
      }, NOTE_VOICE_MAX_MS);
    } catch {
      onMessage(messages.recordingFailed);
    }
  }, [clearMaxTimer, finishAndTranscribe, messages, onMessage, phase]);

  const stopRecording = useCallback(() => {
    void finishAndTranscribe();
  }, [finishAndTranscribe]);

  const cancelRecording = useCallback(async () => {
    clearMaxTimer();
    const currentRecording = recordingRef.current;
    recordingRef.current = null;
    setPhase('idle');
    setDurationMillis(0);
    setMeterSamples([]);
    if (currentRecording) {
      await discardRecording(currentRecording);
    }
  }, [clearMaxTimer]);

  const toggleVoiceInput = useCallback(() => {
    if (phase === 'recording') {
      stopRecording();
      return;
    }
    if (phase === 'idle') {
      void startRecording();
    }
  }, [phase, startRecording, stopRecording]);

  return {
    phase,
    durationMillis,
    meterSamples,
    isActive: phase !== 'idle',
    toggleVoiceInput,
    stopRecording,
    cancelRecording,
  };
}
