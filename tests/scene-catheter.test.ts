import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BALLOON_RADII, CATHETER_RADIUS, CATHETER_ROUTE } from '../src/scene/catheter.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { CelScene } from '../src/scene/scene.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { drawnShare } from '../src/scene/procedures/route3d.ts';
import { rhvBranchIds, RHV_FORK_PIECE } from '../src/scene/procedures/route-placed.ts';

test('route: the catheter is hidden until it advances, then feeds in from the neck', () => {
  const s = new CelScene();
  assert.equal(s.catheter.shaft.group.visible, false);
  s.setCatheter({ advance: 0.4, balloon: 0 });
  assert.equal(s.catheter.shaft.group.visible, true);
  assert.equal(s.catheter.shaft.toon.uniforms.reveal.value, 0.4);
  assert.equal(s.catheter.shaft.ink.uniforms.reveal.value, 0.4, 'the ink is cut with the tube');
  const tip = s.catheter.tipPosition();
  assert.ok(tip.y < CATHETER_ROUTE[0]![1] && tip.y > CATHETER_ROUTE.at(-1)![1]);
  s.dispose();
});

test('the tip ends in the right hepatic vein, and the tip follows the advance', () => {
  const s = new CelScene();
  s.setCatheter({ advance: 1, balloon: 0 });
  const end = s.catheter.tipPosition(new Vector3());
  const last = CATHETER_ROUTE.at(-1)!;
  assert.ok(end.distanceTo(new Vector3(...last)) < 1e-6);
  assert.ok(end.x < x3(620), 'out the right hepatic vein, to the patient\'s right: the viewer\'s left of the IVC');
  s.dispose();
});

test('wedge: the balloon appears only at the end of the route and grows from nothing', () => {
  const s = new CelScene();
  s.setCatheter({ advance: 0.9, balloon: 1 });
  assert.equal(s.catheter.balloonObj.group.visible, false, 'no balloon before the tip arrives');
  s.setCatheter({ advance: 1, balloon: 0 });
  assert.equal(s.catheter.balloonObj.group.visible, false);
  s.setCatheter({ advance: 1, balloon: 0.5 });
  assert.equal(s.catheter.balloonObj.group.visible, true);
  assert.equal(s.catheter.balloonObj.group.scale.x, 0.5);
  s.setCatheter({ advance: 1, balloon: 1 });
  assert.equal(s.catheter.balloonObj.group.scale.x, 1);
  s.dispose();
});

test('state is clamped, so a tween overshoot never draws past the route', () => {
  const s = new CelScene();
  s.setCatheter({ advance: 1.4, balloon: -0.2 });
  assert.deepEqual({ ...s.catheter.current }, { advance: 1, balloon: 0 });
  s.dispose();
});

test('the catheter and balloon use the thin ink the spec gives small parts (0.9 to 1.1 px)', () => {
  const s = new CelScene();
  assert.ok(s.catheter.shaft.basePx >= 0.9 && s.catheter.shaft.basePx <= 1.1);
  assert.ok(s.catheter.balloonObj.basePx >= 0.9 && s.catheter.balloonObj.basePx <= 1.1);
  s.dispose();
});

test('the route runs on the figure\'s own vessels: neck, SVC, atrium, IVC, then out the right hepatic vein', () => {
  const r = CATHETER_ROUTE;
  // (restated for the placed anatomy, the only one now: the route is laid in 3D on the drawn centrelines (route-placed.ts), so "on the vessel" is inside its lumen at that point,
  // measured in 3D against the centreline's own radius; the old 2D courses and tier depths are retired)
  const near = (id: string, at: number) => {
    const c = centrelineOf(id)!, p = c.pointAt(at), tol = c.radiusAt(at);
    return r.some((q) => Math.hypot(q[0] - p[0]!, q[1] - p[1]!, q[2] - p[2]!) < tol);
  };
  assert.ok(near('SVC_RA', 1), 'through the atrium');
  assert.ok(near('IVC_IS', 0.8), 'down the IVC');
  assert.ok(near('RHV_IVC', 0.5), 'into the right hepatic vein');
  assert.ok(r[0]![1] > y3(0), 'it starts above the neck of the figure\'s SVC');
  // goes down the column and out to the viewer\'s left, never doubling back upward
  for (let i = 1; i < r.length; i++) assert.ok(r[i]![1] <= r[i - 1]![1] + 0.12, 'no climbing back');
  // the depth eases between the cava and the vein, with no jump
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i]![2] - r[i - 1]![2]) < 0.12, `z step at ${i}`);
});

test('the tip ends inside the right hepatic vein\'s main trunk (the 2D app\'s 62 % on the old figure), and the catheter is thinner than the vein', () => {
  const end = CATHETER_ROUTE.at(-1)!;
  // (restated for the placed anatomy, the only one now: the HVPG wedges in the MAIN right hepatic vein, short of its fork (Mohammad 24 Nov, route-placed.ts WEDGE_ALONG), so the tip is
  // in the middle of the trunk's lumen and nearer its centreline than any branch's; tests/anatomy-placed-devices.test.ts pins where along the trunk)
  const trunk = Math.min(...['RHV_IVC', RHV_FORK_PIECE].map((id) => drawnShare(id, end[0], end[1], end[2])?.share ?? Infinity));
  assert.ok(trunk < 0.5, `tip is in the trunk's lumen (${trunk.toFixed(2)} of its radius off the centreline)`);
  for (const id of rhvBranchIds()) assert.ok((drawnShare(id, end[0], end[1], end[2])?.share ?? Infinity) > trunk, `the tip is nearer the trunk than ${id}`);
  assert.ok(CATHETER_RADIUS < NETWORK_BY_ID.get('RHV_IVC')!.radius * 0.5);
  assert.ok(BALLOON_RADII[1] < NETWORK_BY_ID.get('RHV_IVC')!.radius, 'the balloon fits the lumen');
});
