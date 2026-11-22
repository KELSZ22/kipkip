import { RECORD_INDEXES, recordsTable, SCHEMA_V1 } from '@/db/schema';
import type { SqlDb, SqlRunner } from '@/db/types';

/**
 * Email is stored when a person is linked to a contact, so mailto works without
 * reading the address book again. SCHEMA_V1 already shipped without this column.
 */
const SCHEMA_V2 = ['ALTER TABLE people ADD COLUMN email TEXT'] as const;

/**
 * Which model produced a vector. A row from an older model is ignored and written again,
 * because vectors from different models are not comparable.
 */
const SCHEMA_V3 = ["ALTER TABLE embeddings ADD COLUMN model_id TEXT NOT NULL DEFAULT ''"] as const;

/** Append only: index + 1 is the schema version stored in `PRAGMA user_version`. */
export const MIGRATIONS: readonly (readonly string[])[] = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3];

export const SCHEMA_VERSION = MIGRATIONS.length;

export class NewerSchemaError extends Error {}

export async function getSchemaVersion(db: SqlRunner): Promise<number> {
  const { rows } = await db.execute('PRAGMA user_version');
  return Number(rows[0].user_version);
}

export async function migrate(db: SqlDb, migrations = MIGRATIONS): Promise<void> {
  const current = await getSchemaVersion(db);
  if (current > migrations.length) {
    throw new NewerSchemaError(`Database is at v${current}, app knows v${migrations.length}`);
  }

  for (let version = current + 1; version <= migrations.length; version++) {
    await db.transaction(async (tx) => {
      for (const statement of migrations[version - 1]) {
        await tx.execute(statement);
      }
      await tx.execute(`PRAGMA user_version = ${version}`);
    });
  }
}

/**
 * Earlier drafts stored expenses on `records`. Phase 1 does not.
 * Existing installs are rewritten in place; fresh databases already match and are left alone.
 * Expense rows are removed. Notes and promises are kept.
 */
export async function dropLegacyExpenseColumns(db: SqlDb): Promise<void> {
  const { rows } = await db.execute('PRAGMA table_info(records)');
  const columns = new Set(rows.map((row) => String(row.name)));
  if (!columns.has('amount') && !columns.has('currency') && !columns.has('category')) {
    return;
  }

  // foreign_keys cannot be changed inside a transaction, so this has to happen first.
  await db.execute('PRAGMA foreign_keys = OFF');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(recordsTable('records_next'));
      await tx.execute(
        `INSERT INTO records_next (
           id, entry_id, type, title, body, due_at, person_id, status, is_private, created_at, updated_at
         )
         SELECT id, entry_id, type, title, body, due_at, person_id, status, is_private, created_at, updated_at
         FROM records
         WHERE type IN ('note', 'promise')`,
      );
      await tx.execute('DELETE FROM embeddings WHERE record_id NOT IN (SELECT id FROM records_next)');
      await tx.execute('DROP TABLE records');
      await tx.execute('ALTER TABLE records_next RENAME TO records');
      for (const statement of RECORD_INDEXES) {
        await tx.execute(statement);
      }
    });
  } finally {
    await db.execute('PRAGMA foreign_keys = ON');
  }
}
