import {
  dropLegacyExpenseColumns,
  getSchemaVersion,
  MIGRATIONS,
  migrate,
  NewerSchemaError,
  SCHEMA_VERSION,
} from '@/db/migrations';

import { createTestDb } from './test-db';

describe('migrate', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => db.close());

  const insertEntry = () =>
    db.execute(`INSERT INTO entries (raw_text, source, created_at) VALUES ('hi', 'text', 1)`);
  const insertRecord = (type = 'note') =>
    db.execute(
      `INSERT INTO records (entry_id, type, title, created_at, updated_at) VALUES (1, ?, 't', 1, 1)`,
      [type],
    );

  it('creates every table from the data model', async () => {
    await migrate(db);

    const { rows } = await db.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    expect(rows.map((row) => row.name)).toEqual([
      'embeddings',
      'entries',
      'people',
      'records',
      'settings',
    ]);
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('is safe to run again', async () => {
    await migrate(db);
    await insertEntry();
    await migrate(db);

    const { rows } = await db.execute('SELECT count(*) AS total FROM entries');
    expect(rows[0].total).toBe(1);
  });

  it('applies only the migrations that are new', async () => {
    await migrate(db, [['CREATE TABLE a (id INTEGER)']]);
    await migrate(db, [['CREATE TABLE a (id INTEGER)'], ['CREATE TABLE b (id INTEGER)']]);

    expect(await getSchemaVersion(db)).toBe(2);
  });

  it('rolls back a failed migration completely', async () => {
    await expect(
      migrate(db, [['CREATE TABLE a (id INTEGER)', 'NOT VALID SQL']]),
    ).rejects.toThrow();

    const { rows } = await db.execute(`SELECT name FROM sqlite_master WHERE name = 'a'`);
    expect(rows).toEqual([]);
    expect(await getSchemaVersion(db)).toBe(0);
  });

  it('refuses a database from a newer app version', async () => {
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    await expect(migrate(db)).rejects.toBeInstanceOf(NewerSchemaError);
  });

  it('adds email to a database created before contact linking', async () => {
    await migrate(db, MIGRATIONS.slice(0, 1));
    expect(await getSchemaVersion(db)).toBe(1);

    await migrate(db);

    const columns = await db.execute('PRAGMA table_info(people)');
    expect(columns.rows.map((row) => row.name)).toContain('email');
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('applies the record defaults', async () => {
    await migrate(db);
    await insertEntry();
    await insertRecord();

    const { rows } = await db.execute('SELECT status, is_private FROM records');
    expect(rows[0]).toEqual(expect.objectContaining({ status: 'open', is_private: 0 }));

    const columns = await db.execute('PRAGMA table_info(records)');
    expect(columns.rows.map((row) => row.name)).not.toContain('amount');
  });

  it('rejects an unknown record type', async () => {
    await migrate(db);
    await insertEntry();

    await expect(insertRecord('utang')).rejects.toThrow(/CHECK/);
  });

  it('rejects a record without a real entry', async () => {
    await migrate(db);

    await expect(insertRecord()).rejects.toThrow(/FOREIGN KEY/);
  });

  it('removes records and embeddings along with their entry', async () => {
    await migrate(db);
    await insertEntry();
    await insertRecord();
    await db.execute(`INSERT INTO embeddings (record_id, vector) VALUES (1, x'00')`);

    await db.execute('DELETE FROM entries WHERE id = 1');

    expect((await db.execute('SELECT * FROM records')).rows).toEqual([]);
    expect((await db.execute('SELECT * FROM embeddings')).rows).toEqual([]);
  });

  it('keeps a record when its person is deleted', async () => {
    await migrate(db);
    await insertEntry();
    await db.execute(`INSERT INTO people (display_name, created_at) VALUES ('Angel', 1)`);
    await insertRecord();
    await db.execute('UPDATE records SET person_id = 1');

    await db.execute('DELETE FROM people WHERE id = 1');

    const { rows } = await db.execute('SELECT person_id FROM records');
    expect(rows[0].person_id).toBeNull();
  });

  it('drops expense columns and expense rows from an earlier draft', async () => {
    await db.execute(
      `CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    );
    await db.execute(
      `CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    );
    await db.execute(
      `CREATE TABLE records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        amount INTEGER,
        currency TEXT NOT NULL DEFAULT 'PHP',
        category TEXT,
        due_at INTEGER,
        person_id INTEGER,
        status TEXT NOT NULL DEFAULT 'open',
        is_private INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );
    await db.execute(
      `CREATE TABLE embeddings (
        record_id INTEGER PRIMARY KEY REFERENCES records (id) ON DELETE CASCADE,
        vector BLOB NOT NULL
      )`,
    );
    await db.execute(`PRAGMA user_version = 1`);
    await insertEntry();
    await db.execute(
      `INSERT INTO records (entry_id, type, title, amount, created_at, updated_at)
       VALUES (1, 'note', 'lunch', NULL, 1, 1), (1, 'expense', 'coffee', 8500, 1, 1)`,
    );
    await db.execute(`INSERT INTO embeddings (record_id, vector) VALUES (1, x'01'), (2, x'02')`);

    await dropLegacyExpenseColumns(db);

    const columns = await db.execute('PRAGMA table_info(records)');
    expect(columns.rows.map((row) => row.name)).toEqual([
      'id',
      'entry_id',
      'type',
      'title',
      'body',
      'due_at',
      'person_id',
      'status',
      'is_private',
      'created_at',
      'updated_at',
    ]);
    const records = await db.execute('SELECT id, type, title FROM records');
    expect(records.rows).toEqual([{ id: 1, type: 'note', title: 'lunch' }]);
    const embeddings = await db.execute('SELECT record_id FROM embeddings');
    expect(embeddings.rows).toEqual([{ record_id: 1 }]);
    await expect(insertRecord('expense')).rejects.toThrow(/CHECK/);
  });
});
