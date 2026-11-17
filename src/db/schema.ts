/**
 * Conventions: timestamps are Unix milliseconds, booleans are 0/1.
 * Each entry holds exactly one statement because op-sqlite's execute() only runs the first one.
 * Record types are only notes (Kwento) and promises (Pramis).
 */
export function recordsTable(name = 'records'): string {
  return `CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('note', 'promise')),
    title TEXT NOT NULL,
    body TEXT,
    due_at INTEGER,
    person_id INTEGER REFERENCES people (id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
    is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`;
}

export const RECORD_INDEXES = [
  'CREATE INDEX records_type_created_at ON records (type, created_at)',
  'CREATE INDEX records_entry_id ON records (entry_id)',
  'CREATE INDEX records_person_id ON records (person_id)',
  `CREATE INDEX records_open_due_at ON records (due_at) WHERE status = 'open' AND due_at IS NOT NULL`,
] as const;

export const SCHEMA_V1 = [
  `CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('text', 'voice')),
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    contact_id TEXT,
    phone TEXT,
    preferred_app TEXT CHECK (preferred_app IN ('call', 'whatsapp', 'viber', 'sms')),
    created_at INTEGER NOT NULL
  )`,
  recordsTable(),
  `CREATE TABLE embeddings (
    record_id INTEGER PRIMARY KEY REFERENCES records (id) ON DELETE CASCADE,
    vector BLOB NOT NULL
  )`,
  `CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  ...RECORD_INDEXES,
] as const;
