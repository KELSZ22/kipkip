import { recordDocument, toBytes, unpackVector, type Embeddable } from '@/ai/embed';
import type { SqlRunner } from '@/db/types';

export type PublicRecord = Embeddable & { id: number; title: string; document: string };

function textOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

export async function listPublicRecords(db: SqlRunner): Promise<PublicRecord[]> {
  const { rows } = await db.execute(
    `SELECT r.id, r.type, r.title, r.body, r.status, r.due_at, p.display_name AS person_name
     FROM records r
     LEFT JOIN people p ON p.id = r.person_id
     WHERE r.is_private = 0
     ORDER BY r.id`,
  );
  return rows.map((row) => {
    const record: Embeddable = {
      type: row.type === 'promise' ? 'promise' : 'note',
      title: String(row.title),
      body: textOrNull(row.body),
      personName: textOrNull(row.person_name),
      status: String(row.status),
      dueAt: row.due_at == null ? null : Number(row.due_at),
    };
    return { ...record, id: Number(row.id), title: record.title, document: recordDocument(record) };
  });
}

export async function listVectors(db: SqlRunner, modelId: string): Promise<Map<number, Float32Array>> {
  const { rows } = await db.execute(
    `SELECT e.record_id, e.vector
     FROM embeddings e
     JOIN records r ON r.id = e.record_id
     WHERE e.model_id = ? AND r.is_private = 0`,
    [modelId],
  );
  const vectors = new Map<number, Float32Array>();
  for (const row of rows) {
    const bytes = toBytes(row.vector);
    if (!bytes) continue;
    const vector = unpackVector(bytes);
    if (vector.length > 0) vectors.set(Number(row.record_id), vector);
  }
  return vectors;
}

export async function upsertEmbedding(
  db: SqlRunner,
  recordId: number,
  modelId: string,
  vector: Uint8Array,
): Promise<void> {
  await db.execute(
    `INSERT INTO embeddings (record_id, vector, model_id) VALUES (?, ?, ?)
     ON CONFLICT (record_id) DO UPDATE SET vector = excluded.vector, model_id = excluded.model_id`,
    [recordId, vector, modelId],
  );
}
