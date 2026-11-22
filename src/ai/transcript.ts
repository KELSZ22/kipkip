const TIMESTAMP = /\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3} --> [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g;
const NOISE = /\[(?:BLANK_AUDIO|MUSIC|SILENCE|NOISE|INAUDIBLE)\]|\((?:blank audio|music|silence)\)/gi;

/** Whisper sometimes returns timestamps, noise tags, or a line of music symbols. */
export function cleanTranscript(raw: string): string {
  const text = raw
    .replace(TIMESTAMP, ' ')
    .replace(NOISE, ' ')
    .replace(/[♪♫]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[0-9A-Za-z\u00C0-\u024F]/.test(text)) return '';
  return text;
}

/** Adds a transcript after anything already typed, or returns the typed text when speech was empty. */
export function mergeTranscript(current: string, spoken: string): string {
  const next = cleanTranscript(spoken);
  if (!next) return current;
  const base = current.trim();
  return base ? `${base} ${next}` : next;
}
