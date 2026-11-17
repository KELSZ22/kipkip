import { parseDates, parsePeople, type KnownPerson } from '@/ai/rules';

const NOW = new Date(2026, 2, 11, 10, 0, 0);

function at(year: number, month: number, day: number, hour: number, minute = 0): number {
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

const DATE_CASES: [string, number][] = [
  ['bukas', at(2026, 2, 12, 9)],
  ['mamaya', at(2026, 2, 11, 13)],
  ['mamayang gabi', at(2026, 2, 11, 20)],
  ['ngayong gabi', at(2026, 2, 11, 20)],
  ['tonight', at(2026, 2, 11, 20)],
  ['sa Lunes', at(2026, 2, 16, 9)],
  ['SA LUNES', at(2026, 2, 16, 9)],
  ['next week', at(2026, 2, 16, 9)],
  ['Friday', at(2026, 2, 13, 9)],
  ['pagkatapos ng work', at(2026, 2, 11, 18)],
  ['after work', at(2026, 2, 11, 18)],
  ['tomorrow', at(2026, 2, 12, 9)],
  ['tomorrow night', at(2026, 2, 12, 20)],
  ['bukas ng umaga', at(2026, 2, 12, 9)],
  ['bukas ng hapon', at(2026, 2, 12, 15)],
  ['sa Martes', at(2026, 2, 17, 9)],
  ['sa Miyerkules', at(2026, 2, 18, 9)],
  ['sa Huwebes', at(2026, 2, 12, 9)],
  ['sa Biyernes', at(2026, 2, 13, 9)],
  ['sa Sabado', at(2026, 2, 14, 9)],
  ['sa Linggo', at(2026, 2, 15, 9)],
  ['next Monday', at(2026, 2, 16, 9)],
  ['sa March', at(2026, 2, 1, 9)],
  ['March', at(2026, 2, 1, 9)],
  ['sa April', at(2026, 3, 1, 9)],
  ['in May', at(2026, 4, 1, 9)],
  ['sa Mayo', at(2026, 4, 1, 9)],
  ['in January', at(2027, 0, 1, 9)],
  ['kahapon', at(2026, 2, 10, 9)],
  ['ngayon', at(2026, 2, 11, 12)],
  ['today', at(2026, 2, 11, 12)],
  ['mamayang hapon', at(2026, 2, 11, 15)],
  ['this afternoon', at(2026, 2, 11, 15)],
  ['Friday night', at(2026, 2, 13, 20)],
  ['next Friday', at(2026, 2, 13, 9)],
  ['sa Biyernes ng gabi', at(2026, 2, 13, 20)],
  ['this Friday', at(2026, 2, 13, 9)],
  ['kanina', at(2026, 2, 11, 8)],
  ['in 2 days', at(2026, 2, 13, 10)],
  ['March 20', at(2026, 2, 20, 12)],
  ['tomorrow at 7pm', at(2026, 2, 12, 19)],
  ['Friday 8pm', at(2026, 2, 13, 20)],
  ['at 5pm', at(2026, 2, 11, 17)],
];

const MARK: KnownPerson = { id: 1, displayName: 'Mark' };
const ANGEL: KnownPerson = { id: 2, displayName: 'Angel' };
const ANN: KnownPerson = { id: 3, displayName: 'Ann' };
const MARY_ANN: KnownPerson = { id: 4, displayName: 'Mary Ann' };

const PERSON_CASES: [string, KnownPerson[], string[]][] = [
  ['tawagan si Angel', [ANGEL], ['Angel']],
  ['kay mark', [MARK], ['Mark']],
  ['lunch ni Mary Ann', [ANN, MARY_ANN], ['Mary Ann']],
  ['si Bea', [], ['Bea']],
  ['si wife niya', [], []],
  ['I saw Angela', [ANGEL], []],
  ['call Angel tonight', [ANGEL], ['Angel']],
  ["Promised Angel I'll call her", [ANGEL], ['Angel']],
  ['with Mark yesterday', [MARK], ['Mark']],
  ['Had lunch', [MARK, ANGEL], []],
  ['call her tonight', [ANGEL], []],
];

describe('parseDates', () => {
  it('has at least 30 date and person examples together with parsePeople', () => {
    expect(DATE_CASES.length + PERSON_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(DATE_CASES)('%s', (text, expected) => {
    const mentions = parseDates(text, NOW);
    expect(mentions[0]?.dueAt).toBe(expected);
  });

  it('keeps tonight as one phrase instead of also matching mamaya', () => {
    const mentions = parseDates('mamayang gabi', NOW);
    expect(mentions.map((mention) => mention.text)).toEqual(['mamayang gabi']);
  });

  it('keeps mamaya on the same day when three hours would pass midnight', () => {
    const late = new Date(2026, 2, 11, 22, 30, 0);
    expect(parseDates('mamaya', late)[0]?.dueAt).toBe(at(2026, 2, 11, 23));
  });

  it('moves tonight to tomorrow once 8pm has passed', () => {
    const late = new Date(2026, 2, 11, 21, 0, 0);
    expect(parseDates('tonight', late)[0]?.dueAt).toBe(at(2026, 2, 12, 20));
  });

  it('uses today for a weekday morning that has not arrived, and next week for "next"', () => {
    const earlyFriday = new Date(2026, 2, 13, 8, 0, 0);
    expect(parseDates('Friday', earlyFriday)[0]?.dueAt).toBe(at(2026, 2, 13, 9));
    expect(parseDates('next Friday', earlyFriday)[0]?.dueAt).toBe(at(2026, 2, 20, 9));
  });
});

describe('parsePeople', () => {
  it.each(PERSON_CASES)('%s', (text, people, names) => {
    expect(parsePeople(text, people).map((person) => person.name)).toEqual(names);
  });

  it('does not treat Angel as a prefix of Angela', () => {
    expect(parsePeople('email Angela', [ANGEL]).map((person) => person.name)).toEqual(['Angela']);
    expect(parsePeople('email Angela', [ANGEL])[0]?.personId).toBeNull();
  });

  it('attaches the saved id and spelling for a known person', () => {
    expect(parsePeople('kay mark', [MARK])[0]).toMatchObject({ personId: 1, name: 'Mark' });
  });
});
