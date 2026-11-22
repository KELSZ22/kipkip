import type { NoteStamp } from '@/db/repo/records';
import { dateRangeBounds, localDayNumber } from '@/lib/time';

export type GreetingPart = 'morning' | 'afternoon' | 'evening';
export type Resurfaced = { id: number; kind: 'onThisDay' | 'older' };

export function greetingPart(now: Date): GreetingPart {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function sameMonthDay(created: Date, now: Date): boolean {
  return created.getMonth() === now.getMonth() && created.getDate() === now.getDate();
}

/**
 * Prefers a note from this month and day in an earlier year.
 * Otherwise picks one older note, stable for the whole local day.
 */
export function pickResurfaced(notes: NoteStamp[], now: Date): Resurfaced | null {
  const onThisDay = notes
    .filter((note) => {
      const created = new Date(note.createdAt);
      return created.getFullYear() < now.getFullYear() && sameMonthDay(created, now);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  if (onThisDay[0]) return { id: onThisDay[0].id, kind: 'onThisDay' };

  const start = dateRangeBounds('today', now).from ?? now.getTime();
  const older = notes.filter((note) => note.createdAt < start).sort((a, b) => a.id - b.id);
  if (older.length === 0) return null;
  return { id: older[localDayNumber(now) % older.length].id, kind: 'older' };
}
