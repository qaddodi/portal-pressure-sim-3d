// Reads one file back out of a zip this app wrote (ui/capture/zip.ts stores every entry as it is). Pure: bytes in, bytes out.
// A zip with a deflated entry is not read (null): the audit zips never have one.
export function zipFile(zip: Uint8Array, name: string): Uint8Array | null {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) return null;
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(at, true) !== 0x02014b50) return null;
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 24, true), local = v.getUint32(at + 42, true);
    const n = v.getUint16(at + 28, true), m = v.getUint16(at + 30, true), c = v.getUint16(at + 32, true);
    if (dec.decode(zip.subarray(at + 46, at + 46 + n)) === name) {
      if (method !== 0) return null;
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      return zip.slice(start, start + size);
    }
    at += 46 + n + m + c;
  }
  return null;
}
export const zipText = (zip: Uint8Array, name: string): string | null => { const b = zipFile(zip, name); return b ? new TextDecoder().decode(b) : null; };
