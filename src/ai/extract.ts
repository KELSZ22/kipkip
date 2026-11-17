import { parseDates, parsePeople, type DateMention, type KnownPerson, type PersonMention } from '@/ai/rules';

export type RecordKind = 'note' | 'promise';

export type DraftRecord = {
  key: string;
  type: RecordKind;
  title: string;
  body: string | null;
  dueAt: number | null;
  personId: number | null;
  personName: string | null;
};

/** What the on-device model will return in the next milestone. Omitted means rules only. */
export type ModelRecord = {
  type: RecordKind;
  title: string;
  body?: string | null;
  dueAt?: number | null;
  personName?: string | null;
};

type Sentence = { text: string; start: number };

const PROMISE =
  /\b(?:i['’]ll|i will|i['’]m going to|im going to|gonna|i gotta|i have to|i need to|i should|i must|promise|promised|pramis|pangako|kailangan ko|dapat ko|ipapadala|papadala|magpapadala|tatawag|tatawagan|pupunta|pupuntahan|bibilhin|gagawin|aayusin|susulatan|remind me to)\b/i;

const IMPERATIVE = /^(?:please\s+)?(?:call|tawagan|tatawag|text|message|email|send|ipapadala)\b/i;

const TITLE_LIMIT = 80;
const BODY_LIMIT = 4000;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function sentenceCase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  for (const match of text.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    sentences.push({ text: trimmed, start: (match.index ?? 0) + raw.indexOf(trimmed) });
  }
  if (sentences.length > 0) return sentences;
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [{ text: trimmed, start: text.indexOf(trimmed) }];
}

function sentenceFacts(sentence: string, people: KnownPerson[], now: Date) {
  const dates = parseDates(sentence, now);
  const peopleInSentence = parsePeople(sentence, people);
  const person = peopleInSentence.find((item) => item.personId != null) ?? peopleInSentence[0] ?? null;
  return {
    dates,
    dueAt: dates[0]?.dueAt ?? null,
    person,
    promise: PROMISE.test(sentence) || (person != null && IMPERATIVE.test(sentence.trim())),
  };
}

function withoutDates(sentence: string, dates: DateMention[]): string {
  let title = sentence;
  for (const date of dates) title = title.replace(date.text, ' ');
  return title
    .replace(/^(?:pramis|pangako|promise|promised)\b[,:]?\s*/i, '')
    .replace(/[.!?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function promiseTitle(sentence: string, personName: string | null, dates: DateMention[]): string {
  if (personName && /\b(?:call|tawagan|tatawag|tatawagan|phone)\b/i.test(sentence)) return `Call ${personName}`;
  if (personName && /\b(?:text|sms|message)\b/i.test(sentence)) return `Message ${personName}`;
  if (personName && /\bemail\b/i.test(sentence)) return `Email ${personName}`;
  if (personName && /\b(?:send|ipapadala|papadala|magpapadala|padala)\b/i.test(sentence)) {
    return `Send to ${personName}`;
  }
  const stripped = withoutDates(sentence, dates);
  return sentenceCase(stripped || sentence.replace(/[.!?]+$/g, '').trim());
}

function rulesDraft(sentence: Sentence, people: KnownPerson[], now: Date): DraftRecord {
  const facts = sentenceFacts(sentence.text, people, now);
  const plain = sentenceCase(sentence.text.replace(/[.!?]+$/g, '').trim());
  const title = clip(
    facts.promise ? promiseTitle(sentence.text, facts.person?.name ?? null, facts.dates) : plain,
    TITLE_LIMIT,
  );
  return {
    key: `s${sentence.start}`,
    type: facts.promise ? 'promise' : 'note',
    title,
    body: title === plain ? null : clip(sentence.text, BODY_LIMIT),
    dueAt: facts.dueAt,
    personId: facts.person?.personId ?? null,
    personName: facts.person?.name ?? null,
  };
}

function wordScore(sentence: string, record: ModelRecord): number {
  const haystack = `${record.title} ${record.body ?? ''}`.toLowerCase();
  const words = sentence.toLowerCase().match(/[\p{L}\p{N}']{4,}/gu) ?? [];
  return words.filter((word) => haystack.includes(word)).length;
}

function matchSentence(record: ModelRecord, sentences: Sentence[], index: number): Sentence | null {
  if (sentences.length === 0) return null;
  if (sentences.length === 1) return sentences[0];
  let best = sentences[Math.min(index, sentences.length - 1)];
  let bestScore = wordScore(best.text, record);
  for (const sentence of sentences) {
    const next = wordScore(sentence.text, record);
    if (next > bestScore) {
      best = sentence;
      bestScore = next;
    }
  }
  return best;
}

function knownByName(name: string, people: KnownPerson[]): KnownPerson | null {
  return people.find((person) => person.displayName.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Known people from the rules replace a model guess. An unknown model name is kept. */
function choosePerson(rulePerson: PersonMention | null, modelName: string | null | undefined, people: KnownPerson[]) {
  if (rulePerson?.personId != null) return { personId: rulePerson.personId, personName: rulePerson.name };
  const named = modelName?.trim();
  if (named) {
    const known = knownByName(named, people);
    if (known) return { personId: known.id, personName: known.displayName };
    return { personId: null, personName: named };
  }
  if (rulePerson) return { personId: null, personName: rulePerson.name };
  return { personId: null, personName: null };
}

function modelDue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Rules-only when the model has not run. When it has, its records stay,
 * but a rule date or a known person on the matched sentence replaces the model's.
 */
export function mergeExtraction(input: {
  text: string;
  people: KnownPerson[];
  now: Date;
  modelRecords?: ModelRecord[];
}): DraftRecord[] {
  const sentences = splitSentences(input.text);
  const modelRecords = input.modelRecords ?? [];
  if (modelRecords.length === 0) {
    return sentences.map((sentence) => rulesDraft(sentence, input.people, input.now));
  }

  return modelRecords.map((record, index) => {
    const sentence = matchSentence(record, sentences, index);
    const facts = sentence ? sentenceFacts(sentence.text, input.people, input.now) : null;
    const person = choosePerson(facts?.person ?? null, record.personName, input.people);
    const fallback = sentence ? rulesDraft(sentence, input.people, input.now).title : 'Note';
    const title = clip(record.title.trim() || fallback, TITLE_LIMIT);
    const body = record.body?.trim() ? clip(record.body.trim(), BODY_LIMIT) : null;
    return {
      key: `m${index}`,
      type: record.type === 'promise' ? 'promise' : 'note',
      title,
      body,
      dueAt: facts?.dueAt ?? modelDue(record.dueAt),
      personId: person.personId,
      personName: person.personName,
    };
  });
}

export function extractByRules(input: { text: string; people: KnownPerson[]; now: Date }): DraftRecord[] {
  return mergeExtraction(input);
}
