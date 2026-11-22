import {
  contentTokens,
  cosine,
  keywordScore,
  packVector,
  parseChikaOutput,
  recordDocument,
  topMatches,
  unpackVector,
} from '@/ai/embed';

describe('recordDocument', () => {
  it('joins the fields a search should see', () => {
    expect(
      recordDocument({
        type: 'promise',
        title: 'Call Angel',
        body: 'Tonight',
        personName: 'Angel',
        status: 'open',
        dueAt: Date.UTC(2026, 2, 11, 12, 0),
      }),
    ).toBe('promise. Call Angel. Tonight. Angel. 2026-03-11T12:00');
  });

  it('adds done or cancelled, and skips an open status', () => {
    expect(
      recordDocument({ type: 'note', title: 'Lunch', body: null, personName: null, status: 'done', dueAt: null }),
    ).toBe('note. Lunch. done');
  });
});

describe('vectors', () => {
  it('packs and unpacks little-endian floats', () => {
    const packed = packVector([0.5, -1]);
    expect(Array.from(unpackVector(packed))).toEqual([0.5, -1]);
  });

  it('measures cosine and rejects a different length', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [1])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });

  it('keeps the closest items above the floor', () => {
    const picked = topMatches(
      [
        { item: 'low', score: 0.2 },
        { item: 'high', score: 0.9 },
        { item: 'mid', score: 0.5 },
      ],
      1,
      0.35,
    );
    expect(picked).toEqual(['high']);
  });
});

describe('keywordScore', () => {
  it('ignores small words and scores the overlap', () => {
    expect(contentTokens('What about Angel?')).toEqual(['angel']);
    expect(keywordScore('What about Angel?', 'promise. Call Angel')).toBe(1);
    expect(keywordScore('Angel and Mark', 'note. Lunch with Mark')).toBe(0.5);
    expect(keywordScore('the', 'note. Lunch')).toBe(0);
  });
});

describe('parseChikaOutput', () => {
  const allowed = new Set([12, 15]);

  it('keeps an answer whose ids were retrieved', () => {
    expect(parseChikaOutput('{"answer":"You had lunch with Mark.","source_ids":[12,99]}', allowed)).toEqual({
      answer: 'You had lunch with Mark.',
      sourceIds: [12],
    });
  });

  it('treats an empty answer as nothing found', () => {
    expect(parseChikaOutput('{"answer":"  ","source_ids":[12]}', allowed)).toEqual({ answer: '', sourceIds: [12] });
  });

  it('rejects an answer that cites nothing we retrieved', () => {
    expect(parseChikaOutput('```json\n{"answer":"Made up.","source_ids":[4]}\n```', allowed)).toBeNull();
    expect(parseChikaOutput('not json', allowed)).toBeNull();
  });
});
