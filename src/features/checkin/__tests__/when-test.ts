import { checkinIdentifier, checkinQuestionKey, isScheduledCheckin, nextCheckinAt, upcomingCheckins } from '@/features/checkin/when';

describe('checkinQuestionKey', () => {
  it('rotates through the list and stays put for a whole local day', () => {
    const morning = checkinQuestionKey(new Date(2026, 2, 11, 1));
    const night = checkinQuestionKey(new Date(2026, 2, 11, 23));
    expect(morning).toBe(night);
    expect(checkinQuestionKey(new Date(2026, 2, 12, 9))).not.toBe(morning);
  });
});

describe('nextCheckinAt', () => {
  it('uses today when the time is still ahead', () => {
    const next = nextCheckinAt('21:00', new Date(2026, 2, 11, 15, 0, 30));
    expect(next).toEqual(new Date(2026, 2, 11, 21, 0, 0));
  });

  it('moves to tomorrow once the time has passed, including the exact minute', () => {
    expect(nextCheckinAt('21:00', new Date(2026, 2, 11, 21, 0, 0))).toEqual(new Date(2026, 2, 12, 21, 0, 0));
  });

  it('rejects a time that is not HH:MM', () => {
    expect(() => nextCheckinAt('9pm', new Date())).toThrow();
  });
});

describe('upcomingCheckins', () => {
  it('gives the next seven local evenings, each with its own id', () => {
    const slots = upcomingCheckins('21:00', new Date(2026, 2, 11, 15));
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual(new Date(2026, 2, 11, 21));
    expect(slots[6]).toEqual(new Date(2026, 2, 17, 21));
    const ids = slots.map(checkinIdentifier);
    expect(new Set(ids).size).toBe(7);
    expect(ids.every(isScheduledCheckin)).toBe(true);
    expect(isScheduledCheckin('kumusta-later')).toBe(false);
  });
});
