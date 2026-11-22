/** Constrains llama.rn to this object. Empty strings mean "not present". */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['note', 'promise'] },
          title: { type: 'string' },
          body: { type: 'string' },
          due_at: { type: 'string' },
          person_name: { type: 'string' },
        },
        required: ['type', 'title', 'body', 'due_at', 'person_name'],
      },
    },
  },
  required: ['records'],
} as const;

export const EXTRACTION_SYSTEM = [
  'You turn one personal journal entry into records.',
  'A promise is a commitment the writer makes, such as "I\'ll call Angel tonight" or "pramis, ipapadala ko bukas".',
  'Everything else is a note.',
  'One entry can contain several records. Do not invent people, dates, or events that are not in the entry.',
  'Write each title in the entry\'s language.',
  'due_at is an ISO-8601 datetime with a numeric offset, or an empty string when the entry gives no time.',
  'person_name is the person the record is about, or an empty string.',
  'body is a short detail, or an empty string.',
].join('\n');

export const CHIKA_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    source_ids: { type: 'array', items: { type: 'integer' } },
  },
  required: ['answer', 'source_ids'],
} as const;

export const CHIKA_SYSTEM = [
  'You answer a question using only the numbered records you are given.',
  'If those records do not contain the answer, return an empty answer and an empty source_ids list.',
  'Do not add facts that are not written in the records.',
  'source_ids must be ids copied from the records. Never invent an id.',
  'Write the answer in the question\'s language, in one or two sentences.',
].join('\n');

export function chikaUser(question: string, records: readonly { id: number; document: string }[]): string {
  const lines = records.map((record) => `[${record.id}] ${record.document}`);
  return `Question: ${question}\n\nRecords:\n${lines.join('\n')}`;
}

export function extractionUser(text: string, now: Date, people: readonly string[]): string {
  const known = people.length > 0 ? people.join(', ') : 'none';
  return `Now: ${now.toISOString()}\nKnown people: ${known}\n\nEntry:\n${text}`;
}
