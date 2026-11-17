/** Times of day are stored as 24-hour "HH:MM" strings. */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const MINUTES_PER_DAY = 24 * 60;

export function formatTimeOfDay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** Local date and time, short enough to scan on a phone. */
export function formatDue(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type DateRangeKey = 'any' | 'today' | 'week' | 'month';

/** Inclusive start and exclusive end, in local time. Weeks begin on Monday. */
export function dateRangeBounds(
  range: DateRangeKey,
  now: Date,
): { from: number | null; to: number | null } {
  if (range === 'any') return { from: null, to: null };

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  if (range === 'today') {
    end.setDate(end.getDate() + 1);
  } else if (range === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  }

  return { from: start.getTime(), to: end.getTime() };
}

/** Moves a time of day by a number of minutes, wrapping around midnight. */
export function shiftTimeOfDay(time: string, deltaMinutes: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const total =
    (((hours * 60 + minutes + deltaMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
