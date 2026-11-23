const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[index] = crc >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytes(length: number, write: (view: DataView) => void): Uint8Array {
  const buffer = new ArrayBuffer(length);
  write(new DataView(buffer));
  return new Uint8Array(buffer);
}

function dosTime(date: Date): number {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date: Date): number {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

/**
 * A zip of stored (uncompressed) files. One archive is what the share sheet can hand off on Android.
 * Names must be short UTF-8 paths with no folders.
 */
export function zipStored(entries: ZipEntry[], modified = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const time = dosTime(modified);
  const day = dosDate(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.name.includes('/') || entry.name.includes('\\')) throw new Error('Zip names stay flat');
    const name = encoder.encode(entry.name);
    if (name.length > 0xffff || entry.data.length > 0xffffffff) throw new Error('Zip entry is too large');
    const checksum = crc32(entry.data);
    const local = concat([
      bytes(30, (view) => {
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, time, true);
        view.setUint16(12, day, true);
        view.setUint32(14, checksum, true);
        view.setUint32(18, entry.data.length, true);
        view.setUint32(22, entry.data.length, true);
        view.setUint16(26, name.length, true);
      }),
      name,
      entry.data,
    ]);
    const central = concat([
      bytes(46, (view) => {
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(12, time, true);
        view.setUint16(14, day, true);
        view.setUint32(16, checksum, true);
        view.setUint32(20, entry.data.length, true);
        view.setUint32(24, entry.data.length, true);
        view.setUint16(28, name.length, true);
        view.setUint32(42, offset, true);
      }),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const central = concat(centrals);
  const end = bytes(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, central.length, true);
    view.setUint32(16, offset, true);
  });
  return concat([...locals, central, end]);
}

function readName(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + length));
}

/** Reads a stored zip written by {@link zipStored}. Used to prove the archive opens. */
export function readStoredZip(archive: Uint8Array): ZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries: ZipEntry[] = [];
  let cursor = 0;
  while (cursor + 4 <= archive.length && view.getUint32(cursor, true) === 0x04034b50) {
    const method = view.getUint16(cursor + 8, true);
    const checksum = view.getUint32(cursor + 14, true);
    const size = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const data = archive.subarray(dataStart, dataStart + size);
    if (method !== 0) throw new Error('Only stored zip entries are read');
    if (crc32(data) !== checksum) throw new Error('Zip checksum did not match');
    entries.push({ name: readName(archive, nameStart, nameLength), data });
    cursor = dataStart + size;
  }
  if (entries.length === 0) throw new Error('Zip has no files');
  return entries;
}
