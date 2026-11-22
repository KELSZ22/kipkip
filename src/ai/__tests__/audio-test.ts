import { isSilent, SpeechChunker, toPcm16, toWhisperSamples, WHISPER_RATE } from '@/ai/audio';

function tone(seconds: number, level = 0.3): Float32Array {
  const samples = new Float32Array(Math.round(seconds * WHISPER_RATE));
  for (let index = 0; index < samples.length; index += 1) samples[index] = level * Math.sin(index / 5);
  return samples;
}

function quiet(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * WHISPER_RATE));
}

describe('toWhisperSamples', () => {
  it('scales int16 to floats', () => {
    const out = toWhisperSamples(new Int16Array([0, 16384, -32768]).buffer, 1, WHISPER_RATE);
    expect(Array.from(out)).toEqual([0, 0.5, -1]);
  });

  it('mixes stereo down to mono', () => {
    const out = toWhisperSamples(new Int16Array([16384, 0, -16384, -16384]).buffer, 2, WHISPER_RATE);
    expect(Array.from(out)).toEqual([0.25, -0.5]);
  });

  it('resamples 48 kHz to 16 kHz', () => {
    const out = toWhisperSamples(new Int16Array(4800).buffer, 1, 48000);
    expect(out.length).toBe(1600);
  });
});

describe('toPcm16', () => {
  it('turns floats back into clipped 16-bit samples', () => {
    const pcm = new Int16Array(toPcm16(new Float32Array([0, 0.5, -1, 2])));
    expect(Array.from(pcm)).toEqual([0, 16384, -32767, 32767]);
  });
});

describe('isSilent', () => {
  it('tells room noise from speech', () => {
    expect(isSilent(quiet(2))).toBe(true);
    expect(isSilent(tone(0.5))).toBe(false);
  });
});

describe('SpeechChunker', () => {
  it('waits for enough audio before handing a piece back', () => {
    const chunker = new SpeechChunker();
    chunker.push(tone(5));
    expect(chunker.takeReady()).toBeNull();
    expect(chunker.takeRest()?.length).toBe(5 * WHISPER_RATE);
    expect(chunker.takeRest()).toBeNull();
  });

  it('cuts on the first pause after ten seconds and keeps the rest', () => {
    const chunker = new SpeechChunker();
    chunker.push(tone(11));
    chunker.push(quiet(1));
    chunker.push(tone(2));
    const piece = chunker.takeReady();
    expect(piece).not.toBeNull();
    const seconds = (piece?.length ?? 0) / WHISPER_RATE;
    expect(seconds).toBeGreaterThan(11);
    expect(seconds).toBeLessThan(12);
    expect(chunker.seconds).toBeCloseTo(14 - seconds, 3);
  });

  it('forces a cut when someone talks for twenty seconds without a pause', () => {
    const chunker = new SpeechChunker();
    chunker.push(tone(15));
    expect(chunker.takeReady()).toBeNull();
    chunker.push(tone(6));
    const piece = chunker.takeReady();
    expect(piece).not.toBeNull();
    expect((piece?.length ?? 0) / WHISPER_RATE).toBeLessThanOrEqual(20);
  });
});
