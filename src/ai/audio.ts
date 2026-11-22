export const WHISPER_RATE = 16000;

const MIN_CHUNK_SECONDS = 10;
const MAX_CHUNK_SECONDS = 20;
const PAUSE_WINDOW_SECONDS = 0.25;
const SILENCE_RMS = 0.008;

/** Converts a little-endian int16 microphone buffer to 16 kHz mono float samples. */
export function toWhisperSamples(data: ArrayBuffer, channels: number, sampleRate: number): Float32Array {
  const pcm = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
  const width = Math.max(1, channels);
  const frames = Math.floor(pcm.length / width);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < width; channel += 1) sum += pcm[frame * width + channel];
    mono[frame] = sum / width / 32768;
  }
  if (sampleRate === WHISPER_RATE || frames === 0) return mono;

  const size = Math.max(1, Math.round((frames * WHISPER_RATE) / sampleRate));
  const out = new Float32Array(size);
  const step = frames / size;
  for (let index = 0; index < size; index += 1) {
    const position = index * step;
    const left = Math.floor(position);
    const right = Math.min(left + 1, frames - 1);
    out[index] = mono[left] + (mono[right] - mono[left]) * (position - left);
  }
  return out;
}

/** whisper.rn's transcribeData reads 16-bit PCM, whatever its JS docs say. */
export function toPcm16(samples: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = Math.round(value * 32767);
  }
  return pcm.buffer;
}

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += samples[index] * samples[index];
  return end > start ? Math.sqrt(sum / (end - start)) : 0;
}

/** True when a piece of audio has nothing louder than room noise, so Whisper would only invent words. */
export function isSilent(samples: Float32Array): boolean {
  const window = Math.round(PAUSE_WINDOW_SECONDS * WHISPER_RATE);
  for (let start = 0; start < samples.length; start += window) {
    if (rms(samples, start, Math.min(samples.length, start + window)) >= SILENCE_RMS) return false;
  }
  return true;
}

/**
 * Collects microphone audio and hands back pieces that end on a pause,
 * so most of a long recording is transcribed while the user is still talking.
 */
export class SpeechChunker {
  private parts: Float32Array[] = [];
  private length = 0;

  push(samples: Float32Array): void {
    if (samples.length === 0) return;
    this.parts.push(samples);
    this.length += samples.length;
  }

  get seconds(): number {
    return this.length / WHISPER_RATE;
  }

  /** Returns a finished piece once enough speech has built up and a pause is found. */
  takeReady(): Float32Array | null {
    if (this.length < MIN_CHUNK_SECONDS * WHISPER_RATE) return null;
    const all = this.flatten();
    const cut = this.findPause(all);
    if (cut === null) return null;
    this.parts = [all.subarray(cut)];
    this.length = all.length - cut;
    return all.slice(0, cut);
  }

  /** Returns everything left, for when recording stops. */
  takeRest(): Float32Array | null {
    if (this.length === 0) return null;
    const all = this.flatten();
    this.parts = [];
    this.length = 0;
    return all;
  }

  private flatten(): Float32Array {
    if (this.parts.length === 1) return this.parts[0];
    const all = new Float32Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      all.set(part, offset);
      offset += part.length;
    }
    this.parts = [all];
    return all;
  }

  private findPause(all: Float32Array): number | null {
    const window = Math.round(PAUSE_WINDOW_SECONDS * WHISPER_RATE);
    const from = MIN_CHUNK_SECONDS * WHISPER_RATE;
    const forced = MAX_CHUNK_SECONDS * WHISPER_RATE;
    let best: number | null = null;
    let quietest = Number.POSITIVE_INFINITY;
    for (let start = from - window; start + window <= Math.min(all.length, forced); start += window / 2) {
      const level = rms(all, start, start + window);
      if (level < SILENCE_RMS) return start + Math.floor(window / 2);
      if (level < quietest) {
        quietest = level;
        best = start + Math.floor(window / 2);
      }
    }
    return all.length >= forced ? best : null;
  }
}
