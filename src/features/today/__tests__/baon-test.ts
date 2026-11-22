import { greetingPart, pickResurfaced } from '@/features/today/baon';

const march11 = (year: number, hour = 12) => new Date(year, 2, 11, hour).getTime();

describe('greetingPart', () => {
  it('follows the local hour', () => {
    expect(greetingPart(new Date(2026, 2, 11, 8))).toBe('morning');
    expect(greetingPart(new Date(2026, 2, 11, 12))).toBe('afternoon');
    expect(greetingPart(new Date(2026, 2, 11, 18))).toBe('evening');
  });
});

describe('pickResurfaced', () => {
  const today = new Date(2026, 2, 11, 15);

  it('prefers the latest note from this day in an earlier year', () => {
    const picked = pickResurfaced(
      [
        { id: 1, createdAt: march11(2024) },
        { id: 2, createdAt: march11(2025, 18) },
        { id: 3, createdAt: new Date(2026, 1, 2).getTime() },
      ],
      today,
    );
    expect(picked).toEqual({ id: 2, kind: 'onThisDay' });
  });

  it('picks one older note, and the same one for the whole day', () => {
    const notes = [
      { id: 1, createdAt: new Date(2026, 1, 1).getTime() },
      { id: 2, createdAt: new Date(2026, 1, 2).getTime() },
      { id: 3, createdAt: new Date(2026, 1, 3).getTime() },
    ];
    const morning = pickResurfaced(notes, new Date(2026, 2, 11, 8));
    const night = pickResurfaced(notes, new Date(2026, 2, 11, 21));
    expect(morning).toEqual(night);
    expect(morning?.kind).toBe('older');
  });

  it('ignores notes from today', () => {
    expect(pickResurfaced([{ id: 1, createdAt: march11(2026, 9) }], today)).toBeNull();
  });
});
