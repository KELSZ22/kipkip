import { z } from 'zod';

export const TOP_SOURCES = 5;
/** Below this, a vector is treated as unrelated. The model then only sees the closest notes. */
export const MIN_COSINE = 0.35;

export type Embeddable = {
  type: 'note' | 'promise';
  title: string;
  body: string | null;
  personName: string | null;
  status: string;
  dueAt: number | null;
};

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'my', 'me', 'it', 'is', 'this', 'that',
  'what', 'who', 'when', 'where', 'how', 'did', 'do', 'does', 'about', 'ang', 'ng', 'sa', 'na', 'ko',
  'mo', 'si', 'ni', 'mga', 'ay', 'ba', 'ano', 'yung', 'nung',
]);

const answerSchema = z.object({
  answer: z.string(),
  source_ids: z.array(z.coerce.number().int().positive()),
});

/** The text that gets embedded and shown to the model. Kept short so a note fits in one pass. */
export function recordDocument(record: Embeddable): string {
  const parts = [record.type, record.title.trim()];
  if (record.body?.trim()) parts.push(record.body.trim());
  if (record.personName?.trim()) parts.push(record.personName.trim());
  if (record.status === 'done' || record.status === 'cancelled') parts.push(record.status);
  if (record.dueAt != null) parts.push(new Date(record.dueAt).toISOString().slice(0, 16));
  return parts.join('. ');
}

export function packVector(values: ArrayLike<number>): Uint8Array {
  return new Uint8Array(Float32Array.from(values).buffer);
}

export function unpackVector(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4 !== 0) return new Float32Array();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export function cosine(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const scale = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return scale === 0 ? 0 : dot / scale;
}

export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length > 2 && !STOP.has(token));
}

/** Share of the question's words that appear in a note. Used when no model is on the phone. */
export function keywordScore(question: string, document: string): number {
  const wanted = contentTokens(question);
  if (wanted.length === 0) return 0;
  const have = new Set(contentTokens(document));
  return wanted.filter((token) => have.has(token)).length / wanted.length;
}

export function topMatches<T>(items: { item: T; score: number }[], limit: number, floor: number): T[] {
  return items
    .filter((item) => item.score >= floor)
    .sort((a, b) => b.score - a.score || 0)
    .slice(0, limit)
    .map((item) => item.item);
}

export type ChikaParsed = { answer: string; sourceIds: number[] };

/** Accepts the model's JSON only when every cited id was actually retrieved. */
export function parseChikaOutput(raw: string, allowed: ReadonlySet<number>): ChikaParsed | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const parsed = answerSchema.safeParse(data);
  if (!parsed.success) return null;
  const answer = parsed.data.answer.trim();
  const sourceIds = [...new Set(parsed.data.source_ids.filter((id) => allowed.has(id)))];
  if (answer && sourceIds.length === 0) return null;
  return { answer, sourceIds };
}
