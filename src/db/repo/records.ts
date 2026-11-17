import { z } from 'zod';

import { insertEntry, type EntrySource } from '@/db/repo/entries';
import { findOrCreatePerson } from '@/db/repo/people';
import type { SqlDb, SqlRow, SqlRunner } from '@/db/types';

export const RECORD_TYPES = ['note', 'promise'] as const;
export const RECORD_STATUSES = ['open', 'done', 'cancelled'] as const;

export type RecordType = (typeof RECORD_TYPES)[number];
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export type RecordItem = {
  id: number;
  entryId: number;
  type: RecordType;
  title: string;
  body: string | null;
  dueAt: number | null;
  personId: number | null;
  personName: string | null;
  status: RecordStatus;
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RecordFilter = {
  type: RecordType;
  query: string;
  personId: number | null;
  from: number | null;
  to: number | null;
};

const newRecordSchema = z.object({
  type: z.enum(RECORD_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((value) => value || null),
  dueAt: z.number().int().nullable(),
  personId: z.number().int().positive().nullable(),
  personName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .nullable()
    .transform((value) => value || null),
  status: z.enum(RECORD_STATUSES).default('open'),
});

export type NewRecord = z.input<typeof newRecordSchema>;

const SELECT_RECORD = `SELECT r.id, r.entry_id, r.type, r.title, r.body, r.due_at, r.person_id,
  r.status, r.is_private, r.created_at, r.updated_at, p.display_name AS person_name
  FROM records r
  LEFT JOIN people p ON p.id = r.person_id`;

function textOrNull(value: SqlRow[string]): string | null {
  return value == null ? null : String(value);
}

function mapRecord(row: SqlRow): RecordItem {
  return {
    id: Number(row.id),
    entryId: Number(row.entry_id),
    type: row.type === 'promise' ? 'promise' : 'note',
    title: String(row.title),
    body: textOrNull(row.body),
    dueAt: row.due_at == null ? null : Number(row.due_at),
    personId: row.person_id == null ? null : Number(row.person_id),
    personName: textOrNull(row.person_name),
    status: row.status === 'done' || row.status === 'cancelled' ? row.status : 'open',
    isPrivate: Number(row.is_private) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function likeContains(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

async function resolvePersonId(
  db: SqlRunner,
  personId: number | null,
  personName: string | null,
  createdAt: number,
): Promise<number | null> {
  if (personId != null) return personId;
  if (!personName) return null;
  return findOrCreatePerson(db, personName, createdAt);
}

export async function saveCapture(
  db: SqlDb,
  input: { rawText: string; source: EntrySource; createdAt: number; drafts: NewRecord[] },
): Promise<void> {
  const rawText = input.rawText.trim();
  const drafts = z.array(newRecordSchema).min(1).parse(input.drafts);
  if (!rawText) throw new Error('Entry text is empty');

  await db.transaction(async (tx) => {
    const entryId = await insertEntry(tx, { rawText, source: input.source, createdAt: input.createdAt });
    for (const draft of drafts) {
      const personId = await resolvePersonId(tx, draft.personId, draft.personName, input.createdAt);
      await tx.execute(
        `INSERT INTO records (
           entry_id, type, title, body, due_at, person_id, status, is_private, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          entryId,
          draft.type,
          draft.title,
          draft.body,
          draft.dueAt,
          personId,
          draft.status,
          input.createdAt,
          input.createdAt,
        ],
      );
    }
  });
}

export async function listRecords(db: SqlRunner, filter: RecordFilter): Promise<RecordItem[]> {
  const query = filter.query.trim();
  const like = query ? likeContains(query) : null;
  const when = `CASE WHEN r.type = 'note' THEN r.created_at ELSE COALESCE(r.due_at, r.created_at) END`;
  const { rows } = await db.execute(
    `${SELECT_RECORD}
     WHERE r.type = ?
       AND (? IS NULL OR r.title LIKE ? ESCAPE '\\' OR IFNULL(r.body, '') LIKE ? ESCAPE '\\'
            OR IFNULL(p.display_name, '') LIKE ? ESCAPE '\\')
       AND (? IS NULL OR r.person_id = ?)
       AND (? IS NULL OR ${when} >= ?)
       AND (? IS NULL OR ${when} < ?)
     ORDER BY
       CASE WHEN r.type = 'promise' AND r.status = 'open' THEN 0 ELSE 1 END,
       CASE WHEN r.type = 'promise' AND r.status = 'open' THEN COALESCE(r.due_at, r.created_at) ELSE 9223372036854775807 END,
       r.created_at DESC`,
    [
      filter.type,
      like,
      like,
      like,
      like,
      filter.personId,
      filter.personId,
      filter.from,
      filter.from,
      filter.to,
      filter.to,
    ],
  );
  return rows.map(mapRecord);
}

export async function getRecord(db: SqlRunner, id: number): Promise<RecordItem | null> {
  const { rows } = await db.execute(`${SELECT_RECORD} WHERE r.id = ?`, [id]);
  return rows[0] ? mapRecord(rows[0]) : null;
}

export async function updateRecord(
  db: SqlRunner,
  id: number,
  input: NewRecord,
  updatedAt: number,
): Promise<void> {
  const draft = newRecordSchema.parse(input);
  const personId = await resolvePersonId(db, draft.personId, draft.personName, updatedAt);
  await db.execute(
    `UPDATE records
     SET type = ?, title = ?, body = ?, due_at = ?, person_id = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [draft.type, draft.title, draft.body, draft.dueAt, personId, draft.status, updatedAt, id],
  );
}

export async function deleteRecord(db: SqlRunner, id: number): Promise<void> {
  await db.execute('DELETE FROM records WHERE id = ?', [id]);
}
