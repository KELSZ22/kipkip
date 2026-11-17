import { z } from 'zod';

import type { SqlDb } from '@/db/types';
import { TIME_OF_DAY } from '@/lib/time';
import { toneSchema } from '@/lib/tone';

const settingsSchema = z.object({
  companion_name: z.string().trim().min(1).max(30),
  tone: toneSchema,
  checkin_time: z.string().regex(TIME_OF_DAY),
  model_id: z.string().min(1).nullable(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  companion_name: 'Lyn',
  tone: 'taglish',
  checkin_time: '21:00',
  model_id: null,
};

export async function loadSettings(db: SqlDb): Promise<Settings> {
  const { rows } = await db.execute('SELECT key, value FROM settings');
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  // A stored value that no longer validates falls back to its default instead of blocking startup.
  const read = <K extends SettingKey>(key: K): Settings[K] => {
    const parsed = settingsSchema.shape[key].safeParse(stored.get(key));
    return parsed.success ? (parsed.data as Settings[K]) : DEFAULT_SETTINGS[key];
  };
  return {
    companion_name: read('companion_name'),
    tone: read('tone'),
    checkin_time: read('checkin_time'),
    model_id: read('model_id'),
  };
}

/** Validates and stores one setting, returning the value as saved. Throws if it's invalid. */
export async function saveSetting<K extends SettingKey>(
  db: SqlDb,
  key: K,
  value: Settings[K],
): Promise<Settings[K]> {
  const saved = settingsSchema.shape[key].parse(value) as Settings[K];
  if (saved === null) {
    await db.execute('DELETE FROM settings WHERE key = ?', [key]);
  } else {
    await db.execute(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, saved],
    );
  }
  return saved;
}
