// The baked files' packed arrays (src/scene/bake-pack.ts) come back bit for bit, whatever transform was chosen: a picture drawn from a packed file cannot differ from one drawn from the raw arrays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { PackWriter, STRIDES, backward, forward, unpackRef, type PackArray, type PackKind } from '../src/scene/bake-pack.ts';

/** A small deterministic generator, so a failure repeats. */
function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const same = (a: PackArray, b: PackArray) => a.constructor === b.constructor && a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;

function sample(kind: PackKind, n: number, r: () => number): PackArray {
  switch (kind) {
    case 'Float32Array': { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = (r() - 0.5) * 4; a[0] = -0; a[1] = NaN; a[2] = Infinity; a[3] = 1e-45; return a; }
    case 'Uint32Array': { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i % 7 === 0 ? Math.floor(r() * 4294967296) : i * 3; a[0] = 4294967295; return a; }
    case 'Int32Array': { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = Math.floor((r() - 0.5) * 4294967295); a[1] = -2147483648; a[2] = 2147483647; return a; }
    case 'Int16Array': { const a = new Int16Array(n); for (let i = 0; i < n; i++) a[i] = Math.floor((r() - 0.5) * 65535); a[1] = -32768; a[2] = 32767; return a; }
    case 'Uint16Array': { const a = new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = i % 5 === 0 ? Math.floor(r() * 65536) : (i * 2) & 0xffff; a[1] = 65535; return a; }
    default: { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = Math.floor(r() * 256); return a; }
  }
}

test('every transform gives the array back bit for bit, every element kind, every length from empty to a few hundred', () => {
  const r = rng(7);
  const kinds: PackKind[] = ['Float32Array', 'Uint32Array', 'Int32Array', 'Int16Array', 'Uint16Array', 'Uint8Array'];
  for (const kind of kinds) for (const n of [0, 1, 2, 3, 5, 17, 64, 301]) for (const m of [0, 1, ...STRIDES.map((s) => s + 1)]) {
    const a = sample(kind, n, r);
    if (n < 4 && kind === 'Float32Array') continue;   // (the sample writes its four special values at 0 to 3)
    const back = backward(kind, n, m, forward(a, m));
    assert.ok(same(a, back), `${kind} n=${n} m=${m}`);
  }
});

test('a writer picks a transform per array and the references read each back exactly, from any offset of the data', () => {
  const r = rng(11), w = new PackWriter((b) => gzipSync(b, { level: 6 }).length), kinds: PackKind[] = ['Float32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Uint8Array', 'Int32Array'];
  const made = kinds.flatMap((k) => [sample(k, 400, r), sample(k, 9, r)]);
  const refs = made.map((a) => w.add(a));
  const data = w.finish();
  const buf = new ArrayBuffer(data.length + 12); new Uint8Array(buf).set(data, 12);   // (the data section need not start at 0 or on a word)
  made.forEach((a, i) => assert.ok(same(a, unpackRef(buf, 12, refs[i]!)), `array ${i} (${refs[i]!.$t}, m=${refs[i]!.m ?? 0})`));
});

test('the transforms earn their keep: a smooth mesh\'s indices and positions pack far smaller than raw, and a raw array is kept when nothing helps', () => {
  const idx = new Uint16Array(30000); for (let i = 0; i < idx.length; i++) idx[i] = ((i / 3) | 0) + (i % 3);   // (a strip: each triangle one vertex on)
  const pos = new Int16Array(30000); for (let i = 0; i < pos.length; i++) pos[i] = Math.round(1000 * Math.sin(i / 3 / 40) + (i % 3) * 300);
  const noise = new Uint32Array(2000); const r = rng(3); for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(r() * 4294967296);
  const w = new PackWriter((b) => gzipSync(b, { level: 6 }).length);
  const gz = (b: ArrayBufferView) => gzipSync(Buffer.from(b.buffer, b.byteOffset, b.byteLength), { level: 9 }).length;
  for (const a of [idx, pos]) {
    const ref = w.add(a);
    assert.ok((ref.m ?? 0) > 0, `${ref.$t} is transformed`);
    assert.ok(gz(forward(a, ref.m!)) < gz(a) * 0.7, `${ref.$t}: ${gz(forward(a, ref.m!))} against ${gz(a)}`);
  }
  assert.equal(w.add(noise).m ?? 0, gz(forward(noise, 1)) < gz(noise) ? 1 : 0, 'noise: only a byte split, or nothing');
});
