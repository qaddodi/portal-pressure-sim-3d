// The Blakemore tube's balloons are bodies of revolution about the tube, and the gastric one is drawn up snug against the GE junction (owner, 26 Nov 2026: "the balloon itself also needs to look kinda symmetrical as it's
// tugged against the GE junction; this looks awful"). Root cause: the gastric balloon was cut from the 2D pear pressed on the stomach's wall, each ring the span of the outline across the axis, so a wall on one side
// thinned or pushed it on that side only and it hung off the tube. Now every ring of both balloons is centred on the tube's line and round about it, with the radius the shape wants held in by the wall on both sides alike.
// The test reads the rings as the scene draws them: each ring's centre is on the tube, each ring is a circle about it, and the seated balloon's rim lies on the junction's wall with nowhere further up to go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { DEVICE_SIDES } from '../src/scene/devices/tube-rings.ts';
import { GAS_FILL, GAS_LENGTH_RATIO, TUBE_R, fitsAt, gasRings, gasSeat, gasTop, lineAt, lineScene, tubeLine } from '../src/scene/devices/balloons/tamponade-path.ts';
import { GAS, clearance, standoffAt } from '../src/scene/procedures/copied/balloon-gas.js';
import { esoAt } from '../src/scene/procedures/copied/balloon-eso.js';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const U = UNITS_PER_SCENE;
const POSES: [number, number][] = [[1, 1], [1, 0.5], [1, 0], [0.5, 0.3], [0.2, 1]];

test('the gastric balloon is a body of revolution about the tube: each ring is centred on the tube\'s line and inside the wall on BOTH sides', async () => {
  await organsReady;
  const line = tubeLine(), { poly, mouth } = line.path.f;
  for (const [k, q] of POSES) {
    for (const r of gasRings(line, k, q, 64)) {
      const on = lineAt(line, r.s);
      assert.ok(Math.hypot(r.c[0] - on.p[0], r.c[1] - on.p[1]) < 1e-9, `k ${k} q ${q}: a ring is off the tube's line`);
      assert.ok(r.r >= TUBE_R - 1e-9 && r.r <= r.want + 1e-9, `a ring is narrower than the tube or fatter than its shape (${r.r})`);
      for (const sg of [1, -1]) {
        const e: [number, number] = [r.c[0] - r.t[1] * r.r * sg, r.c[1] + r.t[0] * r.r * sg];
        assert.ok(clearance(e, poly) >= standoffAt(e, mouth) - 0.2, `k ${k} q ${q}: the ${sg > 0 ? 'right' : 'left'} rim goes through the wall`);
      }
    }
  }
});

test('the full balloon is a slightly flattened sphere with a flat face up: length under its width, the face wide by a tenth of the way down', async () => {
  await organsReady;
  const line = tubeLine(), seat = gasSeat(line), R = gasRings(line, 1, 1, 64), widest = Math.max(...R.map((r) => r.r));
  assert.ok(Math.abs(widest - seat.b) < 0.5, `the widest ring is the full size (${widest.toFixed(1)} of ${seat.b.toFixed(1)})`);
  const length = R[R.length - 1]!.s - R[0]!.s;
  assert.ok(length / (2 * widest) > 0.6 && length / (2 * widest) < 0.95, `length over width ${(length / (2 * widest)).toFixed(2)}: a flattened sphere, not a pear`);
  assert.ok(Math.abs(GAS_LENGTH_RATIO * seat.b - length) < 1e-6);
  const tenth = R.find((r) => r.s - R[0]!.s >= length * 0.1)!;
  assert.ok(tenth.r > 0.55 * widest, `the upper face is flat, not a cone (${tenth.r.toFixed(1)} a tenth of the way down, widest ${widest.toFixed(1)})`);
  assert.ok(seat.b <= GAS.bMax * GAS_FILL + 1e-9);
});

test('seated: drawn up, the rim lies on the junction\'s wall and the balloon has nowhere further up to go; let go it sits GAS.slack lower', async () => {
  await organsReady;
  const line = tubeLine(), seat = gasSeat(line), { poly, mouth } = line.path.f;
  assert.ok(fitsAt(line, seat.top, seat.b), 'the seated balloon is inside the stomach');
  assert.ok(!fitsAt(line, seat.top - 1.5, seat.b), 'a hair higher it is through the roof or the oesophagus: it is as far up as the junction lets it');
  let gap = Infinity;
  for (const r of gasRings(line, 1, 1, 64)) for (const sg of [1, -1]) {
    const e: [number, number] = [r.c[0] - r.t[1] * r.r * sg, r.c[1] + r.t[0] * r.r * sg];
    if (Math.hypot(e[0] - mouth[0], e[1] - mouth[1]) < GAS.reach[1]) gap = Math.min(gap, clearance(e, poly) - standoffAt(e, mouth));
  }
  assert.ok(gap < 0.5 && gap > -0.2, `the rim at the junction is ${gap.toFixed(2)} from its standoff (on it)`);
  assert.ok(Math.abs(gasTop(line, 0) - gasTop(line, 1) - GAS.slack) < 1e-9, 'let go it sits GAS.slack down the tube');
  // wider than the oesophagus, so drawn up it cannot slip back through the cardia
  assert.ok(seat.b > esoAt(251).h * 1.2, `wider (${seat.b}) than the oesophagus (${esoAt(251).h})`);
});

test('as drawn in the scene: every ring of both balloons is a circle centred on the tube', async () => {
  await organsReady;
  const sc = new CelScene(), t = sc.procs.tamponade, line = tubeLine();
  t.want(true, true); t.snap();
  // the tube's centre line in the scene, densely
  const dense: Vector3[] = [];
  for (let s = 0; s <= line.path.total; s += 0.05) { const c = new Vector3(), d = new Vector3(); lineScene(line, s, c, d); dense.push(c); }
  const distToTube = (p: Vector3): number => Math.min(...dense.map((c) => c.distanceTo(p)));
  for (const [name, obj] of [['gastric', t.gas], ['esophageal', t.eso]] as const) {
    const pos = obj.toonMesh.geometry.getAttribute('position'), per = DEVICE_SIDES + 1, rings = pos.count / per;
    let worstOff = 0, worstRound = 0, widest = 0;
    for (let i = 0; i < rings; i++) {
      const c = new Vector3(), v = new Vector3();
      for (let j = 0; j < DEVICE_SIDES; j++) c.add(v.fromBufferAttribute(pos, i * per + j));
      c.multiplyScalar(1 / DEVICE_SIDES);
      let lo = Infinity, hi = 0;
      for (let j = 0; j < DEVICE_SIDES; j++) { const d = v.fromBufferAttribute(pos, i * per + j).distanceTo(c); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      worstOff = Math.max(worstOff, distToTube(c)); worstRound = Math.max(worstRound, (hi - lo) / Math.max(hi, 1e-9)); widest = Math.max(widest, hi);
    }
    assert.ok(worstOff < 0.0001, `${name}: a ring's centre is ${(worstOff * U).toFixed(2)} figure units off the tube`);
    assert.ok(worstRound < 0.02, `${name}: a ring is not a circle (${(worstRound * 100).toFixed(1)} % out)`);
    assert.ok(widest > (TUBE_R / U) * 4, `${name}: the balloon is drawn (widest ring ${(widest * U).toFixed(1)} figure units)`);
  }
  sc.dispose();
});
