export type ExportRecord = {
  type: 'note' | 'promise';
  title: string;
  body: string | null;
  personName: string | null;
  status: string;
  dueAt: number | null;
  createdAt: number;
};

export type ExportFile = { name: string; text: string };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar month, so a note lands in the month the user wrote it. */
export function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function formatStamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function kwentoMarkdown(month: string, notes: ExportRecord[]): string {
  const lines = [`# Kwento ${month}`, ''];
  for (const note of notes) {
    lines.push(`## ${oneLine(note.title)}`, formatStamp(note.createdAt));
    if (note.personName?.trim()) lines.push(oneLine(note.personName));
    if (note.body?.trim()) lines.push('', note.body.trim());
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function promisesCsv(promises: ExportRecord[]): string {
  const lines = ['title,body,person,status,due_at,created_at'];
  for (const promise of promises) {
    lines.push(
      [
        promise.title,
        promise.body ?? '',
        promise.personName ?? '',
        promise.status,
        promise.dueAt == null ? '' : formatStamp(promise.dueAt),
        formatStamp(promise.createdAt),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * One Markdown file per month of Kwento, plus one CSV when there are Pramis.
 * Months follow the order the notes were written.
 */
export function buildExportFiles(records: ExportRecord[]): ExportFile[] {
  const notes = records
    .filter((record) => record.type === 'note')
    .sort((a, b) => a.createdAt - b.createdAt);
  const promises = records
    .filter((record) => record.type === 'promise')
    .sort((a, b) => a.createdAt - b.createdAt);
  const files: ExportFile[] = [];
  const byMonth = new Map<string, ExportRecord[]>();
  for (const note of notes) {
    const month = monthKey(note.createdAt);
    const group = byMonth.get(month) ?? [];
    group.push(note);
    byMonth.set(month, group);
  }
  for (const [month, monthNotes] of byMonth) {
    files.push({ name: `kwento-${month}.md`, text: kwentoMarkdown(month, monthNotes) });
  }
  if (promises.length > 0) files.push({ name: 'pramis.csv', text: promisesCsv(promises) });
  return files;
}
