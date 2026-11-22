// The skeleton digest decides whether a baked network mesh is laid in, so it must be the same on every device that computes the skeleton: the build's node and an iPhone's JavaScript differ in the last bit of sin and
// cos, and a value that is +1e-17 on one and -1e-17 on the other rounds to +0 and -0, which FNV over the raw bytes tells apart (22 Nov: the iPhone's digest differed from the deploy's in the top bit and `?geom=net` fell back).
import test from 'node:test';
import assert from 'node:assert/strict';
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { skeletonDigest } from '../src/scene/vessels/net/baked.ts';

let seed = 12345;
const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
/** Every number in the object moved by an ulp-sized amount (relative 1e-15, and +-1e-17 for a zero): what another engine's trig does to a computed skeleton. */
function jitter<T>(v: T): T {
  if (typeof v === 'number') { const s = rnd() < 0.5 ? -1 : 1; return (v === 0 ? s * 1e-17 : v + s * Math.abs(v) * 1e-15) as T; }
  if (Array.isArray(v)) return v.map(jitter) as T;
  if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = jitter(x); return o as T; }
  return v;
}

test('the digest is the same for a skeleton whose numbers differ in the last bits, and for +0 against -0', () => {
  const sk = skeleton(), d = skeletonDigest(sk);
  assert.equal(skeletonDigest(jitter(structuredClone(sk))), d, 'last-bit differences in every number leave the digest alone');
  assert.equal(skeletonDigest(jitter(structuredClone(sk))), d, 'and again with other signs');
  // the last number hashed, on its own: +1e-17 and -1e-17 (the case that failed)
  const a = structuredClone(sk), b = structuredClone(sk), last = (s: typeof sk, x: number): void => { const f = s.bones[s.bones.length - 1]!.frame; f[f.length - 1]![f[f.length - 1]!.length - 1] = x; };
  last(a, 1e-17); last(b, -1e-17);
  assert.equal(skeletonDigest(a), skeletonDigest(b), '+1e-17 and -1e-17 hash alike');
});

test('the digest still tells a moved skeleton from the original', () => {
  const sk = skeleton(), moved = structuredClone(sk);
  moved.bones[10]!.pos[0]![0] += 0.001;
  assert.notEqual(skeletonDigest(moved), skeletonDigest(sk));
});
