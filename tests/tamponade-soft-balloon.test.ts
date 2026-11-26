// THE SMOOTH BALLOON RULE (owner, 26 Nov 2026: "wow this looks bad; it should still look like a balloon just squished against the GEJ from the stomach side", then "the catheter should be
// middle of the spherical balloon ... deforms slightly on the GEJ side"). Root cause of the ridged cup: the balloon's rings were cut down to the room the wall left them, so the shape had
// a step at every cut. The rule these tests pin, for every slide and every screen size (one device, `procs.tamponade`, its geometry in scene units): the wall never cuts the shape; it has
// one swelling, round ends, and it is wider than the opening it is held against. (Where it sits, and that it is inside the lumen: tests/tamponade-balloon.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { DEVICE_SIDES, allocTube, makeRings, writeRings } from '../src/scene/devices/tube-rings.ts';
import { GAS_LENGTH_RATIO, TUBE_R, gasProfile, gasRings, gasSeat, gasTop, tubeLine } from '../src/scene/devices/balloons/tamponade-path.ts';
import { GAS } from '../src/scene/procedures/copied/balloon-gas.js';
import { UNITS_PER_SCENE as U } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const QS = [0, 0.2, 0.4, 0.6, 0.8, 1], KS = [0.25, 0.5, 0.75, 1];

test('the wall never cuts the balloon: at every fill and every traction each ring is the shape\'s own half width', async () => {
  await organsReady;
  const line = tubeLine(), seat = gasSeat(line), neck = GAS.neck / U;
  for (const k of KS) for (const q of QS) {
    const b = neck + (seat.b - neck) * k, top = gasTop(line, q), rings = gasRings(line, k, q, 64);
    const length = (rings[rings.length - 1]!.s - rings[0]!.s);
    rings.forEach((r) => {
      const u = length > 0 ? (r.s - top) / length : 0;
      assert.ok(Math.abs(r.r - Math.max(TUBE_R / U, gasProfile(Math.min(1, Math.max(0, u)), b))) < 1e-9, `k ${k} q ${q}: a ring (${(r.r * U).toFixed(2)}) is not the shape's width (${(r.want * U).toFixed(2)})`);
      assert.equal(r.r, r.want, 'the drawn width is the shape\'s width');
    });
  }
});

test('the balloon has one swelling and a round lower end, never a cylinder or a ridged cup, at any fill, traction or size of stomach', async () => {
  await organsReady;
  const line = tubeLine();
  for (const k of [0.5, 0.75, 1]) for (const q of QS) {
    const R = gasRings(line, k, q, 96), widest = Math.max(...R.map((r) => r.r)), span = R[R.length - 1]!.s - R[0]!.s;
    for (const key of ['r'] as const) {
      // one swelling: the half width rises to its widest and falls, with no second bump (a clipped ball steps up and down at every cut, which is what drew as ridges)
      let dir = 1, turns = 0;
      for (let i = 1; i < R.length; i++) {
        const d = R[i]![key] - R[i - 1]![key];
        if (d < -1e-9 && dir > 0) { dir = -1; turns++; } else if (d > 1e-9 && dir < 0) { turns++; dir = 1; }
      }
      assert.ok(turns <= 1, `k ${k} q ${q}: the ${key === 'r' ? 'width' : 'depth'} has ${turns} turns along the balloon: it is ridged`);
    }
    if (k < 1) continue;
    // not a cylinder: the stretch within 5 % of the widest is under half of the length
    const plateau = R.reduce((sum, r, i) => (i > 0 && r.r >= 0.95 * widest ? sum + (r.s - R[i - 1]!.s) : sum), 0) / span;
    assert.ok(plateau < 0.5, `k ${k} q ${q}: ${(plateau * 100).toFixed(0)} % of the balloon is as wide as its widest: a cylinder`);
    // a round lower end, not a flat disc: a tenth of the length up from the lower pole it is already well in from the widest
    const low = R.find((r) => r.s >= R[R.length - 1]!.s - 0.1 * span)!, high = R.find((r) => r.s >= R[0]!.s + 0.1 * span)!;
    assert.ok(low.r < 0.82 * widest, `k ${k} q ${q}: the lower end is a flat disc (${(low.r / widest).toFixed(2)} of the widest a tenth up)`);
    assert.ok(high.r < 0.93 * widest, `k ${k} q ${q}: the upper face is a straight cut (${(high.r / widest).toFixed(2)} of the widest a tenth down)`);
  }
});

test('the balloon is a ball a little shorter than it is wide, and wider than the opening it is held against, at every traction', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line);
  assert.ok(GAS_LENGTH_RATIO < 2, 'a ball flattened on one side, not a pear');
  for (const q of QS) {
    const R = gasRings(line, 1, q, 64), widest = Math.max(...R.map((r) => r.r)), length = (R[R.length - 1]!.s - R[0]!.s) / U;
    assert.ok(length < 2 * widest, `q ${q}: ${(length * U).toFixed(1)} long and ${(2 * widest * U).toFixed(1)} wide: not flattened`);
    assert.ok(widest > 1.3 * j.radius, `q ${q}: ${(widest * U).toFixed(1)} wide half width against an opening of ${(j.radius * U).toFixed(1)}: it could slip through`);
  }
  assert.ok(seat.b >= 0.5 * (GAS.bMax * 0.8) / U, 'the balloon keeps at least half the 2D app\'s size');
});

test('the seat is worked out once and kept, and quickly (it runs on the first frame the balloon is drawn)', async () => {
  await organsReady;
  const line = tubeLine(), t0 = performance.now(), seat = gasSeat(line), ms = performance.now() - t0;
  assert.equal(gasSeat(line), seat, 'kept');
  assert.ok(ms < 1500, `the seat took ${ms.toFixed(0)} ms`);
});

test('an oval ring: with no depth half width it is the circle every other device has; with one, its points lie on the oval and its normals are the oval\'s', () => {
  const circle = makeRings(3), oval = makeRings(3);
  [circle, oval].forEach((rs) => rs.forEach((r, i) => { r.c.set(0.1 * i, -0.2 * i, 0.05); r.t.set(0.2, -1, 0.1); r.r = 0.03 + 0.01 * i; }));
  oval.forEach((r) => { r.rd = r.r; });
  const g1 = allocTube(3, DEVICE_SIDES), g2 = allocTube(3, DEVICE_SIDES);
  writeRings(g1, circle, DEVICE_SIDES); writeRings(g2, oval, DEVICE_SIDES);
  for (const name of ['position', 'normal']) {
    const a = g1.getAttribute(name).array as Float32Array, b = g2.getAttribute(name).array as Float32Array;
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-6, `${name} differs between a circle and an oval with rd = r`);
  }
  oval.forEach((r) => { r.rd = r.r * 0.5; });
  const g3 = allocTube(3, DEVICE_SIDES); writeRings(g3, oval, DEVICE_SIDES);
  const pos = g3.getAttribute('position'), nor = g3.getAttribute('normal'), per = DEVICE_SIDES + 1;
  const middle = oval[1]!, t = middle.t.clone().normalize();
  for (let k = 0; k < DEVICE_SIDES; k++) {
    const p = new Vector3().fromBufferAttribute(pos, per + k).sub(middle.c), n = new Vector3().fromBufferAttribute(nor, per + k);
    const along = p.dot(t); assert.ok(Math.abs(along) < 1e-6, 'the oval lies in the ring\'s plane');
    assert.ok(Math.abs(n.length() - 1) < 1e-5, 'a unit normal');
  }
  // the widest and the thinnest of the ring are the two half widths
  const d = Array.from({ length: DEVICE_SIDES }, (_, k) => new Vector3().fromBufferAttribute(pos, per + k).sub(middle.c).length());
  assert.ok(Math.abs(Math.max(...d) - middle.r) < 1e-5 && Math.abs(Math.min(...d) - middle.rd!) < 1e-5, 'half widths r across and rd toward the viewer');
});

test('every slide and every screen size draws the same balloon: a procedure run, the patient\'s own state and a phone give one geometry', async () => {
  await organsReady;
  const a = new CelScene(), b = new CelScene();
  a.procs.tamponade.want(true, false); a.procs.tamponade.snap();
  b.procs.tamponade.setPhone(true); b.procs.tamponade.follow({ adv: 1, gas: 1 }); b.procs.tamponade.update(0);
  for (let i = 0; i < 60; i++) b.procs.tamponade.update(16);
  const pa = a.procs.tamponade.gas.toonMesh.geometry.getAttribute('position').array as Float32Array, pb = b.procs.tamponade.gas.toonMesh.geometry.getAttribute('position').array as Float32Array;
  assert.equal(pa.length, pb.length);
  let worst = 0;
  for (let i = 0; i < pa.length; i++) worst = Math.max(worst, Math.abs(pa[i]! - pb[i]!));
  assert.ok(worst < 1e-6, `the two draws differ by ${worst}`);
  a.dispose(); b.dispose();
});
