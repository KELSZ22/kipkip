import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChecksumError, isUnmeteredNetwork, warmModel } from '@/ai/model';
import { formatBytes, WHISPER_MODEL } from '@/ai/models';
import {
  openSpeechDownload,
  persistSpeechResume,
  speechStatus,
  verifySpeechDownload,
  type SpeechDownload,
  type SpeechStatus,
} from '@/ai/speech';
import { useSettings } from '@/lib/settings-store';

export type VoicePhase = 'idle' | 'downloading' | 'checking' | 'recording' | 'transcribing';
export type VoiceError = 'wifi' | 'checksum' | 'download' | 'permission' | 'empty' | 'failed' | 'needsBuild' | null;

function nativeAudioReady(): boolean {
  return requireOptionalNativeModule('ExpoAudio') != null;
}

export function useVoiceCapture(onSpoken: (transcript: string) => void) {
  const wifiOnly = useSettings((state) => state.values.wifi_only);
  const tone = useSettings((state) => state.values.tone);
  const modelId = useSettings((state) => state.values.model_id);
  const modelIdRef = useRef(modelId);
  const [partial, setPartial] = useState('');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<VoiceError>(null);
  const [progress, setProgress] = useState(0);
  const [model, setModel] = useState<SpeechStatus>(() => {
    try {
      return speechStatus();
    } catch (cause) {
      console.error(cause);
      return 'missing';
    }
  });
  const [armed, setArmed] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const phaseRef = useRef<VoicePhase>('idle');
  const alive = useRef(true);
  const onSpokenRef = useRef(onSpoken);
  const downloadRef = useRef<SpeechDownload | null>(null);

  useEffect(() => {
    onSpokenRef.current = onSpoken;
    modelIdRef.current = modelId;
  }, [modelId, onSpoken]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setVoicePhase = (next: VoicePhase) => {
    phaseRef.current = next;
    if (alive.current) setPhase(next);
  };

  const fail = useCallback((next: Exclude<VoiceError, null>) => {
    setArmed(false);
    setPartial('');
    setError(next);
    setVoicePhase('idle');
  }, []);

  const acceptSpoken = useCallback((transcript: string) => {
    setArmed(false);
    setPartial('');
    setError(null);
    setVoicePhase('idle');
    onSpokenRef.current(transcript);
    warmModel(modelIdRef.current);
  }, []);

  const markTranscribing = useCallback(() => {
    setVoicePhase('transcribing');
  }, []);

  const download = async () => {
    if (wifiOnly === 'yes' && !(await isUnmeteredNetwork())) {
      setError('wifi');
      return;
    }
    setError(null);
    setProgress(0);
    setVoicePhase('downloading');
    try {
      const handle = openSpeechDownload(({ bytesWritten, totalBytes }) => {
        if (alive.current) setProgress(totalBytes > 0 ? bytesWritten / totalBytes : 0);
      });
      downloadRef.current = handle;
      const file = await handle.run();
      if (!alive.current) return;
      if (!file) {
        persistSpeechResume(handle.task);
        setModel('paused');
        setVoicePhase('idle');
        return;
      }
      setVoicePhase('checking');
      await verifySpeechDownload(file);
      if (!alive.current) return;
      setModel('ready');
      setVoicePhase('idle');
    } catch (cause) {
      console.error(cause);
      if (!alive.current) return;
      setModel(speechStatus());
      setVoicePhase('idle');
      setError(cause instanceof ChecksumError ? 'checksum' : 'download');
    } finally {
      downloadRef.current = null;
    }
  };

  const pause = () => {
    const handle = downloadRef.current;
    if (!handle) return;
    void handle.task.pauseAsync().then(() => {
      persistSpeechResume(handle.task);
      if (!alive.current) return;
      setModel('paused');
      setVoicePhase('idle');
    });
  };

  const onPress = () => {
    if (phaseRef.current === 'checking' || phaseRef.current === 'transcribing') return;
    if (phaseRef.current === 'downloading') {
      pause();
      return;
    }
    if (phaseRef.current === 'recording') {
      setStopSignal((current) => current + 1);
      return;
    }
    if (speechStatus() !== 'ready') {
      void download();
      return;
    }
    setModel('ready');
    if (!nativeAudioReady()) {
      setError('needsBuild');
      return;
    }
    setError(null);
    setPartial('');
    setArmed(true);
    setVoicePhase('recording');
  };

  return {
    phase,
    tone,
    partial,
    setPartial,
    error,
    progress,
    model,
    modelSize: formatBytes(WHISPER_MODEL.bytes),
    armed,
    stopSignal,
    onPress,
    fail,
    acceptSpoken,
    markTranscribing,
  };
}
