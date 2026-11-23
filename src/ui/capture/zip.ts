// A ZIP file with every file stored as it is (the pictures are already compressed, so deflating them would only cost time): the capture of all decks hands over one file with
// every slide, its state and the contact sheets inside. Pure: bytes in, a Blob (or bytes) out; `zipNames` reads a zip's list back for the test.
import { crc32 } from './png-text.ts';

export interface ZipFile { name: string; data: Uint8Array }

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** The zip as its parts, in file order (a Blob takes them without joining them in memory first). */
export function zipParts(files: ZipFile[], at: Date): Uint8Array[] {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const t = dosTime(at), d = dosDate(at);
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, t, true); head.setUint16(12, d, true);
    head.setUint32(14, crc, true); head.setUint32(18, size, true); head.setUint32(22, size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, t, true); c.setUint16(14, d, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  return [...parts, ...central, new Uint8Array(end.buffer)];
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
