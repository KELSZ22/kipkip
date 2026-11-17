import { migrate } from '@/db/migrations';
import { findOrCreatePerson } from '@/db/repo/people';
import { deleteRecord, getRecord, listRecords, saveCapture, updateRecord } from '@/db/repo/records';
import { dateRangeBounds } from '@/lib/time';

import { createTestDb } from './test-db';

const NOW = new Date(2026, 2, 11, 15, 0, 0).getTime();
const MARCH_FIRST = new Date(2026, 2, 1, 9, 0, 0).getTime();
const TONIGHT = new Date(2026, 2, 11, 20, 0, 0).getTime();
const TOMORROW = new Date(2026, 2, 12, 9, 0, 0).getTime();

describe('records repo', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('saves an entry, reuses people, and lists notes and promises apart', async () => {
    await saveCapture(db, {
      rawText: 'Lunch with Mark. Call Angel tonight.',
      source: 'text',
      createdAt: NOW,
      drafts: [
        { type: 'note', title: 'Lunch with Mark', body: null, dueAt: MARCH_FIRST, personId: null, personName: 'Mark' },
        {
          type: 'promise',
          title: 'Call Angel',
          body: 'Call Angel tonight.',
          dueAt: TONIGHT,
          personId: null,
          personName: 'Angel',
        },
      ],
    });
    await saveCapture(db, {
      rawText: '100% done',
      source: 'text',
      createdAt: NOW + 1,
      drafts: [{ type: 'note', title: '100% done', body: null, dueAt: null, personId: null, personName: 'mark' }],
    });

    const notes = await listRecords(db, { type: 'note', query: '', personId: null, from: null, to: null });
    const promises = await listRecords(db, { type: 'promise', query: '', personId: null, from: null, to: null });

    expect(notes.map((record) => record.title)).toEqual(['100% done', 'Lunch with Mark']);
    expect(
      (await listRecords(db, { type: 'note', query: '%', personId: null, from: null, to: null })).map(
        (record) => record.title,
      ),
    ).toEqual(['100% done']);
    expect(promises.map((record) => record.title)).toEqual(['Call Angel']);
    expect(new Set(notes.map((record) => record.personId)).size).toBe(1);
    expect(notes[1]?.personName).toBe('Mark');
    expect(await findOrCreatePerson(db, 'ANGEL', NOW)).toBe(promises[0]?.personId);
  });

  it('searches, filters by person and date, then updates and deletes', async () => {
    await saveCapture(db, {
      rawText: 'Promises',
      source: 'text',
      createdAt: NOW,
      drafts: [
        { type: 'promise', title: 'Call Angel', body: null, dueAt: TONIGHT, personId: null, personName: 'Angel' },
        { type: 'promise', title: 'Send the file', body: null, dueAt: TOMORROW, personId: null, personName: 'Mark' },
      ],
    });
    await saveCapture(db, {
      rawText: 'A note whose date is in the past',
      source: 'text',
      createdAt: NOW,
      drafts: [
        { type: 'note', title: 'Wife is due', body: 'March', dueAt: MARCH_FIRST, personId: null, personName: 'Mark' },
      ],
    });

    const today = dateRangeBounds('today', new Date(NOW));
    const angel = (await listRecords(db, { type: 'promise', query: '', personId: null, from: null, to: null })).find(
      (record) => record.personName === 'Angel',
    );
    expect(angel).toBeDefined();

    expect(
      (await listRecords(db, { type: 'promise', query: 'file', personId: null, from: null, to: null })).map(
        (record) => record.title,
      ),
    ).toEqual(['Send the file']);
    expect(
      (
        await listRecords(db, {
          type: 'promise',
          query: '',
          personId: angel?.personId ?? null,
          from: null,
          to: null,
        })
      ).map((record) => record.title),
    ).toEqual(['Call Angel']);
    expect(
      (await listRecords(db, { type: 'promise', query: '', personId: null, from: today.from, to: today.to })).map(
        (record) => record.title,
      ),
    ).toEqual(['Call Angel']);
    expect(
      (await listRecords(db, { type: 'note', query: '%', personId: null, from: null, to: null })).map(
        (record) => record.title,
      ),
    ).toEqual([]);
    expect(
      (await listRecords(db, { type: 'note', query: '', personId: null, from: today.from, to: today.to })).map(
        (record) => record.title,
      ),
    ).toEqual(['Wife is due']);

    await updateRecord(
      db,
      angel!.id,
      { type: 'promise', title: 'Called Angel', body: null, dueAt: TONIGHT, personId: angel!.personId, personName: 'Angel', status: 'done' },
      NOW + 1,
    );
    expect((await getRecord(db, angel!.id))?.status).toBe('done');

    await deleteRecord(db, angel!.id);
    expect(await getRecord(db, angel!.id)).toBeNull();
  });

  it('rejects an empty title without writing an entry', async () => {
    await expect(
      saveCapture(db, {
        rawText: 'Hello',
        source: 'text',
        createdAt: NOW,
        drafts: [{ type: 'note', title: '   ', body: null, dueAt: null, personId: null, personName: null }],
      }),
    ).rejects.toThrow();

    const { rows } = await db.execute('SELECT count(*) AS count FROM entries');
    expect(Number(rows[0].count)).toBe(0);
  });
});
