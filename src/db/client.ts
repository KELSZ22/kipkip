import { isSQLCipher, open, type DB } from '@op-engineering/op-sqlite';

import { getOrCreateDbKey } from '@/db/key';
import { dropLegacyExpenseColumns, getSchemaVersion, migrate, NewerSchemaError } from '@/db/migrations';

const DB_NAME = 'kipkip.db';

export type DbFailure = 'unencrypted' | 'locked' | 'newer' | 'unknown';

export class DbOpenError extends Error {
  constructor(
    readonly failure: DbFailure,
    cause?: unknown,
  ) {
    super(`Could not open database: ${failure}`, { cause });
  }
}

export type DbInfo = { cipherVersion: string; schemaVersion: number };

let connection: { db: DB; info: DbInfo } | null = null;

/** Opens the encrypted database once. It refuses to run unencrypted and never deletes the file on failure. */
export async function openDatabase(): Promise<DB> {
  if (connection) {
    return connection.db;
  }
  if (!isSQLCipher()) {
    throw new DbOpenError('unencrypted');
  }

  const db = open({ name: DB_NAME, encryptionKey: await getOrCreateDbKey() });
  try {
    // The first statement that reads the file is what fails when the key is wrong.
    try {
      await db.execute('SELECT count(*) FROM sqlite_master');
    } catch (error) {
      throw new DbOpenError('locked', error);
    }
    const { rows } = await db.execute('PRAGMA cipher_version');
    const cipherVersion = rows[0]?.cipher_version;
    if (typeof cipherVersion !== 'string' || !cipherVersion) {
      throw new DbOpenError('unencrypted');
    }

    await db.execute('PRAGMA foreign_keys = ON');
    await migrate(db);
    await dropLegacyExpenseColumns(db);

    connection = { db, info: { cipherVersion, schemaVersion: await getSchemaVersion(db) } };
    return db;
  } catch (error) {
    db.close();
    if (error instanceof DbOpenError) {
      throw error;
    }
    throw new DbOpenError(error instanceof NewerSchemaError ? 'newer' : 'unknown', error);
  }
}

export function getDb(): DB {
  if (!connection) {
    throw new Error('Database is not open yet');
  }
  return connection.db;
}

export function getDbInfo(): DbInfo {
  if (!connection) {
    throw new Error('Database is not open yet');
  }
  return connection.info;
}
