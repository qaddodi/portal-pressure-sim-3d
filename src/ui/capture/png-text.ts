// A PNG with a text chunk of its own: the state that makes the picture (the patient, the sliders, the camera, the build) rides inside the file, so a picture sent for troubleshooting
// can be read back. A `tEXt` chunk (Latin-1 only, so the JSON is written with \uXXXX for anything outside ASCII) goes in right after IHDR; every viewer ignores it. Pure: bytes in, bytes out.

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
let table: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JSON as plain ASCII (every character above 126 as \uXXXX), the form a tEXt chunk can hold. */
export const asciiJson = (v: unknown): string => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const latin1 = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 255);

/** The PNG with `key` = `text` added as a tEXt chunk after its header. The key is 1-79 Latin-1 characters; a file that is not a PNG is returned as it was. */
export function pngWithText(png: Uint8Array, key: string, text: string): Uint8Array {
  if (png.length < 33 || SIG.some((b, i) => png[i] !== b) || !key || key.length > 79) return png;
  const body = new Uint8Array([...latin1('tEXt'), ...latin1(key), 0, ...latin1(text)]);
  const chunk = new Uint8Array([...u32(body.length - 4), ...body, ...u32(crc32(body))]);
  const ihdrEnd = 8 + 12 + (((png[8]! << 24) | (png[9]! << 16) | (png[10]! << 8) | png[11]!) >>> 0);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/** The text of the first tEXt chunk named `key`, or null (the reader of the chunk above: tests, and `npm run debug`). */
export function readPngText(png: Uint8Array, key: string): string | null {
  let at = 8;
  while (at + 12 <= png.length) {
    const len = ((png[at]! << 24) | (png[at + 1]! << 16) | (png[at + 2]! << 8) | png[at + 3]!) >>> 0;
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!);
    if (type === 'tEXt') {
      const data = png.subarray(at + 8, at + 8 + len), z = data.indexOf(0);
      if (z > 0 && Array.from(data.subarray(0, z), (b) => String.fromCharCode(b)).join('') === key) { let t = ''; for (let i = z + 1; i < data.length; i++) t += String.fromCharCode(data[i]!); return t; }
    }
    if (type === 'IEND') break;
    at += 12 + len;
  }
  return null;
}
