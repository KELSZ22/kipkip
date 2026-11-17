import type { Scalar } from '@op-engineering/op-sqlite';

import type { SqlDb, SqlRow } from '@/db/types';

type NodeDatabase = {
  exec: (sql: string) => void;
  close: () => void;
  prepare: (sql: string) => { all: (...params: Scalar[]) => SqlRow[] };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- no Node typings in this RN project
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDatabase };

/** Real in-memory SQLite behind the same interface as op-sqlite, so the actual SQL gets exercised. */
export function createTestDb(): SqlDb & { close: () => void } {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');

  const execute: SqlDb['execute'] = async (query, params = []) => ({
    rows: database.prepare(query).all(...params),
  });

  return {
    execute,
    close: () => database.close(),
    transaction: async (fn) => {
      database.exec('BEGIN');
      try {
        await fn({ execute });
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
