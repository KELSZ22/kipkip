import { Directory, DownloadTask, File, Paths, type DownloadPauseState, type DownloadProgress } from 'expo-file-system';

import { ChecksumError, releaseModel } from '@/ai/model';
import { WHISPER_MODEL, type SpeechModel } from '@/ai/models';
import { isSilent, toPcm16 } from '@/ai/audio';
import { cleanTranscript } from '@/ai/transcript';
import type { Tone } from '@/lib/tone';

const PROMPT = 'Taglish, Filipino, and English. Kumusta, pramis, bukas, mamaya, ngayong gabi.';

export type SpeechStatus = 'ready' | 'paused' | 'missing';

export type SpeechDownload = {
  task: DownloadTask;
  run: () => Promise<File | null>;
};

function speechDirectory(): Directory {
  return new Directory(Paths.document, 'speech');
}

function ensureSpeechDirectory(): Directory {
  const directory = speechDirectory();
  if (!directory.exists) directory.create();
  return directory;
}

function speechFile(): File {
  return new File(speechDirectory(), `${WHISPER_MODEL.id}.bin`);
}

function resumePath(): File {
  return new File(speechDirectory(), 'resume.json');
}

function isPauseState(value: unknown, url: string): value is DownloadPauseState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    state.url === url &&
    state.isDirectory === false &&
    typeof state.fileUri === 'string' &&
    (state.resumeData === undefined || typeof state.resumeData === 'string')
  );
}

function readResume(url: string): DownloadPauseState | null {
  if (!speechDirectory().exists) return null;
  const file = resumePath();
  if (!file.exists) return null;
  try {
    const parsed: unknown = JSON.parse(file.textSync());
    if (isPauseState(parsed, url)) return parsed;
  } catch {
    // A torn resume file is ignored and the download starts over.
  }
  return null;
}

export function persistSpeechResume(task: DownloadTask): void {
  new File(ensureSpeechDirectory(), 'resume.json').writeSync(JSON.stringify(task.savable()));
}

function clearResume(): void {
  if (!speechDirectory().exists) return;
  const file = resumePath();
  if (file.exists) file.delete();
}

export function isSpeechInstalled(model: SpeechModel = WHISPER_MODEL): boolean {
  if (!speechDirectory().exists) return false;
  const file = speechFile();
  if (!file.exists) return false;
  return file.info().size === model.bytes;
}

export function speechStatus(model: SpeechModel = WHISPER_MODEL): SpeechStatus {
  if (isSpeechInstalled(model)) return 'ready';
  if (readResume(model.url)) return 'paused';
  return 'missing';
}

export function openSpeechDownload(
  onProgress: (progress: DownloadProgress) => void,
  model: SpeechModel = WHISPER_MODEL,
): SpeechDownload {
  const saved = readResume(model.url);
  const options = { onProgress };
  if (saved) {
    const task = DownloadTask.fromSavable(saved, options);
    return { task, run: () => task.resumeAsync() };
  }
  const destination = new File(ensureSpeechDirectory(), `${model.id}.bin`);
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(model.url, destination, options);
  return { task, run: () => task.downloadAsync() };
}

export async function verifySpeechDownload(file: File, model: SpeechModel = WHISPER_MODEL): Promise<void> {
  const digest = (await file.digest('SHA-256')).toLowerCase();
  if (digest !== model.sha256) {
    if (file.exists) file.delete();
    clearResume();
    throw new ChecksumError();
  }
  clearResume();
}

const LANGUAGE: Record<Tone, string> = { english: 'en', filipino: 'tl', taglish: 'auto' };

export type SpeechSession = {
  /** Queues a piece of 16 kHz mono audio; pieces are transcribed one at a time, in order. */
  add: (samples: Float32Array) => void;
  /** Waits for every queued piece and returns the whole transcript. */
  finish: () => Promise<string>;
  /** Stops any running piece and unloads Whisper. */
  cancel: () => Promise<void>;
  onText: (listener: (text: string) => void) => void;
};

/**
 * Loads Whisper as soon as the mic opens, so the model load happens while the user talks.
 * The language model is unloaded first so both never sit in RAM together.
 */
export function openSpeechSession(tone: Tone): SpeechSession {
  const loading = (async () => {
    if (!isSpeechInstalled()) throw new Error('Speech model is not on this phone');
    await releaseModel();
    const { initWhisper } = await import('whisper.rn');
    return initWhisper({ filePath: speechFile().uri, useGpu: true, useCoreMLIos: false });
  })();
  loading.catch(() => {});
  let queue: Promise<void> = Promise.resolve();
  let text = '';
  let failure: unknown = null;
  let stopCurrent: (() => Promise<void>) | null = null;
  let cancelled = false;
  let listener: ((text: string) => void) | null = null;

  const run = async (samples: Float32Array) => {
    if (cancelled || failure || isSilent(samples)) return;
    const context = await loading;
    if (cancelled) return;
    const { promise, stop } = context.transcribeData(toPcm16(samples), {
      language: LANGUAGE[tone],
      temperature: 0,
      temperatureInc: 0,
      beamSize: 1,
      bestOf: 1,
      maxThreads: 4,
      prompt: text ? `${PROMPT} ${text}`.slice(-400) : PROMPT,
    });
    stopCurrent = stop;
    const { result, isAborted } = await promise;
    stopCurrent = null;
    if (isAborted || cancelled) return;
    const piece = cleanTranscript(result);
    if (!piece) return;
    text = text ? `${text} ${piece}` : piece;
    listener?.(text);
  };

  const release = async () => {
    try {
      const context = await loading;
      await context.release();
    } catch (error) {
      if (!failure) failure = error;
    }
  };

  return {
    add: (samples) => {
      queue = queue.then(() => run(samples)).catch((error: unknown) => {
        failure = error;
      });
    },
    finish: async () => {
      await queue;
      await release();
      if (failure) throw failure;
      return text;
    },
    cancel: async () => {
      cancelled = true;
      await stopCurrent?.();
      await queue;
      await release();
    },
    onText: (next) => {
      listener = next;
    },
  };
}
