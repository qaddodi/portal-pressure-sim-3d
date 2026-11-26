// The Blakemore tube passes through the real GE junction and its gastric balloon is drawn up snug against it, in every view (owner, 26 Nov 2026: "the balloon itself also needs to look
// kinda symmetrical as it's tugged
// against the GE junction", then "the direction the gastric balloon is being tugged is not right; these are anterior and posterior views and you can clearly see it's missing the GE
// junction"). Root cause of the second:
// the tube and balloon were seated from the 2D app's waypoints, but the stomach mesh is a different, placed shape with depth, so from any other view the tube left the oesophagus's wall
// early and the balloon sat in the
// fundus, beside the opening. Now the line is laid through the junction read from the mesh (organs/ge-junction.ts), the balloon is a body of revolution about it, seated by the mesh's
// signed distance. The tests read
// the numbers as the scene draws them and look from several cameras: the balloon is on the junction's axis and its rim is on the cardia whichever way the camera looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { DEVICE_SIDES } from '../src/scene/devices/tube-rings.ts';
import { GAS_FILL, GAS_LENGTH_RATIO, PULL, SKIN, TUBE_R, gasRings, gasSeat, gasTop, lineScene, pastJunction, tamponadePhase, tubeEnds, tubeLine } from '../src/scene/devices/balloons/tamponade-path.ts';
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
/** The points of a ring (centre c, direction t, radius r) round its circle. */
function ringRim(c: V3, t: V3, r: number, n = 48): V3[] {
  const side: V3 = Math.abs(t[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let a: V3 = [t[1] * side[2] - t[2] * side[1], t[2] * side[0] - t[0] * side[2], t[0] * side[1] - t[1] * side[0]];
  const al = Math.hypot(...a); a = [a[0] / al, a[1] / al, a[2] / al];
  const b: V3 = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]];
  return Array.from({ length: n }, (_, k) => { const th = (k / n) * Math.PI * 2, ct = Math.cos(th) * r, st = Math.sin(th) * r; return [c[0] + a[0] * ct + b[0] * st, c[1] + a[1] * ct + b[1] * st, c[2] + a[2] * ct + b[2] * st] as V3; });
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

test('the gastric balloon is a body of revolution about the tube: each ring is centred on the tube\'s line and held in by the wall alike all round', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, c = new Vector3(), d = new Vector3();
  for (const [k, q] of POSES) {
    for (const r of gasRings(line, k, q, 64)) {
      lineScene(line, r.s, c, d);
      assert.ok(Math.hypot(r.c[0] - c.x, r.c[1] - c.y, r.c[2] - c.z) < 1e-9, `k ${k} q ${q}: a ring is off the tube's line`);
      assert.ok(r.r >= TUBE_R / U - 1e-9 && r.r <= r.want + 1e-9, `a ring is narrower than the tube or fatter than its shape (${(r.r * U).toFixed(1)})`);
      for (const p of ringRim(r.c, r.t, r.r)) assert.ok(j.clearance(...p) >= SKIN - 0.7 / U, `k ${k} q ${q}: the rim goes through the wall (${(j.clearance(...p) * U).toFixed(1)})`);
    }
  }
});

test('opened deep in the stomach the full balloon is a slightly flattened sphere with a flat face up; drawn up the wall presses it, and it is still wider than the opening so it cannot slip back through the cardia', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line), R = gasRings(line, 1, 0, 64), widest = Math.max(...R.map((r) => r.r));
  assert.ok(widest > 0.85 * seat.b, `opened deep it has room to be round: widest ${(widest * U).toFixed(1)} of ${(seat.b * U).toFixed(1)}`);
  const length = (R[R.length - 1]!.s - R[0]!.s) / U;
  assert.ok(length / (2 * widest) > 0.6 && length / (2 * widest) < 1.05, `length over width ${(length / (2 * widest)).toFixed(2)}: a flattened sphere, not a pear`);
  assert.ok(Math.abs(GAS_LENGTH_RATIO * seat.b - length) < 1e-6);
  const tenth = R.find((r) => r.s - R[0]!.s >= length * U * 0.1)!;
  assert.ok(tenth.r > 0.5 * widest, `the upper face is flat, not a cone (${(tenth.r * U).toFixed(1)} a tenth of the way down, widest ${(widest * U).toFixed(1)})`);
  assert.ok(seat.b <= (GAS.bMax * GAS_FILL) / U + 1e-9);
  const up = Math.max(...gasRings(line, 1, 1, 64).map((r) => r.r));
  assert.ok(up > j.radius * 1.1, `drawn up it is still wider (${(up * U).toFixed(1)}) than the opening (${(j.radius * U).toFixed(1)})`);
  assert.ok(up < widest, 'and the wall round the cardia holds it in tighter than the roomy stomach did');
});

test('seated: from any camera the balloon is on the junction\'s axis, its face is over the opening, and its rim lies on the cardia', async () => {
  await organsReady;
  const line = tubeLine(), j = line.junction!, seat = gasSeat(line), R = gasRings(line, 1, 1, 64);
  assert.equal(seat.top, line.opening, 'the face is seated at the opening');
  const face = R[0]!, middle = R[Math.floor(R.length / 2)]!;
  // the junction's axis: the line through the pass in the oesophagus's direction (the tube turns on into the lumen below, so the balloon's middle is within its width of it)
  for (const cam of CAMERAS) {
    const e = cam.project(j.entry), f = cam.project(face.c), m = cam.project(middle.c);
    const faceOff = Math.hypot(f[0] - e[0], f[1] - e[1]) * U, midOff = Math.hypot(m[0] - e[0], m[1] - e[1]) * U;
    assert.ok(faceOff < 8, `${cam.name}: the balloon's face is ${faceOff.toFixed(1)} figure units from the opening (of a ${(j.radius * U).toFixed(1)} radius)`);
    assert.ok(midOff < (seat.b * U) * 1.3 + 4, `${cam.name}: the balloon's middle is ${midOff.toFixed(1)} from the junction's axis`);
    // the balloon's outline in this view spans the opening sideways, with the opening against its upper face
    const out = R.flatMap((r) => ringRim(r.c, r.t, r.r, 24).map((p) => cam.project(p)));
    const xs = out.map((p) => p[0]);
    assert.ok(e[0] > Math.min(...xs) && e[0] < Math.max(...xs), `${cam.name}: the opening is not across the balloon's outline`);
    if (cam.name !== 'top') assert.ok(Math.abs(e[1] - Math.max(...out.map((p) => p[1]))) * U < 4, `${cam.name}: the balloon's face is not against the opening`);
  }
  // the rim is on the cardia: the closest any rim point is to the wall is the give (touching), and no ring goes further through it
  let nearest = Infinity;
  for (const r of R) for (const p of ringRim(r.c, r.t, r.r)) nearest = Math.min(nearest, j.clearance(...p));
  assert.ok(nearest > SKIN - 0.8 / U && nearest < SKIN + 1.5 / U, `the rim's closest approach to the wall is ${(nearest * U).toFixed(2)} figure units (the give is ${(SKIN * U).toFixed(1)})`);
  // and it is the part of the rim round the junction, not the fundus: the wall touched is within the balloon's own reach of the opening
  let where = Infinity;
  for (const r of R) for (const p of ringRim(r.c, r.t, r.r)) if (j.clearance(...p) < SKIN + 0.6 / U) where = Math.min(where, Math.hypot(p[0] - j.centre[0], p[1] - j.centre[1], p[2] - j.centre[2]));
  assert.ok(where * U < seat.b * U * 2.5, `the rim touches the wall ${(where * U).toFixed(1)} figure units from the opening`);
  // let go it sits GAS.slack lower
  assert.ok(Math.abs(gasTop(line, 0) - gasTop(line, 1) - PULL) < 1e-9, 'let go it sits the whole draw (PULL) deeper in the stomach');
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
      for (const p of ringRim(r.c, r.t, r.r)) { highest = Math.min(highest, pastJunction(j, ...p)); assert.ok(pastJunction(j, ...p) >= -0.5 / U - 1e-9, `gas ${g.toFixed(2)}: the balloon's rim is above the junction (${(pastJunction(j, ...p) * U).toFixed(2)})`); }
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
