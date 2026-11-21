import { extractByRules, mergeExtraction, parseModelOutput, plainNote } from '@/ai/extract';
import type { KnownPerson } from '@/ai/rules';

const NOW = new Date(2026, 2, 11, 10, 0, 0);
const MARK: KnownPerson = { id: 1, displayName: 'Mark' };
const ANGEL: KnownPerson = { id: 2, displayName: 'Angel' };

function at(year: number, month: number, day: number, hour: number): number {
  return new Date(year, month, day, hour, 0, 0, 0).getTime();
}

const SAMPLE =
  "Nag-lunch kami ni Mark, sabi niya due na si wife niya sa March. Promised Angel I'll call her mamayang gabi.";

describe('extractByRules', () => {
  it('splits the sample into a note and a promise, with rules dates and known people', () => {
    const drafts = extractByRules({ text: SAMPLE, people: [MARK, ANGEL], now: NOW });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      type: 'note',
      personId: 1,
      personName: 'Mark',
      dueAt: at(2026, 2, 1, 9),
    });
    expect(drafts[0].title).toContain('March');
    expect(drafts[1]).toMatchObject({
      type: 'promise',
      title: 'Call Angel',
      personId: 2,
      personName: 'Angel',
      dueAt: at(2026, 2, 11, 20),
    });
    expect(drafts[1].body).toContain('Promised Angel');
  });

  it('still names people who are not saved yet', () => {
    const drafts = extractByRules({ text: SAMPLE, people: [], now: NOW });

    expect(drafts.map((draft) => draft.personName)).toEqual(['Mark', 'Angel']);
    expect(drafts.map((draft) => draft.personId)).toEqual([null, null]);
  });

  it('treats "Call Angel tonight" as a promise even without I\'ll', () => {
    const [draft] = extractByRules({ text: 'Call Angel tonight', people: [ANGEL], now: NOW });

    expect(draft.type).toBe('promise');
    expect(draft.title).toBe('Call Angel');
    expect(draft.dueAt).toBe(at(2026, 2, 11, 20));
  });

  it('treats a bare commitment as a promise and everything else as a note', () => {
    const [promise] = extractByRules({ text: 'pramis, ipapadala ko bukas', people: [], now: NOW });
    const [note] = extractByRules({ text: 'Had coffee with friends', people: [], now: NOW });

    expect(promise.type).toBe('promise');
    expect(promise.dueAt).toBe(at(2026, 2, 12, 9));
    expect(promise.title.toLowerCase()).toContain('ipapadala');
    expect(note.type).toBe('note');
    expect(note.dueAt).toBeNull();
  });
});

describe('mergeExtraction', () => {
  it('lets rule dates and known people replace the model, and keeps the model title', () => {
    const merged = mergeExtraction({
      text: SAMPLE,
      people: [MARK, ANGEL],
      now: NOW,
      modelRecords: [
        {
          type: 'note',
          title: 'Lunch with Mark',
          body: 'His wife is due',
          dueAt: at(2026, 5, 1, 9),
          personName: 'Marcus',
        },
        {
          type: 'promise',
          title: 'Call Angel',
          dueAt: at(2026, 2, 12, 9),
          personName: 'Angela',
        },
      ],
    });

    expect(merged[0]).toMatchObject({
      type: 'note',
      title: 'Lunch with Mark',
      body: 'His wife is due',
      dueAt: at(2026, 2, 1, 9),
      personId: 1,
      personName: 'Mark',
    });
    expect(merged[1]).toMatchObject({
      type: 'promise',
      title: 'Call Angel',
      dueAt: at(2026, 2, 11, 20),
      personId: 2,
      personName: 'Angel',
    });
  });

  it('keeps a model date and an unknown model name when the rules found neither', () => {
    const [draft] = mergeExtraction({
      text: 'Buy milk',
      people: [ANGEL],
      now: NOW,
      modelRecords: [{ type: 'promise', title: 'Buy milk', dueAt: at(2026, 2, 12, 9), personName: 'Bea' }],
    });

    expect(draft).toMatchObject({ type: 'promise', dueAt: at(2026, 2, 12, 9), personId: null, personName: 'Bea' });
  });

  it('does not let the rules change a model record type', () => {
    const [draft] = mergeExtraction({
      text: "I'll call Angel tonight",
      people: [ANGEL],
      now: NOW,
      modelRecords: [{ type: 'note', title: 'Angel called', personName: 'Someone else' }],
    });

    expect(draft.type).toBe('note');
    expect(draft.personName).toBe('Angel');
    expect(draft.dueAt).toBe(at(2026, 2, 11, 20));
  });
});

describe('parseModelOutput', () => {
  it('reads a constrained JSON object and drops empty optional fields', () => {
    const records = parseModelOutput(
      JSON.stringify({
        records: [
          {
            type: 'promise',
            title: 'Call Angel',
            body: '',
            due_at: '2026-03-11T20:00:00+08:00',
            person_name: 'Angel',
          },
        ],
      }),
    );

    expect(records).toEqual([
      {
        type: 'promise',
        title: 'Call Angel',
        body: null,
        dueAt: Date.parse('2026-03-11T20:00:00+08:00'),
        personName: 'Angel',
      },
    ]);
  });

  it('strips a json fence and rejects an empty list', () => {
    expect(parseModelOutput('```json\n{"records":[]}\n```')).toBeNull();
    expect(parseModelOutput('not json')).toBeNull();
    expect(parseModelOutput('{"records":[{"type":"event","title":"Hi","body":"","due_at":"","person_name":""}]}')).toBeNull();
  });
});

describe('plainNote', () => {
  it('keeps the whole entry as one note', () => {
    const [draft] = plainNote('Had coffee with friends.');

    expect(draft).toMatchObject({ type: 'note', title: 'Had coffee with friends', dueAt: null, personName: null });
  });
});
