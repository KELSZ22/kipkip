import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { SpeechChunker, toWhisperSamples, WHISPER_RATE } from '@/ai/audio';
import { openSpeechSession, type SpeechSession } from '@/ai/speech';
import type { VoiceError } from '@/features/capture/use-voice';
import type { Tone } from '@/lib/tone';

const MAX_RECORD_MS = 2 * 60 * 1000;
const MIN_SECONDS = 0.4;

type RecorderError = Extract<VoiceError, 'permission' | 'empty' | 'failed'>;

/** Records only after the parent has confirmed expo-audio is in this install. */
export function VoiceRecorder({
  tone,
  stopSignal,
  onPartial,
  onSpoken,
  onFailed,
  onTranscribing,
}: {
  tone: Tone;
  stopSignal: number;
  onPartial: (transcript: string) => void;
  onSpoken: (transcript: string) => void;
  onFailed: (error: RecorderError) => void;
  onTranscribing: () => void;
}) {
  const session = useRef<SpeechSession | null>(null);
  const chunker = useRef(new SpeechChunker());
  const recordedSeconds = useRef(0);
  const started = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);
  const toneRef = useRef(tone);
  const onPartialRef = useRef(onPartial);
  const onSpokenRef = useRef(onSpoken);
  const onFailedRef = useRef(onFailed);
  const onTranscribingRef = useRef(onTranscribing);
  const finishRef = useRef<() => void>(() => {});

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!started.current || finishing.current) return;
    const samples = toWhisperSamples(buffer.data, buffer.channels, buffer.sampleRate);
    chunker.current.push(samples);
    recordedSeconds.current += samples.length / WHISPER_RATE;
    const ready = chunker.current.takeReady();
    if (ready) session.current?.add(ready);
  }, []);

  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer });
  const streamRef = useRef(stream);

  useEffect(() => {
    streamRef.current = stream;
    toneRef.current = tone;
    onPartialRef.current = onPartial;
    onSpokenRef.current = onSpoken;
    onFailedRef.current = onFailed;
    onTranscribingRef.current = onTranscribing;
  }, [onFailed, onPartial, onSpoken, onTranscribing, stream, tone]);

  const finish = useCallback(async () => {
    if (finishing.current || !started.current) return;
    finishing.current = true;
    streamRef.current.stop();
    const current = session.current;
    if (!current) return;
    if (recordedSeconds.current < MIN_SECONDS) {
      await current.cancel();
      if (alive.current) onFailedRef.current('empty');
      return;
    }
    onTranscribingRef.current();
    try {
      const rest = chunker.current.takeRest();
      if (rest) current.add(rest);
      const transcript = await current.finish();
      if (!alive.current) return;
      if (!transcript) onFailedRef.current('empty');
      else onSpokenRef.current(transcript);
    } catch (error) {
      console.error(error);
      if (alive.current) onFailedRef.current('failed');
    }
  }, []);

  useEffect(() => {
    finishRef.current = () => {
      void finish();
    };
  }, [finish]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          if (alive.current) onFailedRef.current('permission');
          return;
        }
        if (!alive.current) return;
        const opened = openSpeechSession(toneRef.current);
        opened.onText((text) => {
          if (alive.current) onPartialRef.current(text);
        });
        session.current = opened;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await streamRef.current.start();
        if (!alive.current) {
          streamRef.current.stop();
          return;
        }
        started.current = true;
        timer = setTimeout(() => finishRef.current(), MAX_RECORD_MS);
      } catch (error) {
        console.error(error);
        void session.current?.cancel();
        if (alive.current) onFailedRef.current('failed');
      }
    };
    void start();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      if (!finishing.current) {
        streamRef.current.stop();
        void session.current?.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (stopSignal === 0) return;
    finishRef.current();
  }, [stopSignal]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') finishRef.current();
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => finishRef.current();
    }, []),
  );

  return null;
}
