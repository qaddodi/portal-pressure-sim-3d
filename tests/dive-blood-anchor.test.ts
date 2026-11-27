// The dive's anchor for the eye (owner, 27 Nov: one continuous zoom): the lobule's target sinusoid carries the sinusoid view's own red cells while the camera flies with the sinusoid at one end.
// Pins: the target is derived from the station; cells only while diving; none at rest in the lobule or on Anatomy <-> Lobule; at the landing they are the sinusoid's cells (same places within 0.5 µm);
// the blood's visibility only grows with nearness; the tube's tone lift is 0 at rest and about a tenth in the dive. Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4, PerspectiveCamera } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, U } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D, RBC_R } from '../src/scene/micro3d/sinusoid3d.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { LOBULE_R } from '../src/scene/lobule/sizes.ts';
import { SIN_LOCAL, SIN_POINT, SIN_SCALE } from '../src/scene/lobule/frames.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';
import {
  DiveBlood, SPAN_STRAIGHT_UM, TUBE_LIFT_MAX, bloodVisible, bloodWidthPx, diveBloodShown, diveTarget, pxPerUmAt, sinusoidRbcFade, tubeLift,
} from '../src/scene/micro3d/dive-blood.ts';
import { ARRIVAL, HANDOFF } from '../src/scene/micro3d/sinusoid-arrival.ts';

const T = (): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 });
const H = 800;
const net = buildLobule(7);

function build() {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true); flat.snapTargets(T());
  flat.update(1000); flat.update(1016); s3.update(true);
  const frame = new Group();
  const lifts: [string, number][] = [];
  const blood = new DiveBlood(shared, s3, flat, { setTubeLift: (k, a) => { lifts.push([k, a]); } }, net, [frame, flat.group, s3.group]);
  const cam = new PerspectiveCamera(30, 1.5, 0.0001, 10);
  cam.updateProjectionMatrix();
  /** The camera at the distance that shows a µm `k` px wide. */
  const at = (k: number) => { cam.position.set(SIN_POINT[0], SIN_POINT[1], SIN_POINT[2] + ((H / 2) * cam.projectionMatrix.elements[5]! * SIN_SCALE * U) / k); };
  const step = (k: number, share: number | null, ms = 16) => {
    at(k);
    // (the gate eases: a few frames settle it)
    let moving = false;
    for (let i = 0; i < 40; i++) { flat.update(2000 + i * 16 + step.n++ * 1000); s3.update(true); moving = blood.update({ camera: cam, stageH: H, dtMs: ms, share }); }
    return moving;
  };
  step.n = 0;
  return { flat, s3, blood, cam, step, lifts, frame };
}

test('the target course is derived from the station: the blood sinusoid the station stands on', () => {
  const t = diveTarget(net)!;
  assert.ok(t && ['s0', 's1', 's2'].includes(t.course.kind));
  // the station lies on it (within the 0.01 the sinusoid view is placed by) and it runs along the sinusoid's axis
  const d = Math.min(...t.course.pts.map((p) => Math.hypot(p[0] * LOBULE_R - SIN_LOCAL[0], -p[1] * LOBULE_R - SIN_LOCAL[1])));
  assert.ok(d < 0.1, `a point of it is near the station (${d})`);
  assert.equal(t.key, `${t.course.kind}${t.course.id}`);
  // a different station gives a different, nearest course
  const other = diveTarget(net, [SIN_LOCAL[0] * -0.3, SIN_LOCAL[1] + 1.2, 0])!;
  assert.ok(other.key !== t.key || other.arc0 !== t.arc0);
});

test('cells are drawn only while diving with the sinusoid at one end; none at rest or on Anatomy <-> Lobule', () => {
  const { blood, step, lifts } = build();
  // at the lobule's framing at rest (no dive: share null): nothing, tone 0, however near
  const rest = lobuleShot('lobule');
  const kRest = pxPerUmAt(rest.r, new PerspectiveCamera(30, 1.5).projectionMatrix.elements[5]!, H);
  // (a cell is about 2 px wide at the shot's own distance, so it is the dive's gate, not the size, that keeps the lobule at rest clean)
  assert.ok(bloodWidthPx(kRest) < 3);
  step(kRest, null);
  assert.equal(blood.stats.cells, 0); assert.equal(blood.group.visible, false);
  // Anatomy <-> Lobule: the sinusoid is not part of it (the scene passes share null): nothing, even close
  step(3, null);
  assert.equal(blood.stats.cells, 0); assert.equal(blood.group.visible, false);
  assert.ok(lifts.every(([, a]) => a === 0), 'no tone at rest');
  // a dive: the cells come up at about 2 px wide
  step(1.1, 0.1);
  assert.ok(blood.stats.cells > 20 && blood.stats.cells <= 60, `a few dozen cells (${blood.stats.cells})`);
  assert.equal(blood.group.visible, true);
  // the dive ends (the camera stops flying): they ease away, never stay
  step(1.1, null, 100);
  assert.equal(blood.stats.cells, 0);
});

test('at the landing the dive\'s cells are the sinusoid\'s own: the same places within 0.5 um, and handed over', () => {
  const { blood, s3, step } = build();
  // the cells at a size they are shown (about 3 px wide): the same cells as the sinusoid draws, along its span
  step(1.5, 0.5);
  const a = blood.mesh.toon, b = s3.rbcMesh.toon, ma = new Matrix4(), mb = new Matrix4();
  let checked = 0;
  for (let i = 0; i < Math.min(a.count, b.count); i++) {
    a.getMatrixAt(i, ma); b.getMatrixAt(i, mb);
    const x = mb.elements[12]!;
    if (Math.abs(x) > SPAN_STRAIGHT_UM) continue;
    const d = Math.hypot(ma.elements[12]! - mb.elements[12]!, ma.elements[13]! - mb.elements[13]!, ma.elements[14]! - mb.elements[14]!);
    assert.ok(d < 0.5, `cell ${i} is ${d} um from the sinusoid's`);
    // the same size
    assert.ok(Math.abs(ma.elements[0]! - mb.elements[0]!) < 1e-6);
    checked++;
  }
  assert.ok(checked > 5, `cells compared (${checked})`);
  // and at the landing size the dive's are gone: the sinusoid's own are whole
  assert.equal(sinusoidRbcFade(ARRIVAL.cells[1]), 1);
  step(6, ARRIVAL.cells[1]);
  assert.equal(blood.stats.cells, 0);
});

test('the blood only shows more the nearer the camera is, and the hand-over is complete before the landing', () => {
  let was = -1, hand = -1;
  // (the dive's share and the size on screen grow together as the camera nears: one geometric zoom)
  for (let i = 0; i <= 200; i++) {
    const share = i / 200, k = 0.05 * Math.pow(240, share);
    const v = bloodVisible(k), h = sinusoidRbcFade(share);
    assert.ok(v >= was - 1e-12, 'visibility never falls as the camera nears');
    assert.ok(h >= hand - 1e-12);
    // the dive's own share is what is seen less what the sinusoid's took over, never more than either
    assert.ok(diveBloodShown(k, share) <= v + 1e-12 && diveBloodShown(k, share) <= 1 - h + 1e-12);
    was = v; hand = h;
  }
  assert.equal(bloodVisible(0.2), 0);
  // about 2 px wide is where it is half there
  assert.ok(Math.abs(bloodVisible(2 / (2 * RBC_R)) - 0.5) < 0.01);
  // the sinusoid's red cells are whole inside the handoff band, before the landing, and whole at rest
  assert.equal(sinusoidRbcFade(HANDOFF[1]), 1);
  assert.equal(sinusoidRbcFade(null), 1);
});

test('the target tube\'s tone lifts about a tenth as the dive starts, and is 0 at rest and at the landing', () => {
  assert.equal(tubeLift(0), 0); assert.equal(tubeLift(1), 0);
  let max = 0;
  for (let s = 0; s <= 1; s += 0.01) { max = Math.max(max, tubeLift(s)); assert.ok(tubeLift(s) <= TUBE_LIFT_MAX + 1e-12); }
  assert.ok(max >= 0.08 && max <= 0.12, `a lift of ${max}`);
  const { step, lifts } = build();
  step(0.4, null);
  assert.ok(lifts.every(([, a]) => a === 0));
  step(1.0, 0.3);
  assert.ok(lifts.at(-1)![1] > 0.08);
  step(1.0, null, 100);
  assert.equal(lifts.at(-1)![1], 0);
});
