// THE ROUND BALLOON, WHOLLY INSIDE (owner, 26 Nov 2026, choosing from mocks: "the catheter should be middle of the spherical balloon then tugs against GE junction from stomach size and
// deforms slightly on the GEJ side", then "it has to be contained within the lumen of the stomach/GEJ/esophagus"). Root cause of the cup and the acorn before it: the balloon was made to
// fit by bending its shape to the wall (clipped, then squashed and pushed off the tube), because the tube's way into the stomach was chosen for the lumen's average room, not for the
// balloon. Now the way is chosen for the largest round balloon that fits wholly inside (tamponade-path.ts seatWay) and the shape never bends. This file pins: the tube through the
// opening; every point of the balloon inside the lumen and under the junction at every stage, from the numbers and as drawn; the tube through every ring's centre; only the junction
// side flattened; and the seat against the cardia. tests/tamponade-soft-balloon.test.ts pins the smooth shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { DEVICE_SIDES, ringSides } from '../src/scene/devices/tube-rings.ts';
import { GAS_FACE, GAS_FILL, GAS_LENGTH_RATIO, PULL, TUBE_R, WALL_HOLD, gasRings, gasSeat, gasTop, lineScene, pastJunction, tamponadePhase, tubeEnds, tubeLine, type GasRing } from '../src/scene/devices/balloons/tamponade-path.ts';
import type { V3 } from '../src/scene/devices/bend-path.ts';
import { GAS } from '../src/scene/procedures/copied/balloon-gas.js';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const U = UNITS_PER_SCENE;
const POSES: [number, number][] = [[1, 1], [1, 0.5], [1, 0], [0.5, 0.3], [0.2, 1]];
/** The cameras: the anterior and the posterior (looking along z), the two sides (along x), from above (along y), and oblique ones between (turned about the vertical). A view drops the depth. */
const CAMERAS: { name: string; project: (p: V3) => [number, number] }[] = [
  { name: 'anterior', project: (p) => [p[0], p[1]] }, { name: 'posterior', project: (p) => [-p[0], p[1]] },
  { name: 'left', project: (p) => [p[2], p[1]] }, { name: 'right', project: (p) => [-p[2], p[1]] }, { name: 'top', project: (p) => [p[0], p[2]] },
  ...[30, 60, 120, 150].map((deg) => ({ name: `oblique ${deg}`, project: (p: V3): [number, number] => { const a = (deg * Math.PI) / 180; return [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1]]; } })),
];
/** The points round a ring's oval (the shape `writeRings` draws: half width r across, rd toward the viewer). */
function ringRim(g: Pick<GasRing, 'c' | 't' | 'r' | 'rd'>, n = 48): V3[] {
  const a = new Vector3(), b = new Vector3();
  ringSides(new Vector3(...g.t), a, b);
  return Array.from({ length: n }, (_, k) => { const th = (k / n) * Math.PI * 2, ca = Math.cos(th) * g.r, cb = Math.sin(th) * g.rd; return [g.c[0] + a.x * ca + b.x * cb, g.c[1] + a.y * ca + b.y * cb, g.c[2] + a.z * ca + b.z * cb] as V3; });
}

test('the tube passes through the opening of the junction, running along the oesophagus there, and stays inside the lumen from the opening on', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!;
  assert.ok(j, 'the line is laid through the junction the mesh has');
  const at = new Vector3(), t = new Vector3();
  lineScene(line, line.opening, at, t);
  const miss = Math.hypot(at.x - j.entry[0], at.y - j.entry[1], at.z - j.entry[2]) * U;
  assert.ok(miss < 1, `the tube is ${miss.toFixed(2)} figure units from the point of the opening it passes through`);
  const off = Math.hypot(at.x - j.centre[0], at.y - j.centre[1], at.z - j.centre[2]);
  assert.ok(off < j.radius, 'a point of the opening itself');
  const ang = (Math.acos(Math.min(1, t.x * j.normal[0] + t.y * j.normal[1] + t.z * j.normal[2])) * 180) / Math.PI;
  assert.ok(ang < 12, `at the opening the tube runs along the oesophagus's own direction (${ang.toFixed(1)} degrees off)`);
  // from a hand above the opening to the tube's end, the whole line is inside the stomach mesh
  for (let s = line.opening - 40; s <= tubeEnds(line).total; s += 2) {
    lineScene(line, s, at, t);
    assert.ok(j.clearance(at.x, at.y, at.z) > 0, `the tube is outside the mesh ${(s - line.opening).toFixed(0)} units from the opening`);
  }
});

test('THE RULE: at every fill and traction every point of the gastric balloon is inside the lumen, clear of the wall, and on the stomach\'s side of the junction', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!;
  let nearest = Infinity;
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const { k, q } = tamponadePhase(g);
    for (const r of gasRings(line, k, q, 64)) for (const p of ringRim(r)) {
      const c = j.clearance(...p);
      nearest = Math.min(nearest, c);
      assert.ok(c >= WALL_HOLD - 0.6 / U, `gas ${g.toFixed(2)}: the balloon reaches ${(-c * U).toFixed(2)} figure units into the wall`);
      assert.ok(pastJunction(j, ...p) >= -0.3 / U, `gas ${g.toFixed(2)}: the balloon is above the junction (${(pastJunction(j, ...p) * U).toFixed(2)})`);
    }
  }
  assert.ok(nearest > 0, 'never touching the wall');
});

test('the tube runs through the middle of the balloon: every ring is a circle centred on the tube\'s line, at every fill and traction', async () => {
  await organsReady;
  const line = tubeLine(), c = new Vector3(), d = new Vector3();
  for (const [k, q] of POSES) for (const r of gasRings(line, k, q, 64)) {
    lineScene(line, r.s, c, d);
    assert.ok(Math.hypot(c.x - r.c[0], c.y - r.c[1], c.z - r.c[2]) < 1e-9, `k ${k} q ${q}: a ring's centre is off the tube`);
    assert.equal(r.rd, r.r, `k ${k} q ${q}: a ring is not a circle`);
    assert.ok(Math.abs(d.x * r.t[0] + d.y * r.t[1] + d.z * r.t[2] - 1) < 1e-9, 'each ring square to the tube');
  }
});

test('a sphere pressed a little flat on the junction\'s side only: the far half is a hemisphere, the near half GAS_FACE of the radius deep, and it is wider than the opening', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line), R = gasRings(line, 1, 1, 201);
  const iw = R.reduce((m, r, i) => (r.r > R[m]!.r ? i : m), 0), widest = R[iw]!, neck = GAS.neck / U;
  assert.ok(Math.abs(widest.r - seat.b) < 0.02 * seat.b, 'its widest is the seat\'s size');
  const near = (widest.s - R[0]!.s) / U, far = (R[R.length - 1]!.s - widest.s) / U;
  assert.ok(Math.abs(far - seat.b) < 0.03 * seat.b, `the far half is ${(far * U).toFixed(1)} deep for a radius of ${(seat.b * U).toFixed(1)}: a hemisphere`);
  assert.ok(Math.abs(near - GAS_FACE * seat.b) < 0.03 * seat.b, `the junction's half is ${(near / seat.b).toFixed(2)} of the radius (wanted ${GAS_FACE})`);
  assert.ok(GAS_FACE >= 0.7 && GAS_FACE < 1, 'flattened, slightly');
  // the far half's rings lie on the sphere about the equator's centre
  const equator = seat.top + GAS_FACE * seat.b * U;
  for (const r of R.filter((x) => x.s >= equator)) {
    const v = (r.s - equator) / U, want = neck + (seat.b - neck) * Math.sqrt(Math.max(0, 1 - (v / seat.b) ** 2));
    assert.ok(Math.abs(r.r - Math.max(TUBE_R / U, want)) < 1e-6, `the far half is off the sphere at ${(v * U).toFixed(1)}`);
  }
  assert.ok(Math.abs(GAS_LENGTH_RATIO - (1 + GAS_FACE)) < 1e-12);
  assert.ok(seat.b > 1.3 * j.radius, `${(seat.b * U).toFixed(1)} half width against an opening of ${(j.radius * U).toFixed(1)}: it would slip back through`);
  assert.ok(seat.b <= (GAS.bMax * GAS_FILL) / U + 1e-9);
  assert.ok(Math.abs(line.way!.b - seat.b) < 1e-9, 'the balloon the way was chosen for is the one drawn: the laid line did not shrink it');
});

test('seated: from any camera the balloon is under the junction, its face a short way below the opening on the tube, and the opening across its outline', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line), R = gasRings(line, 1, 1, 64);
  assert.ok(seat.top >= line.opening && seat.top - line.opening <= 16 + 1e-9, `the face is ${(seat.top - line.opening).toFixed(1)} figure units below the opening`);
  const face = R[0]!;
  for (const cam of CAMERAS) {
    const e = cam.project(j.entry), f = cam.project(face.c);
    const faceOff = Math.hypot(f[0] - e[0], f[1] - e[1]) * U;
    assert.ok(faceOff < 20, `${cam.name}: the balloon's face is ${faceOff.toFixed(1)} figure units from the opening`);
    const out = R.flatMap((r) => ringRim(r, 24).map((p) => cam.project(p))), xs = out.map((p) => p[0]);
    assert.ok(e[0] > Math.min(...xs) && e[0] < Math.max(...xs), `${cam.name}: the opening is not across the balloon's outline`);
    if (cam.name !== 'top') { const gap = (e[1] - Math.max(...out.map((p) => p[1]))) * U; assert.ok(gap > -2 && gap < 20, `${cam.name}: the face is ${gap.toFixed(1)} under the opening`); }
  }
  assert.ok(Math.abs(gasTop(line, 0) - gasTop(line, 1) - PULL) < 1e-9, 'let go it sits the whole draw (PULL) deeper in the stomach');
});

test('as drawn in the scene: both balloons are circles about the tube, and every vertex of the gastric one is inside the stomach', async () => {
  await organsReady;
  const sc = new CelScene(), t = sc.procs.tamponade, line = tubeLine(), j = line.junction!;
  t.want(true, true); t.snap();
  const dense: Vector3[] = [];
  for (let s = 0; s <= line.path.total; s += 0.05) { const c = new Vector3(), d = new Vector3(); lineScene(line, s, c, d); dense.push(c); }
  const distToTube = (p: Vector3): number => Math.min(...dense.map((c) => c.distanceTo(p)));
  for (const [name, obj] of [['gastric', t.gas], ['esophageal', t.eso]] as const) {
    const pos = obj.toonMesh.geometry.getAttribute('position'), per = DEVICE_SIDES + 1, rings = pos.count / per;
    let worstOff = 0, worstRound = 0, widest = 0;
    for (let i = 0; i < rings; i++) {
      const c = new Vector3(), v = new Vector3();
      for (let k = 0; k < DEVICE_SIDES; k++) c.add(v.fromBufferAttribute(pos, i * per + k));
      c.multiplyScalar(1 / DEVICE_SIDES);
      let lo = Infinity, hi = 0;
      for (let k = 0; k < DEVICE_SIDES; k++) { const d = v.fromBufferAttribute(pos, i * per + k).distanceTo(c); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      worstOff = Math.max(worstOff, distToTube(c)); worstRound = Math.max(worstRound, (hi - lo) / Math.max(hi, 1e-9)); widest = Math.max(widest, hi);
    }
    assert.ok(worstOff < 0.0001, `${name}: a ring's centre is ${(worstOff * U).toFixed(2)} figure units off the tube`);
    assert.ok(worstRound < 0.02, `${name}: a ring is not a circle (${(worstRound * 100).toFixed(1)} % out)`);
    assert.ok(widest > (TUBE_R / U) * 4, `${name}: the balloon is drawn (widest ring ${(widest * U).toFixed(1)} figure units)`);
    if (name === 'gastric') {
      let worst = Infinity;
      for (let i = 0; i < pos.count; i++) worst = Math.min(worst, j.clearance(pos.getX(i), pos.getY(i), pos.getZ(i)));
      assert.ok(worst > 0, `${name}: a drawn vertex is ${(-worst * U).toFixed(1)} figure units outside the stomach`);
    }
  }
  sc.dispose();
});

test('the balloon is opened deep in the stomach, then the tube is withdrawn and the full balloon tugged up snug against the junction from the stomach side', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line), ends = tubeEnds(line);
  // the phases: opened first with no traction, then withdrawn with the balloon full
  for (const g of [0, 0.1, 0.25, 0.5]) assert.equal(tamponadePhase(g).q, 0, `gas ${g}: no traction while the balloon is being opened`);
  for (const g of [0.5, 0.75, 1]) assert.equal(tamponadePhase(g).k, 1, `gas ${g}: the balloon is full before it is withdrawn`);
  assert.deepEqual(tamponadePhase(1), { k: 1, q: 1 });
  // opened deep: the balloon at no traction is the whole draw below where it seats, well clear of the junction, in the stomach's lumen
  const deep = gasRings(line, 1, 0, 48), snug = gasRings(line, 1, 1, 48);
  assert.ok(Math.abs(deep[0]!.s - snug[0]!.s - PULL) < 1e-6 && PULL >= 30, `opened ${(deep[0]!.s - snug[0]!.s).toFixed(1)} figure units below where it is tugged to`);
  assert.ok(Math.abs(ends.total - ends.final - PULL) < 1e-9, 'the tube is drawn back by the same amount');
  for (const r of deep) assert.ok(pastJunction(j, ...r.c) > 25 / U, 'opened well below the junction');
  // THE RULE: at every stage, whatever the fill and the traction, no part of the balloon is on the oesophagus's side of the junction (the opening's plane), and the seated one has its face on it
  let highest = Infinity;
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const { k, q } = tamponadePhase(g);
    for (const r of gasRings(line, k, q, 48)) {
      assert.ok(pastJunction(j, ...r.c) >= -0.5 / U - 1e-9, `gas ${g.toFixed(2)}: a ring's centre is above the junction`);
      for (const p of ringRim(r)) { highest = Math.min(highest, pastJunction(j, ...p)); assert.ok(pastJunction(j, ...p) >= -0.5 / U - 1e-9, `gas ${g.toFixed(2)}: the balloon's rim is above the junction (${(pastJunction(j, ...p) * U).toFixed(2)})`); }
    }
  }
  // more traction than there is (q past 1, or below 0) does not draw it further up
  for (const q of [1.5, 3, 100]) assert.equal(gasTop(line, q), gasTop(line, 1), 'traction past the whole draw does not draw it up further');
  assert.ok(gasTop(line, 1) >= line.opening - 1e-9, 'the highest the balloon\'s face can be is the opening');
  assert.ok(highest > -0.5 / U - 1e-9);
  // as the scene draws it: the gastric balloon's vertices at each stage are below the junction's plane, and the tube's tip is deep before the withdrawal
  const sc = new CelScene(), t = sc.procs.tamponade;
  for (const g of [0.1, 0.3, 0.5, 0.65, 0.8, 1]) {
    t.follow({ adv: 1, gas: g }); t.update(0);
    const pos = t.gas.toonMesh.geometry.getAttribute('position');
    let low = Infinity;
    for (let i = 0; i < pos.count; i++) low = Math.min(low, pastJunction(j, pos.getX(i), pos.getY(i), pos.getZ(i)));
    assert.ok(low >= -1 / U, `gas ${g}: the drawn balloon reaches ${(-low * U).toFixed(2)} figure units above the junction`);
  }
  sc.dispose();
});
