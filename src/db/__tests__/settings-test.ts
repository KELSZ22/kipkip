import { migrate } from '@/db/migrations';
import { DEFAULT_SETTINGS, loadSettings, saveSetting } from '@/db/repo/settings';

import { createTestDb } from './test-db';

describe('settings repo', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('uses the defaults on a new database', async () => {
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.companion_name).toBe('Lyn');
    expect(DEFAULT_SETTINGS.checkin_time).toBe('21:00');
    expect(DEFAULT_SETTINGS.checkin_enabled).toBe('yes');
  });

  it('saves and overwrites values', async () => {
    await saveSetting(db, 'tone', 'filipino');
    await saveSetting(db, 'tone', 'english');
    await saveSetting(db, 'checkin_time', '07:30');

    expect(await loadSettings(db)).toEqual({
      ...DEFAULT_SETTINGS,
      tone: 'english',
      checkin_time: '07:30',
    });
  });

  it('trims the companion name', async () => {
    expect(await saveSetting(db, 'companion_name', '  Ate Bing ')).toBe('Ate Bing');
    expect((await loadSettings(db)).companion_name).toBe('Ate Bing');
  });

  it('clears a nullable setting', async () => {
    await saveSetting(db, 'model_id', 'tiny-q4');
    expect((await loadSettings(db)).model_id).toBe('tiny-q4');

    await saveSetting(db, 'model_id', null);
    expect((await loadSettings(db)).model_id).toBeNull();
  });

  it('rejects invalid values without storing them', async () => {
    await expect(saveSetting(db, 'companion_name', '   ')).rejects.toThrow();
    await expect(saveSetting(db, 'checkin_time', '25:00')).rejects.toThrow();

    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the default for a corrupted stored value', async () => {
    await db.execute(`INSERT INTO settings (key, value) VALUES ('tone', 'klingon')`);

    expect((await loadSettings(db)).tone).toBe(DEFAULT_SETTINGS.tone);
  });
});
