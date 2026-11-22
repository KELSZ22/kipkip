import { z } from 'zod';

import type { SqlDb } from '@/db/types';
import { ACTION_APPS } from '@/lib/links';

const KEY = 'pending_action';

const pendingSchema = z.object({
  recordId: z.number().int().positive(),
  app: z.enum(ACTION_APPS),
  who: z.string().trim().min(1).max(200),
});

export type PendingAction = z.infer<typeof pendingSchema>;

export async function setPendingAction(db: SqlDb, action: PendingAction): Promise<void> {
  const saved = pendingSchema.parse(action);
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [KEY, JSON.stringify(saved)],
  );
}

export async function getPendingAction(db: SqlDb): Promise<PendingAction | null> {
  const { rows } = await db.execute('SELECT value FROM settings WHERE key = ?', [KEY]);
  const raw = rows[0]?.value;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function clearPendingAction(db: SqlDb): Promise<void> {
  await db.execute('DELETE FROM settings WHERE key = ?', [KEY]);
}
