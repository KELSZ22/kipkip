import type { SqlRunner } from '@/db/types';

export type PersonRow = { id: number; displayName: string };

export async function listPeople(db: SqlRunner): Promise<PersonRow[]> {
  const { rows } = await db.execute('SELECT id, display_name FROM people ORDER BY display_name COLLATE NOCASE, id');
  return rows.map((row) => ({ id: Number(row.id), displayName: String(row.display_name) }));
}

export async function listPeopleWithRecords(db: SqlRunner, type: 'note' | 'promise'): Promise<PersonRow[]> {
  const { rows } = await db.execute(
    `SELECT DISTINCT p.id, p.display_name
     FROM people p
     JOIN records r ON r.person_id = p.id
     WHERE r.type = ?
     ORDER BY p.display_name COLLATE NOCASE, p.id`,
    [type],
  );
  return rows.map((row) => ({ id: Number(row.id), displayName: String(row.display_name) }));
}

/** Reuses a person with the same name, ignoring caps. The saved spelling is whatever was stored first. */
export async function findOrCreatePerson(db: SqlRunner, name: string, createdAt: number): Promise<number> {
  const trimmed = name.trim();
  const { rows } = await db.execute(
    'SELECT id FROM people WHERE lower(display_name) = lower(?) ORDER BY id LIMIT 1',
    [trimmed],
  );
  if (rows[0]) return Number(rows[0].id);

  await db.execute('INSERT INTO people (display_name, created_at) VALUES (?, ?)', [trimmed, createdAt]);
  const inserted = await db.execute('SELECT last_insert_rowid() AS id');
  return Number(inserted.rows[0].id);
}
