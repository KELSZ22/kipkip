import { z } from 'zod';

import { insertEntry, type EntrySource } from '@/db/repo/entries';
import { findOrCreatePerson } from '@/db/repo/people';
import type { SqlDb, SqlRow, SqlRunner } from '@/db/types';
import { isPreferredApp, type PreferredApp } from '@/lib/links';

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
  personPhone: string | null;
  personEmail: string | null;
  preferredApp: PreferredApp | null;
  status: RecordStatus;
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RecordVisibility = 'public' | 'private';

export type RecordFilter = {
  type: RecordType;
  query: string;
  personId: number | null;
  from: number | null;
  to: number | null;
  /** Public lists hide the vault. The vault asks for the private ones. */
  visibility?: RecordVisibility;
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
  /** Omitted on update leaves the current flag alone. On insert, omitted means public. */
  isPrivate: z.boolean().optional(),
});

export type NewRecord = z.input<typeof newRecordSchema>;

const SELECT_RECORD = `SELECT r.id, r.entry_id, r.type, r.title, r.body, r.due_at, r.person_id,
  r.status, r.is_private, r.created_at, r.updated_at, p.display_name AS person_name,
  p.phone AS person_phone, p.email AS person_email, p.preferred_app
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
    personPhone: textOrNull(row.person_phone),
    personEmail: textOrNull(row.person_email),
    preferredApp: typeof row.preferred_app === 'string' && isPreferredApp(row.preferred_app) ? row.preferred_app : null,
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
): Promise<number[]> {
  const rawText = input.rawText.trim();
  const drafts = z.array(newRecordSchema).min(1).parse(input.drafts);
  if (!rawText) throw new Error('Entry text is empty');

  const ids: number[] = [];
  await db.transaction(async (tx) => {
    const entryId = await insertEntry(tx, { rawText, source: input.source, createdAt: input.createdAt });
    for (const draft of drafts) {
      const personId = await resolvePersonId(tx, draft.personId, draft.personName, input.createdAt);
      await tx.execute(
        `INSERT INTO records (
           entry_id, type, title, body, due_at, person_id, status, is_private, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          draft.type,
          draft.title,
          draft.body,
          draft.dueAt,
          personId,
          draft.status,
          draft.isPrivate ? 1 : 0,
          input.createdAt,
          input.createdAt,
        ],
      );
      const inserted = await tx.execute('SELECT last_insert_rowid() AS id');
      ids.push(Number(inserted.rows[0].id));
    }
  });
  return ids;
}

export async function listRecords(db: SqlRunner, filter: RecordFilter): Promise<RecordItem[]> {
  const query = filter.query.trim();
  const like = query ? likeContains(query) : null;
  const when = `CASE WHEN r.type = 'note' THEN r.created_at ELSE COALESCE(r.due_at, r.created_at) END`;
  const visibility = filter.visibility ?? 'public';
  const { rows } = await db.execute(
    `${SELECT_RECORD}
     WHERE r.type = ?
       AND r.is_private = ?
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
      visibility === 'private' ? 1 : 0,
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
  const privacy = draft.isPrivate == null ? null : draft.isPrivate ? 1 : 0;
  await db.execute(
    `UPDATE records
     SET type = ?, title = ?, body = ?, due_at = ?, person_id = ?, status = ?,
         is_private = CASE WHEN ? IS NULL THEN is_private ELSE ? END,
         updated_at = ?
     WHERE id = ?`,
    [draft.type, draft.title, draft.body, draft.dueAt, personId, draft.status, privacy, privacy, updatedAt, id],
  );
  await db.execute('DELETE FROM embeddings WHERE record_id = ?', [id]);
}

/** Hides or shows one record. The embedding is dropped either way so Chika cannot keep a private vector. */
export async function setRecordPrivate(
  db: SqlRunner,
  id: number,
  isPrivate: boolean,
  updatedAt: number,
): Promise<void> {
  await db.execute('UPDATE records SET is_private = ?, updated_at = ? WHERE id = ?', [
    isPrivate ? 1 : 0,
    updatedAt,
    id,
  ]);
  await db.execute('DELETE FROM embeddings WHERE record_id = ?', [id]);
}

export type ExportRow = {
  type: RecordType;
  title: string;
  body: string | null;
  personName: string | null;
  status: RecordStatus;
  dueAt: number | null;
  createdAt: number;
};

/** Rows for one export. Public and private are never mixed in the same call. */
export async function listExportRows(db: SqlRunner, isPrivate: boolean): Promise<ExportRow[]> {
  const { rows } = await db.execute(
    `SELECT r.type, r.title, r.body, r.status, r.due_at, r.created_at, p.display_name AS person_name
     FROM records r
     LEFT JOIN people p ON p.id = r.person_id
     WHERE r.is_private = ?
     ORDER BY r.created_at, r.id`,
    [isPrivate ? 1 : 0],
  );
  return rows.map((row) => ({
    type: row.type === 'promise' ? 'promise' : 'note',
    title: String(row.title),
    body: textOrNull(row.body),
    personName: textOrNull(row.person_name),
    status: row.status === 'done' || row.status === 'cancelled' ? row.status : 'open',
    dueAt: row.due_at == null ? null : Number(row.due_at),
    createdAt: Number(row.created_at),
  }));
}

export type RerunEntry = { id: number; rawText: string; createdAt: number };

/**
 * Entries that can be organized again. If any record on an entry is private, the whole
 * entry is skipped: the raw text cannot be split, and it must not be sent back to the model.
 */
export async function listRerunEntries(db: SqlRunner): Promise<RerunEntry[]> {
  const { rows } = await db.execute(
    `SELECT e.id, e.raw_text, e.created_at
     FROM entries e
     WHERE EXISTS (SELECT 1 FROM records r WHERE r.entry_id = e.id AND r.is_private = 0)
       AND NOT EXISTS (SELECT 1 FROM records r WHERE r.entry_id = e.id AND r.is_private = 1)
     ORDER BY e.id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    rawText: String(row.raw_text),
    createdAt: Number(row.created_at),
  }));
}

export async function deleteRecord(db: SqlRunner, id: number): Promise<void> {
  await db.execute('DELETE FROM records WHERE id = ?', [id]);
}

export async function setRecordStatus(
  db: SqlRunner,
  id: number,
  status: RecordStatus,
  updatedAt: number,
): Promise<void> {
  await db.execute('UPDATE records SET status = ?, updated_at = ? WHERE id = ?', [status, updatedAt, id]);
  await db.execute('DELETE FROM embeddings WHERE record_id = ?', [id]);
}

/** Open, non-private promises due before the end of today, including ones that slipped past. */
export async function listPromisesThrough(db: SqlRunner, untilExclusive: number): Promise<RecordItem[]> {
  const { rows } = await db.execute(
    `${SELECT_RECORD}
     WHERE r.type = 'promise' AND r.status = 'open' AND r.is_private = 0
       AND r.due_at IS NOT NULL AND r.due_at < ?
     ORDER BY r.due_at, r.id`,
    [untilExclusive],
  );
  return rows.map(mapRecord);
}

export type NoteStamp = { id: number; createdAt: number };

/** Non-private notes, reduced to the fields the Today screen needs to pick one. */
export async function listNoteStamps(db: SqlRunner): Promise<NoteStamp[]> {
  const { rows } = await db.execute(
    `SELECT id, created_at FROM records WHERE type = 'note' AND is_private = 0 ORDER BY id`,
  );
  return rows.map((row) => ({ id: Number(row.id), createdAt: Number(row.created_at) }));
}

/** Open, non-private promises that have a due time. These are the ones that get a reminder. */
export async function listDuePromises(db: SqlRunner): Promise<RecordItem[]> {
  const { rows } = await db.execute(
    `${SELECT_RECORD}
     WHERE r.type = 'promise' AND r.status = 'open' AND r.is_private = 0 AND r.due_at IS NOT NULL
     ORDER BY r.due_at, r.id`,
  );
  return rows.map(mapRecord);
}
