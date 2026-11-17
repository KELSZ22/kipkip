import { parse as parseChrono } from 'chrono-node';

/**
 * Date defaults, in local time, when a phrase names a day but not a clock time:
 * 9:00 for a day, 12:00 for "today", 15:00 for afternoon, 18:00 for after work,
 * 20:00 for tonight. "Mamaya" is three hours later and stays on the same day.
 * A month without a day is the 1st. The current month stays this year; an earlier
 * month rolls to next year. chrono-node parses explicit calendar days and clock
 * times. On the same span, these rules win so Taglish words keep the defaults above.
 */

const DEFAULT_HOUR = 9;
const MIDDAY_HOUR = 12;
const AFTERNOON_HOUR = 15;
const AFTER_WORK_HOUR = 18;
const TONIGHT_HOUR = 20;
const MAMAYA_HOURS = 3;
const KANINA_HOURS = 2;

const WEEKDAYS: Record<string, number> = {
  lunes: 1,
  monday: 1,
  martes: 2,
  tuesday: 2,
  miyerkules: 3,
  wednesday: 3,
  huwebes: 4,
  thursday: 4,
  biyernes: 5,
  friday: 5,
  sabado: 6,
  saturday: 6,
  linggo: 0,
  sunday: 0,
};

const MONTHS: Record<string, number> = {
  january: 0,
  enero: 0,
  february: 1,
  pebrero: 1,
  march: 2,
  marso: 2,
  april: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  june: 5,
  hunyo: 5,
  july: 6,
  hulyo: 6,
  august: 7,
  agosto: 7,
  september: 8,
  setyembre: 8,
  october: 9,
  oktubre: 9,
  november: 10,
  nobyembre: 10,
  december: 11,
  disyembre: 11,
};

const WEEKDAY =
  'miyerkules|wednesday|huwebes|thursday|biyernes|saturday|sabado|martes|tuesday|lunes|monday|linggo|sunday|friday';
const PART_OF_DAY = 'umaga|hapon|gabi|morning|afternoon|night';
const CLOCK = String.raw`\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)`;

export type DateMention = {
  start: number;
  end: number;
  dueAt: number;
  text: string;
};

export type KnownPerson = {
  id: number;
  displayName: string;
};

export type PersonMention = {
  start: number;
  end: number;
  personId: number | null;
  name: string;
};

type DateCandidate = DateMention & { source: 'custom' | 'chrono' };

const NOT_NAMES = new Set([
  'a',
  'an',
  'the',
  'me',
  'my',
  'i',
  'you',
  'her',
  'him',
  'his',
  'she',
  'he',
  'they',
  'them',
  'it',
  'ko',
  'mo',
  'natin',
  'kami',
  'tayo',
  'siya',
  'niya',
  'wife',
  'husband',
  'asawa',
  'anak',
  'baby',
  'boss',
  'friend',
  'friends',
  'family',
  'everyone',
  'someone',
  'somebody',
  'people',
  'guys',
  'work',
  'today',
  'tomorrow',
  'bukas',
  'mamaya',
  'ngayon',
  'kahapon',
  'kanina',
  'gabi',
  'umaga',
  'hapon',
  'tonight',
  'morning',
  'night',
  'afternoon',
  'later',
  'next',
  'week',
  'this',
  'that',
  'call',
  'text',
  'message',
  'send',
  'email',
  'pramis',
  'promise',
  'promised',
  'pangako',
  'ni',
  'nina',
  'kay',
  'kina',
  'si',
  'sina',
  'with',
  'for',
  "i'll",
  'i’ll',
  ...Object.keys(WEEKDAYS),
  ...Object.keys(MONTHS),
]);

function atOffset(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function upcomingWeekday(now: Date, weekday: number, hour: number, minute: number, strictNext: boolean): Date {
  let delta = (weekday - now.getDay() + 7) % 7;
  if (strictNext && delta === 0) delta = 7;
  const when = atOffset(now, delta, hour, minute);
  if (when.getTime() <= now.getTime()) return atOffset(now, delta + 7, hour, minute);
  return when;
}

/** Monday 9:00 of the next week. Weeks start on Monday. */
function nextWeek(now: Date): Date {
  const daysSinceMonday = (now.getDay() + 6) % 7;
  return atOffset(now, 7 - daysSinceMonday, DEFAULT_HOUR);
}

function monthStart(now: Date, month: number): Date {
  const year = month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, month, 1, DEFAULT_HOUR, 0, 0, 0);
}

function sameDayOrClamp(now: Date, later: Date): Date {
  const sameDay =
    later.getFullYear() === now.getFullYear() &&
    later.getMonth() === now.getMonth() &&
    later.getDate() === now.getDate();
  return sameDay ? later : atOffset(now, 0, 23);
}

function applyClock(day: Date, match: RegExpMatchArray, hourGroup: number): Date {
  const hourText = match[hourGroup];
  const ampm = match[hourGroup + 2]?.toLowerCase();
  if (!hourText || (ampm !== 'am' && ampm !== 'pm')) return day;

  let hour = Number(hourText);
  const minute = match[hourGroup + 1] ? Number(match[hourGroup + 1]) : 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59 || hour > 12) return day;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  const next = new Date(day);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function hourFromPart(part: string | undefined, fallback: number): number {
  switch (part?.toLowerCase()) {
    case 'umaga':
    case 'morning':
      return DEFAULT_HOUR;
    case 'hapon':
    case 'afternoon':
      return AFTERNOON_HOUR;
    case 'gabi':
    case 'night':
      return TONIGHT_HOUR;
    default:
      return fallback;
  }
}

function rollIfPast(now: Date, day: Date): Date {
  return day.getTime() > now.getTime() ? day : atOffset(now, 1, day.getHours(), day.getMinutes());
}

function candidate(match: RegExpMatchArray, due: Date): DateCandidate {
  const start = match.index ?? 0;
  return { start, end: start + match[0].length, dueAt: due.getTime(), text: match[0], source: 'custom' };
}

function customDates(text: string, now: Date): DateCandidate[] {
  const found: DateCandidate[] = [];
  const take = (pattern: RegExp, resolve: (match: RegExpMatchArray) => Date | null) => {
    for (const match of text.matchAll(pattern)) {
      const due = resolve(match);
      if (due && !Number.isNaN(due.getTime())) found.push(candidate(match, due));
    }
  };

  take(
    new RegExp(String.raw`\b(?:mamayang gabi|ngayong gabi|tonight)(?:${CLOCK})?\b`, 'giu'),
    (match) => applyClock(rollIfPast(now, atOffset(now, 0, TONIGHT_HOUR)), match, 1),
  );
  take(
    new RegExp(String.raw`\b(?:mamayang hapon|this afternoon)(?:${CLOCK})?\b`, 'giu'),
    (match) => applyClock(rollIfPast(now, atOffset(now, 0, AFTERNOON_HOUR)), match, 1),
  );
  take(new RegExp(String.raw`\b(?:mamayang umaga|this morning)(?:${CLOCK})?\b`, 'giu'), (match) => {
    const base = now.getHours() < 12 ? atOffset(now, 0, DEFAULT_HOUR) : atOffset(now, 1, DEFAULT_HOUR);
    return applyClock(base, match, 1);
  });
  take(
    new RegExp(
      String.raw`\b(bukas|tomorrow)(?:\s+(?:ng\s+)?(${PART_OF_DAY})|${CLOCK})?\b`,
      'giu',
    ),
    (match) => applyClock(atOffset(now, 1, hourFromPart(match[2], DEFAULT_HOUR)), match, 3),
  );
  take(
    new RegExp(String.raw`\b(?:pagkatapos ng work|after work)(?:${CLOCK})?\b`, 'giu'),
    (match) => applyClock(rollIfPast(now, atOffset(now, 0, AFTER_WORK_HOUR)), match, 1),
  );
  take(new RegExp(String.raw`\bnext week(?:${CLOCK})?\b`, 'giu'), (match) => applyClock(nextWeek(now), match, 1));
  take(
    new RegExp(
      String.raw`\b(?:(next|sa|ngayong|this|on)\s+)?(${WEEKDAY})(?:\s+(?:ng\s+)?(${PART_OF_DAY})|${CLOCK})?\b`,
      'giu',
    ),
    (match) => {
      const weekday = WEEKDAYS[match[2]?.toLowerCase() ?? ''];
      if (weekday == null) return null;
      const hour = hourFromPart(match[3], DEFAULT_HOUR);
      const timed = applyClock(atOffset(now, 0, hour), match, 4);
      return upcomingWeekday(
        now,
        weekday,
        timed.getHours(),
        timed.getMinutes(),
        match[1]?.toLowerCase() === 'next',
      );
    },
  );
  take(new RegExp(String.raw`\b(?:kahapon|yesterday)(?:${CLOCK})?\b`, 'giu'), (match) =>
    applyClock(atOffset(now, -1, DEFAULT_HOUR), match, 1),
  );
  take(new RegExp(String.raw`\b(?:ngayon|today)(?:${CLOCK})?\b`, 'giu'), (match) =>
    applyClock(atOffset(now, 0, MIDDAY_HOUR), match, 1),
  );
  take(/\bkanina\b/giu, () => new Date(now.getTime() - KANINA_HOURS * 60 * 60 * 1000));
  take(new RegExp(String.raw`\bmamaya(?:${CLOCK})?\b`, 'giu'), (match) => {
    if (match[1]) return rollIfPast(now, applyClock(atOffset(now, 0, 0), match, 1));
    const later = new Date(now.getTime() + MAMAYA_HOURS * 60 * 60 * 1000);
    later.setSeconds(0, 0);
    return sameDayOrClamp(now, later);
  });
  take(
    /\b(?:sa|in|this)\s+(january|february|march|april|may|june|july|august|september|october|november|december|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\b(?!\s+\d)/giu,
    (match) => {
      const month = MONTHS[match[1]?.toLowerCase() ?? ''];
      return month == null ? null : monthStart(now, month);
    },
  );
  take(
    /\b(january|february|march|april|june|july|august|september|october|november|december|enero|pebrero|marso|abril|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\b(?!\s+\d)/giu,
    (match) => {
      const month = MONTHS[match[1]?.toLowerCase() ?? ''];
      return month == null ? null : monthStart(now, month);
    },
  );

  return found;
}

function chronoDates(text: string, now: Date): DateCandidate[] {
  return parseChrono(text, now, { forwardDate: true }).flatMap((result) => {
    const due = result.date();
    if (Number.isNaN(due.getTime())) return [];
    return [
      {
        start: result.index,
        end: result.index + result.text.length,
        dueAt: due.getTime(),
        text: result.text,
        source: 'chrono' as const,
      },
    ];
  });
}

function takeNonOverlapping<T extends { start: number; end: number }>(items: T[], compare: (a: T, b: T) => number): T[] {
  const chosen: T[] = [];
  for (const item of [...items].sort(compare)) {
    const overlaps = chosen.some((kept) => item.start < kept.end && kept.start < item.end);
    if (!overlaps) chosen.push(item);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/** Every date phrase in `text`, earliest first. Indexes refer to `text`. */
export function parseDates(text: string, now: Date): DateMention[] {
  const chosen = takeNonOverlapping([...customDates(text, now), ...chronoDates(text, now)], (a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    if (a.source !== b.source) return a.source === 'custom' ? -1 : 1;
    return 0;
  });
  return chosen.map(({ start, end, dueAt, text: matched }) => ({ start, end, dueAt, text: matched }));
}

function presentName(raw: string): string {
  return raw
    .split(/\s+/)
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function knownId(name: string, people: KnownPerson[]): number | null {
  const found = people.find((person) => person.displayName.toLowerCase() === name.toLowerCase());
  return found ? found.id : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Known people anywhere, plus names after ni/kay/si/with or call/text. Not a substitute for the model. */
export function parsePeople(text: string, people: KnownPerson[]): PersonMention[] {
  const found: PersonMention[] = [];
  const remember = (start: number, name: string) => {
    const cleaned = name.trim();
    if (!cleaned || NOT_NAMES.has(cleaned.toLowerCase())) return;
    const display = presentName(cleaned);
    found.push({
      start,
      end: start + cleaned.length,
      personId: knownId(display, people),
      name: people.find((person) => person.id === knownId(display, people))?.displayName ?? display,
    });
  };

  const known = [...people].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const person of known) {
    const pattern = new RegExp(
      String.raw`(?:^|[^\p{L}\p{N}])(${escapeRegExp(person.displayName)})(?![\p{L}\p{N}])`,
      'giu',
    );
    for (const match of text.matchAll(pattern)) {
      const token = match[1];
      if (!token) continue;
      const start = (match.index ?? 0) + match[0].length - token.length;
      found.push({ start, end: start + token.length, personId: person.id, name: person.displayName });
    }
  }

  const introduced = new RegExp(
    String.raw`(?:^|[^\p{L}\p{N}])(?:nina|kina|sina|ni|kay|si|with|for|promised|pramis)\s+([\p{L}][\p{L}'’-]*)(?:\s+([\p{L}][\p{L}'’-]*))?`,
    'giu',
  );
  for (const match of text.matchAll(introduced)) {
    const first = match[1];
    const second = match[2];
    if (!first || NOT_NAMES.has(first.toLowerCase())) continue;
    const secondIsName =
      second &&
      !NOT_NAMES.has(second.toLowerCase()) &&
      second[0] !== second[0].toLowerCase() &&
      second[0] === second[0].toUpperCase();
    const token = secondIsName ? `${first} ${second}` : first;
    const start = (match.index ?? 0) + match[0].lastIndexOf(first);
    remember(start, token);
  }

  const action = new RegExp(
    String.raw`(?:^|[^\p{L}\p{N}])(?:call|tawagan|tatawagan|tatawag|text|message|email)\s+([\p{L}][\p{L}'’-]*)`,
    'giu',
  );
  for (const match of text.matchAll(action)) {
    const token = match[1];
    if (!token) continue;
    const start = (match.index ?? 0) + match[0].length - token.length;
    remember(start, token);
  }

  return takeNonOverlapping(found, (a, b) => {
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    if ((a.personId != null) !== (b.personId != null)) return a.personId != null ? -1 : 1;
    return a.start - b.start;
  });
}
