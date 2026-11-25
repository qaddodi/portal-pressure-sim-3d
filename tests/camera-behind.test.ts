// The view from behind (free exploration turns all the way round, owner 25 Nov): the camera still frames the figure, every drawn point is inside the clip planes and finite,
// the labels still place with no overlap at every angle, and the depth-sorted parts need no front-only order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { planLayout, BAR } from '../src/ui/layout/plan.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { figureCourses } from '../src/scene/labels/stations.ts';
import { rectToBox } from '../src/scene/labels/geometry.ts';
import { Vector3 } from 'three';

const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => [...t].reduce((w) => w + size * 0.56, 0) + track * t.length;
const ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -Math.PI / 2];

function rigAt(yaw: number, pitch = 0) {
  const plan = planLayout(vp, [], 'words');
  const rig = new CameraRig(SHOTS.free, plan.free); rig.resize(vp.w, vp.h); rig.freeGate = () => true; rig.update(0);
  rig.setOrbit(yaw); rig.setOrbitPitch(pitch); rig.update(16);
  return { rig, plan };
}

test('at every turn the whole figure is inside the clip planes, in front of the camera, and its middle stays where the front view puts it', () => {
  const front = rigAt(0), mid = front.rig.project(new Vector3(...(SHOTS.free.target as [number, number, number])), { x: 0, y: 0 });
  for (const yaw of ANGLES) for (const pitch of [0, 0.35, -0.35]) {
    const { rig } = rigAt(yaw, pitch);
    assert.ok(Math.abs(rig.orbitAngle - (Math.abs(yaw) <= Math.PI ? yaw : 0)) < 1e-9, `turn ${yaw} kept`);
    const cam = rig.camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const inv = cam.matrixWorldInverse, v = new Vector3();
    let n = 0;
    for (const c of figureCourses()) for (const q of c.pts) {
      v.copy(q).applyMatrix4(inv);
      const d = -v.z;
      assert.ok(Number.isFinite(d) && d > cam.near && d < cam.far, `a vessel point at depth ${d} is outside ${cam.near}..${cam.far} (turn ${yaw}, tilt ${pitch})`);
      n++;
    }
    assert.ok(n > 100);
    const m = rig.project(new Vector3(...(SHOTS.free.target as [number, number, number])), { x: 0, y: 0 });
    assert.ok(Math.hypot(m.x - mid.x, m.y - mid.y) < 1, `the aim stays at the same place on the screen (turn ${yaw})`);
  }
});

test('the labels place and never overlap, at every turn including from behind', () => {
  for (const yaw of ANGLES) {
    const { rig, plan } = rigAt(yaw);
    let t = 1000;
    const deps: LabelDeps = {
      now: () => t, project: (p, o) => rig.project(p, o), cameraMoving: () => rig.isMoving,
      free: () => rectToBox(plan.free), view: () => ({ x0: 0, y0: BAR, x1: vp.w, y1: vp.h }),
      vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure,
      pressure: () => 12, reading: () => null, cathere: () => 0, drawn: () => true, level: () => 'all', zoom: () => 1, hand: () => rig.handView,
    };
    const ctl = new LabelController(deps);
    ctl.setState({ ...NO_STATE });
    for (let i = 0; i < 90; i++) { t += 16.67; rig.update(t); if (i % 6 === 0) ctl.markDirty(); ctl.tick(); }
    const shown = ctl.out.filter((o) => !o.ghost && o.alpha * o.mix > 0.5);
    assert.ok(shown.length >= 6, `turn ${yaw}: ${shown.length} labels`);
    for (const o of shown) {
      assert.ok([o.x, o.y, o.w, o.h].every(Number.isFinite), `${o.id} finite`);
      assert.ok(o.x >= 0 && o.y >= BAR && o.x + o.w <= vp.w && o.y + o.h <= vp.h, `${o.id} inside the view (turn ${yaw})`);
    }
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i]!, b = shown[j]!;
      assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `${a.id} overlaps ${b.id} (turn ${yaw})`);
    }
  }
});
