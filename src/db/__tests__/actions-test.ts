import { migrate } from '@/db/migrations';
import { clearPendingAction, getPendingAction, setPendingAction } from '@/db/repo/follow-up';
import { findOrCreatePerson, linkPersonContact, setPreferredApp } from '@/db/repo/people';
import { getRecord, listDuePromises, saveCapture } from '@/db/repo/records';

import { createTestDb } from './test-db';

const NOW = new Date(2026, 2, 11, 15, 0, 0).getTime();
const LATER = new Date(2026, 2, 11, 20, 0, 0).getTime();

describe('pramis contacts and follow-up', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('remembers a linked contact and the app the user actually opened', async () => {
    const [id] = await saveCapture(db, {
      rawText: 'Call Angel tonight',
      source: 'text',
      createdAt: NOW,
      drafts: [
        {
          type: 'promise',
          title: 'Call Angel',
          body: null,
          dueAt: LATER,
          personId: null,
          personName: 'Angel',
        },
      ],
    });

    const personId = await findOrCreatePerson(db, 'Angel', NOW);
    await linkPersonContact(db, personId, {
      contactId: 'contact-1',
      phone: '+63 917 123 4567',
      email: 'angel@example.com',
    });
    await setPreferredApp(db, personId, 'whatsapp');

    const record = await getRecord(db, id);
    expect(record?.personPhone).toBe('+63 917 123 4567');
    expect(record?.personEmail).toBe('angel@example.com');
    expect(record?.preferredApp).toBe('whatsapp');
  });

  it('lists only open promises that have a due time', async () => {
    await saveCapture(db, {
      rawText: 'A few things',
      source: 'text',
      createdAt: NOW,
      drafts: [
        { type: 'promise', title: 'Call Angel', body: null, dueAt: LATER, personId: null, personName: 'Angel' },
        { type: 'promise', title: 'Someday', body: null, dueAt: null, personId: null, personName: null },
        { type: 'note', title: 'Lunch', body: null, dueAt: LATER, personId: null, personName: null },
      ],
    });
    const due = await listDuePromises(db);
    const privateId = due[0]?.id;
    await db.execute('UPDATE records SET is_private = 1 WHERE id = ?', [privateId]);

    expect(await listDuePromises(db)).toEqual([]);
  });

  it('stores one follow-up question and drops a corrupt value', async () => {
    await setPendingAction(db, { recordId: 4, app: 'call', who: 'Angel' });
    expect(await getPendingAction(db)).toEqual({ recordId: 4, app: 'call', who: 'Angel' });

    await setPendingAction(db, { recordId: 5, app: 'sms', who: 'Mark' });
    expect(await getPendingAction(db)).toEqual({ recordId: 5, app: 'sms', who: 'Mark' });

    await db.execute(`UPDATE settings SET value = 'not-json' WHERE key = 'pending_action'`);
    expect(await getPendingAction(db)).toBeNull();

    await clearPendingAction(db);
    expect(await getPendingAction(db)).toBeNull();
  });
});
