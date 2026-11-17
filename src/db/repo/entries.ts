import type { SqlRunner } from '@/db/types';

export type EntrySource = 'text' | 'voice';

export async function insertEntry(
  db: SqlRunner,
  input: { rawText: string; source: EntrySource; createdAt: number },
): Promise<number> {
  await db.execute('INSERT INTO entries (raw_text, source, created_at) VALUES (?, ?, ?)', [
    input.rawText,
    input.source,
    input.createdAt,
  ]);
  const { rows } = await db.execute('SELECT last_insert_rowid() AS id');
  return Number(rows[0].id);
}
