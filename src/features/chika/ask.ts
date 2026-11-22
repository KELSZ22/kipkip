import { keywordScore, MIN_COSINE, parseChikaOutput, TOP_SOURCES, cosine, packVector, topMatches } from '@/ai/embed';
import { completeChika, embedText, isInstalled } from '@/ai/model';
import { modelById } from '@/ai/models';
import { chikaUser } from '@/ai/prompts';
import { listPublicRecords, listVectors, upsertEmbedding, type PublicRecord } from '@/db/repo/embeddings';
import type { SqlDb } from '@/db/types';

export type ChikaSource = { id: number; title: string };

export type ChikaReply = {
  /** A sentence from the model. Empty when the reply is one of the fixed lines. */
  text: string;
  /** Fixed line, already chosen. The screen translates it. */
  line: 'none' | 'empty' | 'words' | 'unphrased' | 'failed' | null;
  sources: ChikaSource[];
};

function sourcesOf(records: PublicRecord[], ids: number[]): ChikaSource[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return ids.flatMap((id) => {
    const record = byId.get(id);
    return record ? [{ id, title: record.title }] : [];
  });
}

async function ensureVectors(
  db: SqlDb,
  modelId: string,
  records: PublicRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, Float32Array>> {
  const vectors = await listVectors(db, modelId);
  const missing = records.filter((record) => !vectors.has(record.id));
  onProgress?.(0, missing.length);
  for (let index = 0; index < missing.length; index += 1) {
    const record = missing[index];
    const vector = await embedText(modelId, record.document);
    await upsertEmbedding(db, record.id, modelId, packVector(vector));
    vectors.set(record.id, Float32Array.from(vector));
    onProgress?.(index + 1, missing.length);
  }
  return vectors;
}

/**
 * Answers from the closest non-private notes. With no model, matches words and does not write a sentence.
 * The model is asked twice at most; a bad reply never becomes a made-up answer.
 */
export async function askNotes(input: {
  db: SqlDb;
  question: string;
  modelId: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<ChikaReply> {
  const question = input.question.trim();
  const records = await listPublicRecords(input.db);
  if (records.length === 0) return { text: '', line: 'empty', sources: [] };

  const model = modelById(input.modelId);
  if (!model || !isInstalled(model)) {
    const matched = topMatches(
      records.map((record) => ({ item: record, score: keywordScore(question, record.document) })),
      TOP_SOURCES,
      0.01,
    );
    if (matched.length === 0) return { text: '', line: 'none', sources: [] };
    return { text: '', line: 'words', sources: matched.map((record) => ({ id: record.id, title: record.title })) };
  }

  try {
    const vectors = await ensureVectors(input.db, model.id, records, input.onProgress);
    const query = await embedText(model.id, question);
    const matched = topMatches(
      records.flatMap((record) => {
        const vector = vectors.get(record.id);
        return vector ? [{ item: record, score: cosine(query, vector) }] : [];
      }),
      TOP_SOURCES,
      MIN_COSINE,
    );
    if (matched.length === 0) return { text: '', line: 'none', sources: [] };

    const allowed = new Set(matched.map((record) => record.id));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await completeChika(model.id, chikaUser(question, matched));
      const parsed = parseChikaOutput(raw, allowed);
      if (!parsed) continue;
      if (!parsed.answer) return { text: '', line: 'none', sources: [] };
      return { text: parsed.answer, line: null, sources: sourcesOf(matched, parsed.sourceIds) };
    }
    return {
      text: '',
      line: 'unphrased',
      sources: matched.map((record) => ({ id: record.id, title: record.title })),
    };
  } catch (error) {
    console.error(error);
    return { text: '', line: 'failed', sources: [] };
  }
}
