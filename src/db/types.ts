import type { Scalar } from '@op-engineering/op-sqlite';

export type SqlRow = Record<string, Scalar>;

export type SqlRunner = {
  execute: (query: string, params?: Scalar[]) => Promise<{ rows: SqlRow[] }>;
};

/** The part of op-sqlite's DB this app relies on, so queries can also run on plain SQLite in tests. */
export type SqlDb = SqlRunner & {
  transaction: (fn: (tx: SqlRunner) => Promise<void>) => Promise<void>;
};
