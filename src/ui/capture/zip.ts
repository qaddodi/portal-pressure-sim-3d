// A ZIP file with every file stored as it is (the pictures are already compressed, so deflating them would only cost time): the capture of all decks hands over one file with
// every slide, its state and the contact sheets inside. Pure: bytes in, a Blob (or bytes) out; `zipNames` reads a zip's list back for the test.
import { crc32 } from './png-text.ts';

export interface ZipFile { name: string; data: Uint8Array }

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** The DOS time and date a zip stamps its entries with. */
export const zipStamp = (at: Date): { t: number; d: number } => ({ t: dosTime(at), d: dosDate(at) });

/** One entry as its parts: the local header, the name and the bytes (`local`), the central directory's record and the name (`central`). `offset` is where the entry starts in the zip. */
export function zipEntry(f: ZipFile, offset: number, stamp: { t: number; d: number }): { local: Uint8Array[]; central: Uint8Array[]; size: number } {
  const name = new TextEncoder().encode(f.name), crc = crc32(f.data), size = f.data.length, { t, d } = stamp;
  const head = new DataView(new ArrayBuffer(30));
  head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, t, true); head.setUint16(12, d, true);
  head.setUint32(14, crc, true); head.setUint32(18, size, true); head.setUint32(22, size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
  const c = new DataView(new ArrayBuffer(46));
  c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, t, true); c.setUint16(14, d, true);
  c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint16(30, 0, true);
  c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
  return { local: [new Uint8Array(head.buffer), name, f.data], central: [new Uint8Array(c.buffer), name], size: 30 + name.length + size };
}
/** The end-of-central-directory record: `count` entries, the directory `cdSize` bytes long and starting at `cdOffset`. */
export function zipEnd(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, count, true);
  end.setUint16(10, count, true); end.setUint32(12, cdSize, true); end.setUint32(16, cdOffset, true); end.setUint16(20, 0, true);
  return new Uint8Array(end.buffer);
}

/** The zip as its parts, in file order (a Blob takes them without joining them in memory first). */
export function zipParts(files: ZipFile[], at: Date): Uint8Array[] {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [], stamp = zipStamp(at);
  let offset = 0;
  for (const f of files) {
    const e = zipEntry(f, offset, stamp);
    parts.push(...e.local); central.push(...e.central); offset += e.size;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  return [...parts, ...central, zipEnd(files.length, cdSize, offset)];
}

/** The same zip made one file at a time: each file is read when its turn comes (from storage, say) and goes into a chunk of about `chunkBytes` that is closed as a Blob at once, so the page never holds
 *  more than a chunk's bytes of the pictures as arrays, however big the zip. A name `read` gives no bytes for is left out. `progress` is told how many files are in. */
export async function zipStream(
  names: readonly string[], read: (name: string) => Promise<Uint8Array | null>, at: Date,
  o: { chunkBytes?: number; progress?(done: number, of: number): void } = {},
): Promise<Blob> {
  const limit = o.chunkBytes ?? 16 * 1024 * 1024, stamp = zipStamp(at), chunks: Blob[] = [], central: Uint8Array[] = [];
  let parts: Uint8Array[] = [], held = 0, offset = 0, count = 0;
  for (const [i, name] of names.entries()) {
    const data = await read(name);
    o.progress?.(i + 1, names.length);
    if (!data) continue;
    const e = zipEntry({ name, data }, offset, stamp);
    parts.push(...e.local); central.push(...e.central); offset += e.size; held += e.size; count++;
    if (held >= limit) { chunks.push(new Blob(parts as BlobPart[])); parts = []; held = 0; }
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  return new Blob([...chunks, new Blob(parts as BlobPart[]), ...(central as BlobPart[]), zipEnd(count, cdSize, offset) as BlobPart], { type: 'application/zip' });
}

export const zipBlob = (files: ZipFile[], at: Date): Blob => new Blob(zipParts(files, at) as BlobPart[], { type: 'application/zip' });

/** The names, sizes and checksums in a zip made above (read from its central directory). */
export function zipNames(zip: Uint8Array): { name: string; size: number; crc: number }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength), out: { name: string; size: number; crc: number }[] = [];
  let e = zip.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) return out;
  const n = v.getUint16(e + 10, true);
  let at = v.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    const nl = v.getUint16(at + 28, true), xl = v.getUint16(at + 30, true), cl = v.getUint16(at + 32, true);
    out.push({ name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nl)), size: v.getUint32(at + 24, true), crc: v.getUint32(at + 16, true) });
    at += 46 + nl + xl + cl;
  }
  return out;
}
