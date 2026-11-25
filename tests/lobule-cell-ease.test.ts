// MASLD 7 (audit 1161e159, iPhone): the lobule's tiles ease from one build to the next over 900 ms on the CPU, every frame, over all six of their arrays (about 670 000 floats a frame, the biggest cost of the lobule's frame, 423 of
// the 900 ms the node profile of a fibrosis change spends). When only the septa move (a year of weight loss) the tiles' colours and the nuclei's normals and colours are the same bytes in both builds: nothing to ease, nothing to send
// to the GPU. This pins that the ease touches only the arrays that differ, and that the finished tiles are exactly the new build's.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createShared } = await import('../src/scene/materials/cel.ts');
const { LobuleView } = await import('../src/scene/lobule/view.ts');
const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts');

const model = (o: object = {}) => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
}) as never;
const fib = (v: number) => model({ s: v, septU: v, fibSin: v, fibPre: v, fibPost: v });

/** Byte equality, said in one line (a deepEqual of a 100 000-float array builds its whole diff in memory). */
const same = (a: Float32Array, b: Float32Array): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

type Tw = { from: Float32Array[]; to: Float32Array[]; live: boolean[]; t: number };
const attrs = (l3: InstanceType<typeof Lobule3D>) => (l3 as unknown as { cellAttrs(): { array: Float32Array; version: number }[] }).cellAttrs();

test('a change of the septa eases only the arrays that differ, and ends on exactly the new build', () => {
  const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
  flat.snapModel(fib(0.6)); flat.setVisible(true);
  l3.buildForTest('light');
  let t = 1000; flat.update(t); l3.update(true, 0, t, 1, true);
  // (the ease reads the page clock, which reads performance.now: a read is half a millisecond of it, so a frame's 3 ms share of the build runs a step and the 900 ms ease takes some hundreds of frames)
  const real = performance.now.bind(performance); let fake = real();
  performance.now = () => (fake += 0.5);
  try {
  flat.setModel(fib(0.25));
  let tw: Tw | null = null;
  for (let i = 0; i < 3000 && !tw; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, false); tw = (l3 as unknown as { cellTween: Tw | null }).cellTween; }
  assert.ok(tw, 'the new build was laid in and the ease began');
  assert.deepEqual(tw!.live, [true, true, false, true, false, false], 'positions and normals of the tiles and the nuclei positions move; the tiles\' colours and the nuclei\'s normals and colours do not');
  tw!.live.forEach((on, j) => { if (!on) assert.ok(same(tw!.from[j]!, tw!.to[j]!), `array ${j}: the same bytes in both builds`); });
  // the arrays that do not move are not sent to the GPU while the ease runs
  const v0 = attrs(l3).map((a) => a.version);
  t += 16; flat.update(t); l3.update(true, 0, t, 1, false);
  const v1 = attrs(l3).map((a) => a.version);
  assert.deepEqual(v1.map((v, j) => v !== v0[j]), tw!.live, 'only the live arrays are uploaded');
  for (let i = 0; i < 3000; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, false); }
  const done = attrs(l3).map((a) => Float32Array.from(a.array));
  tw!.to.forEach((b, j) => { let mx = 0; for (let i = 0; i < b.length; i++) mx = Math.max(mx, Math.abs(done[j]![i]! - b[i]!)); assert.ok(mx < 1e-5, `array ${j} ends on the new build (largest gap ${mx}: the last step is a + (b - a) in float32)`); });
  } finally { performance.now = real; }
});
