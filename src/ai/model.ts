import { Directory, DownloadTask, File, Paths, type DownloadPauseState, type DownloadProgress } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';
import { AppState } from 'react-native';

import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM } from '@/ai/prompts';
import { modelById, MODELS, type ModelSpec } from '@/ai/models';

const BACKGROUND_RELEASE_MS = 3 * 60 * 1000;

export class ChecksumError extends Error {
  constructor() {
    super('Model file checksum did not match');
  }
}

export type ModelStatus = 'ready' | 'paused' | 'missing';

export type ModelDownload = {
  task: DownloadTask;
  run: () => Promise<File | null>;
};

let context: LlamaContext | null = null;
let loadedFor: string | null = null;
let loading: Promise<LlamaContext> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function modelsDirectory(): Directory {
  return new Directory(Paths.document, 'models');
}

function ensureModelsDirectory(): Directory {
  const directory = modelsDirectory();
  if (!directory.exists) directory.create();
  return directory;
}

function modelFile(id: string): File {
  return new File(modelsDirectory(), `${id}.gguf`);
}

function resumePath(): File {
  return new File(modelsDirectory(), 'resume.json');
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
  if (!modelsDirectory().exists) return null;
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

export function persistResume(task: DownloadTask): void {
  new File(ensureModelsDirectory(), 'resume.json').writeSync(JSON.stringify(task.savable()));
}

function clearResume(): void {
  if (!modelsDirectory().exists) return;
  const file = resumePath();
  if (file.exists) file.delete();
}

export function isInstalled(model: ModelSpec): boolean {
  if (!modelsDirectory().exists) return false;
  const file = modelFile(model.id);
  if (!file.exists) return false;
  return file.info().size === model.bytes;
}

export function modelStatus(model: ModelSpec): ModelStatus {
  if (isInstalled(model)) return 'ready';
  if (readResume(model.url)) return 'paused';
  return 'missing';
}

export async function isUnmeteredNetwork(): Promise<boolean> {
  try {
    const Network = await import('expo-network');
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET;
  } catch {
    // This binary was built before ExpoNetwork existed, so Wi-Fi cannot be checked yet.
    return true;
  }
}

export function openDownload(model: ModelSpec, onProgress: (progress: DownloadProgress) => void): ModelDownload {
  const saved = readResume(model.url);
  const options = { onProgress };
  if (saved) {
    const task = DownloadTask.fromSavable(saved, options);
    return { task, run: () => task.resumeAsync() };
  }
  const destination = new File(ensureModelsDirectory(), `${model.id}.gguf`);
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(model.url, destination, options);
  return { task, run: () => task.downloadAsync() };
}

export async function verifyDownload(model: ModelSpec, file: File): Promise<void> {
  const digest = (await file.digest('SHA-256')).toLowerCase();
  if (digest !== model.sha256) {
    if (file.exists) file.delete();
    clearResume();
    throw new ChecksumError();
  }
  clearResume();
  for (const other of MODELS) {
    if (other.id === model.id) continue;
    const leftover = modelFile(other.id);
    if (leftover.exists) leftover.delete();
  }
}

async function releaseLoaded(): Promise<void> {
  const current = context;
  context = null;
  loadedFor = null;
  if (current) await current.release();
}

export async function releaseModel(): Promise<void> {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  await releaseLoaded();
}

async function loadModel(modelId: string): Promise<LlamaContext> {
  if (context && loadedFor === modelId) return context;
  if (loading) return loading;
  const pending = (async () => {
    const model = modelById(modelId);
    if (!model || !isInstalled(model)) throw new Error('Model is not on this phone');
    await releaseLoaded();
    const next = await initLlama({
      model: modelFile(model.id).uri,
      n_ctx: 2048,
      n_gpu_layers: 99,
      use_mlock: false,
    });
    context = next;
    loadedFor = modelId;
    return next;
  })();
  loading = pending;
  try {
    return await pending;
  } finally {
    if (loading === pending) loading = null;
  }
}

export async function completeExtraction(modelId: string, user: string): Promise<string> {
  const llama = await loadModel(modelId);
  const result = await llama.completion({
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM },
      { role: 'user', content: user },
    ],
    n_predict: 384,
    temperature: 0.1,
    response_format: {
      type: 'json_schema',
      json_schema: { strict: true, schema: EXTRACTION_SCHEMA },
    },
  });
  await llama.clearCache(false);
  return result.text;
}

/** Unloads the model after the app has stayed in the background for a few minutes. */
export function startModelLifecycle(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = null;
      return;
    }
    if (releaseTimer || !context) return;
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      void releaseLoaded();
    }, BACKGROUND_RELEASE_MS);
  });
  return () => subscription.remove();
}
