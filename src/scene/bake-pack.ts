// The baked files' arrays (organs, skins, welds), stored smaller and read back bit for bit. A baked file is a JSON header and, after it, the arrays' bytes; the host sends
// the whole file as it is (gzip, made here at
// build time), so what counts is how well gzip does on those bytes. Raw typed arrays compress badly: a float's low bytes are noise between its high ones, an index list
// climbs a little each step. Each array is
// therefore written through one of a few reversible transforms, chosen at bake time by what gzip makes of it (`PackWriter.add`), and undone on reading (`unpackRef`):
//   - the bytes of each word split into planes (every word's first byte, then every second byte...): the high bytes of neighbouring floats and of small numbers are alike and now lie together;
// - and, before that, each word taken from the word `stride` places before it (a delta, modulo the word, then folded so a small step either way is a small number): a mesh's
// vertices and its triangle
//     indices move a little from one to the next, so the steps are small numbers and their high planes are runs of zeros.
// No value is rounded: the arrays that come out are the arrays that went in, so a picture drawn from them cannot change (tests/bake-pack.test.ts). Used by organs/baked.ts,
// vessels/skin/baked.ts and lobule/weld-codec.ts.

/** The element kinds a file holds (the name is what the header records). */
export type PackKind = 'Float32Array' | 'Uint32Array' | 'Int32Array' | 'Int16Array' | 'Uint16Array' | 'Uint8Array';
export type PackArray = Float32Array | Uint32Array | Int32Array | Int16Array | Uint16Array | Uint8Array;
/** Where an array's bytes are in the file's data, how many elements it has and how it was written (`m`, absent for raw: see `transformOf`). */
export interface PackRef { $t: PackKind; o: number; n: number; m?: number }

const KINDS = { Float32Array, Uint32Array, Int32Array, Int16Array, Uint16Array, Uint8Array } as const;
const WIDTH: Record<PackKind, number> = { Float32Array: 4, Uint32Array: 4, Int32Array: 4, Int16Array: 2, Uint16Array: 2, Uint8Array: 1 };
/** The deltas tried: the word before, two, three (a vertex's own x, y, z), four. */
export const STRIDES = [1, 2, 3, 4] as const;

/** `m`: 0 raw bytes; 1 byte planes; 1 + s the deltas at stride s, then byte planes. */
export const transformOf = (m: number | undefined): { shuffle: boolean; stride: number } => ({ shuffle: (m ?? 0) > 0, stride: Math.max(0, (m ?? 0) - 1) });

/** An array's words as the integers its bytes make (a float is its bit pattern). */
function wordsOf(a: PackArray): Int32Array | Int16Array {
  if (a instanceof Float32Array) return new Int32Array(a.buffer, a.byteOffset, a.length);
  if (a instanceof Int32Array || a instanceof Int16Array) return a;
  if (a instanceof Uint32Array) return new Int32Array(a.buffer, a.byteOffset, a.length);
  if (a instanceof Uint16Array) return new Int16Array(a.buffer, a.byteOffset, a.length);
  throw new Error('bake-pack: bytes are not transformed');
}

/**
 * The array's bytes under transform `m`: the words, each less the word `stride` before it and folded (so a small step either way is a small number), then split into byte
 * planes. Bytes (width 1) are left as they are.
 */
export function forward(a: PackArray, m: number): Uint8Array {
  const w = WIDTH[a.constructor.name as PackKind], n = a.length;
  if (m === 0 || w === 1) return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const { stride } = transformOf(m), x = wordsOf(a), out = new Uint8Array(n * w), wide = w === 4;
  for (let i = 0; i < n; i++) {
    let z: number;
    if (stride === 0) z = x[i]!;
    else {
      const d = wide ? (x[i]! - (i >= stride ? x[i - stride]! : 0)) | 0 : ((x[i]! - (i >= stride ? x[i - stride]! : 0)) << 16) >> 16;
      z = wide ? (d << 1) ^ (d >> 31) : ((d << 1) ^ (d >> 15)) & 0xffff;
    }
    for (let p = 0; p < w; p++) out[p * n + i] = (z >>> (8 * p)) & 255;
  }
  return out;
}

/** The array that `forward` wrote as `bytes` under `m`: the planes joined, the folded steps added back. */
export function backward(kind: PackKind, n: number, m: number, bytes: Uint8Array): PackArray {
  const w = WIDTH[kind], K = KINDS[kind];
  if (m === 0 || w === 1) { const out = new K(n); new Uint8Array(out.buffer).set(bytes.subarray(0, n * w)); return out; }
  const { stride } = transformOf(m), out = new K(n), wide = w === 4;
  const x = kind === 'Float32Array' ? new Int32Array(out.buffer) : (out as Exclude<PackArray, Float32Array | Uint8Array>);   // (a float is written as its bits)
  for (let i = 0; i < n; i++) {
    let z = 0;
    for (let p = 0; p < w; p++) z |= bytes[p * n + i]! << (8 * p);
    if (stride === 0) { x[i] = z; continue; }
    const d = (z >>> 1) ^ -(z & 1), prev = i >= stride ? x[i - stride]! : 0;
    x[i] = wide ? (prev + d) | 0 : (prev + d) & 0xffff;
  }
  return out;
}

/** Node's gzip at level 6, found through `process.getBuiltinModule` (the baking happens under node only). */
function nodeGzipSize(b: Uint8Array): number {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const zlib = proc?.getBuiltinModule?.('node:zlib') as typeof import('node:zlib') | undefined;
  if (!zlib) throw new Error('bake-pack: writing a baked file needs node');
  return zlib.gzipSync(b, { level: 6 }).length;
}

/** Collects arrays for a file's data section. `add` writes each under the transform gzip likes best and returns its reference for the header; `finish` is the data section. */
export class PackWriter {
  /** `gz`: the size gzip gives some bytes (node's zlib, found without importing it, so the page's bundle never holds it: the page only reads). */
  private readonly gz: (b: Uint8Array) => number;
  constructor(gz: (b: Uint8Array) => number = nodeGzipSize) { this.gz = gz; }
  private parts: Uint8Array[] = [];
  private bytes = 0;
  /** How many bytes each transform was chosen for (the bake's printout). */
  readonly chosen: Record<number, number> = {};
  add(a: PackArray): PackRef {
    const kind = a.constructor.name as PackKind, o = this.bytes;
    let best = 0;
    if (WIDTH[kind] > 1 && a.length > 16) {
      // (the choice is by what gzip makes of the array alone: the file's one gzip over all of them does about the same, and a few hundred small arrays are not tried against each other)
      let size = this.gz(forward(a, 0));
      for (const m of [1, ...STRIDES.map((s) => s + 1)]) { const g = this.gz(forward(a, m)); if (g < size) { size = g; best = m; } }
    }
    const b = forward(a, best);
    this.parts.push(b); this.bytes += b.length; this.chosen[best] = (this.chosen[best] ?? 0) + b.length;
    return best ? { $t: kind, o, n: a.length, m: best } : { $t: kind, o, n: a.length };
  }
  finish(): Uint8Array {
    const out = new Uint8Array(this.bytes);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
}

/** The array a header reference names, read from the file's data section (`buf` from byte `start`). */
export function unpackRef(buf: ArrayBuffer, start: number, r: PackRef): PackArray {
  const w = WIDTH[r.$t];
  return backward(r.$t, r.n, r.m ?? 0, new Uint8Array(buf, start + r.o, r.n * w));
}

/** Whether a header value is an array reference. */
export const isRef = (v: unknown): v is PackRef => !!v && typeof v === 'object' && typeof (v as PackRef).$t === 'string' && (v as PackRef).$t in KINDS;
