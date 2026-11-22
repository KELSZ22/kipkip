import type { MessageKey } from '@/lib/i18n';
import { localDayNumber, TIME_OF_DAY } from '@/lib/time';

export const CHECKIN_QUESTION_COUNT = 7;
export const SNOOZE_MS = 60 * 60 * 1000;
export const CHECKIN_DAYS_AHEAD = 7;

const QUESTION_KEYS = [
  'checkin.q1',
  'checkin.q2',
  'checkin.q3',
  'checkin.q4',
  'checkin.q5',
  'checkin.q6',
  'checkin.q7',
] as const satisfies readonly MessageKey[];

export function checkinQuestionKey(day: Date): MessageKey {
  return QUESTION_KEYS[localDayNumber(day) % QUESTION_KEYS.length];
}

/** The next time the nightly question should fire, in local time. A time that already passed today moves to tomorrow. */
export function nextCheckinAt(time: string, now: Date): Date {
  if (!TIME_OF_DAY.test(time)) throw new Error('Invalid check-in time');
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

/** One slot per upcoming day, so each notification can carry that day's question. */
export function upcomingCheckins(time: string, now: Date, count = CHECKIN_DAYS_AHEAD): Date[] {
  const first = nextCheckinAt(time, now);
  return Array.from({ length: count }, (_, index) => {
    const when = new Date(first);
    when.setDate(first.getDate() + index);
    return when;
  });
}

export function checkinIdentifier(day: Date): string {
  return `kumusta-${localDayNumber(day)}`;
}

export const CHECKIN_LATER = 'kumusta-later';

export function isScheduledCheckin(identifier: string): boolean {
  return /^kumusta-\d+$/.test(identifier);
}
