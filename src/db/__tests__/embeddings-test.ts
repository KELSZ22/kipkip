import { packVector } from '@/ai/embed';
import { migrate } from '@/db/migrations';
import { listPublicRecords, listVectors, upsertEmbedding } from '@/db/repo/embeddings';
import { saveCapture, setRecordStatus, updateRecord } from '@/db/repo/records';

import { createTestDb } from './test-db';

const NOW = new Date(2026, 2, 11, 15).getTime();

describe('embeddings repo', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('stores a vector for a public note and hides a private one', async () => {
    await saveCapture(db, {
      rawText: 'Lunch',
      source: 'text',
      createdAt: NOW,
      drafts: [
        { type: 'note', title: 'Lunch with Mark', body: 'At the usual place', dueAt: null, personId: null, personName: 'Mark' },
        { type: 'note', title: 'Secret', body: null, dueAt: null, personId: null, personName: null },
      ],
    });
    const secretId = (await listPublicRecords(db)).find((record) => record.title === 'Secret')?.id;
    if (secretId == null) throw new Error('Secret note was not saved');
    await db.execute('UPDATE records SET is_private = 1 WHERE id = ?', [secretId]);

    const visible = await listPublicRecords(db);
    expect(visible.map((record) => record.title)).toEqual(['Lunch with Mark']);
    expect(visible[0]?.document).toContain('Mark');

    const id = visible[0]?.id ?? 0;
    await upsertEmbedding(db, id, 'qwen2.5-0.5b-q4', packVector([1, 0]));
    await upsertEmbedding(db, id, 'qwen2.5-1.5b-q4', packVector([0, 1]));

    const current = await listVectors(db, 'qwen2.5-1.5b-q4');
    expect(Array.from(current.get(id) ?? [])).toEqual([0, 1]);
    expect(await listVectors(db, 'qwen2.5-0.5b-q4')).toEqual(new Map());

    await db.execute('INSERT INTO embeddings (record_id, vector, model_id) VALUES (?, ?, ?)', [
      secretId,
      packVector([1, 1]),
      'qwen2.5-1.5b-q4',
    ]);
    expect((await listVectors(db, 'qwen2.5-1.5b-q4')).has(secretId)).toBe(false);
  });

  it('drops the vector when a record changes, so the next answer rebuilds it', async () => {
    const [id] = await saveCapture(db, {
      rawText: 'Call',
      source: 'text',
      createdAt: NOW,
      drafts: [{ type: 'promise', title: 'Call Angel', body: null, dueAt: NOW, personId: null, personName: null }],
    });
    await upsertEmbedding(db, id ?? 0, 'model', packVector([1]));

    await setRecordStatus(db, id ?? 0, 'done', NOW + 1);
    expect((await listVectors(db, 'model')).size).toBe(0);

    await upsertEmbedding(db, id ?? 0, 'model', packVector([1]));
    await updateRecord(
      db,
      id ?? 0,
      { type: 'promise', title: 'Call Angel tomorrow', body: null, dueAt: NOW, personId: null, personName: null },
      NOW + 2,
    );
    expect((await listVectors(db, 'model')).size).toBe(0);
  });
});
