import { dateRangeBounds, formatTimeOfDay, shiftTimeOfDay, TIME_OF_DAY } from '@/lib/time';

describe('formatTimeOfDay', () => {
  it.each([
    ['21:00', '9:00 PM'],
    ['00:05', '12:05 AM'],
    ['12:00', '12:00 PM'],
    ['09:30', '9:30 AM'],
  ])('formats %s as %s', (time, expected) => {
    expect(formatTimeOfDay(time)).toBe(expected);
  });
});

describe('shiftTimeOfDay', () => {
  it.each([
    ['21:00', 60, '22:00'],
    ['21:00', -5, '20:55'],
    ['23:30', 60, '00:30'],
    ['00:00', -5, '23:55'],
    ['23:55', 5, '00:00'],
  ])('shifts %s by %i to %s', (time, delta, expected) => {
    expect(shiftTimeOfDay(time, delta)).toBe(expected);
  });
});

describe('dateRangeBounds', () => {
  const now = new Date(2026, 2, 11, 15, 30, 0);

  it('uses local midnights, with weeks starting Monday', () => {
    expect(dateRangeBounds('any', now)).toEqual({ from: null, to: null });
    expect(dateRangeBounds('today', now)).toEqual({
      from: new Date(2026, 2, 11).getTime(),
      to: new Date(2026, 2, 12).getTime(),
    });
    expect(dateRangeBounds('week', now)).toEqual({
      from: new Date(2026, 2, 9).getTime(),
      to: new Date(2026, 2, 16).getTime(),
    });
    expect(dateRangeBounds('month', now)).toEqual({
      from: new Date(2026, 2, 1).getTime(),
      to: new Date(2026, 3, 1).getTime(),
    });
  });
});

describe('TIME_OF_DAY', () => {
  it('accepts only 24-hour HH:MM', () => {
    expect(TIME_OF_DAY.test('23:59')).toBe(true);
    expect(TIME_OF_DAY.test('24:00')).toBe(false);
    expect(TIME_OF_DAY.test('9:00')).toBe(false);
  });
});
