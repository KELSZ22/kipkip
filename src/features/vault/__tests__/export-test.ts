import { buildExportFiles, formatStamp } from '@/features/vault/export-files';
import { crc32, readStoredZip, zipStored } from '@/features/vault/zip';
import { isVaultUnlocked, lockVault, markVaultUnlocked } from '@/features/vault/session';

const MARCH = new Date(2026, 2, 11, 15, 4).getTime();
const APRIL = new Date(2026, 3, 2, 9, 0).getTime();

describe('export files', () => {
  it('writes one Markdown file per month and a CSV that quotes commas', () => {
    const files = buildExportFiles([
      {
        type: 'note',
        title: 'April note',
        body: 'Later',
        personName: null,
        status: 'open',
        dueAt: null,
        createdAt: APRIL,
      },
      {
        type: 'note',
        title: 'Lunch',
        body: 'With Mark',
        personName: 'Mark',
        status: 'open',
        dueAt: null,
        createdAt: MARCH,
      },
      {
        type: 'promise',
        title: 'Call Angel, tonight',
        body: 'She said "soon"',
        personName: 'Angel',
        status: 'open',
        dueAt: MARCH,
        createdAt: MARCH,
      },
    ]);

    expect(files.map((file) => file.name)).toEqual(['kwento-2026-03.md', 'kwento-2026-04.md', 'pramis.csv']);
    expect(files[0]?.text).toContain('# Kwento 2026-03');
    expect(files[0]?.text).toContain('## Lunch');
    expect(files[0]?.text).toContain(formatStamp(MARCH));
    expect(files[0]?.text).toContain('Mark');
    expect(files[2]?.text).toContain('"Call Angel, tonight"');
    expect(files[2]?.text).toContain('"She said ""soon"""');
  });

  it('skips a file type that has no rows', () => {
    expect(buildExportFiles([])).toEqual([]);
    expect(
      buildExportFiles([
        {
          type: 'promise',
          title: 'Call',
          body: null,
          personName: null,
          status: 'open',
          dueAt: null,
          createdAt: MARCH,
        },
      ]).map((file) => file.name),
    ).toEqual(['pramis.csv']);
  });
});

describe('zip', () => {
  it('round-trips stored files and checks the checksum', () => {
    const text = new TextEncoder().encode('# Kwento\n');
    const archive = zipStored([
      { name: 'kwento-2026-03.md', data: text },
      { name: 'pramis.csv', data: new TextEncoder().encode('title\n') },
    ]);
    const files = readStoredZip(archive);
    expect(files.map((file) => file.name)).toEqual(['kwento-2026-03.md', 'pramis.csv']);
    expect(files[0]?.data).toEqual(text);
    expect(crc32(text)).toBe(crc32(files[0]?.data ?? new Uint8Array()));
  });
});

describe('vault session', () => {
  afterEach(() => lockVault());

  it('stays locked until an unlock, then locks again', () => {
    expect(isVaultUnlocked()).toBe(false);
    markVaultUnlocked();
    expect(isVaultUnlocked()).toBe(true);
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
  });
});
