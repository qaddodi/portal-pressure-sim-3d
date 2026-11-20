import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BALLOON_RADII, CATHETER_RADIUS, CATHETER_ROUTE } from '../src/scene/catheter.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { NETWORK_BY_ID, courseOf } from '../src/scene/vessels/network.ts';
import { TIP_ALONG_RHV } from '../src/scene/catheter-route.ts';
import { CelScene } from '../src/scene/scene.ts';

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

test('the route runs on the 2D figure\'s own vessels: neck, SVC, atrium, IVC, then out the right hepatic vein', () => {
  const r = CATHETER_ROUTE;
  const near = (id: string, at: number, tol = 0.02) => {
    const c = courseOf(id)[Math.round(at * 63)]!;
    return r.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < tol);
  };
  assert.ok(near('SVC_RA', 1), 'through the atrium');
  assert.ok(near('IVC_IS', 0.8, 0.03), 'down the IVC');
  assert.ok(near('RHV_IVC', 0.5), 'into the right hepatic vein');
  assert.ok(r[0]![1] > y3(0), 'it starts above the neck of the figure\'s SVC');
  // goes down the column and out to the viewer\'s left, never doubling back upward
  for (let i = 1; i < r.length; i++) assert.ok(r[i]![1] <= r[i - 1]![1] + 0.12, 'no climbing back');
  // the depth eases between the cava and the vein, with no jump
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i]![2] - r[i - 1]![2]) < 0.12, `z step at ${i}`);
});

test('the tip ends 62 % of the way along the right hepatic vein, inside its course, and the catheter is thinner than the vein', () => {
  const end = CATHETER_ROUTE.at(-1)!;
  const sc = (p: readonly (readonly [number, number])[]) => p.map(([x, y]): [number, number] => [x3(x), y3(y)]), a = sc(EDGE_PATH_2D.RHV_IVC!), b = sc(EDGE_PATH_2D.RHV_IVC_1!);   // (the vein's whole 2D course: the drawn host stops at its split, its children carry the course on)
  const chain = [...[...a].reverse(), ...[...b].reverse()];
  const near = Math.min(...chain.map((p) => Math.hypot(p[0] - end[0], p[1] - end[1])));
  assert.ok(near < 0.01, `tip is on the vein (${near})`);
  const len = (pts: readonly (readonly number[])[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0]! - pts[i]![0]!, p[1]! - pts[i]![1]!), 0);
  const upTo = chain.findIndex((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) === near);
  assert.ok(Math.abs(len(chain.slice(0, upTo + 1)) / len(chain) - TIP_ALONG_RHV) < 0.03);
  assert.ok(CATHETER_RADIUS < NETWORK_BY_ID.get('RHV_IVC')!.radius * 0.5);
  assert.ok(BALLOON_RADII[1] < NETWORK_BY_ID.get('RHV_IVC')!.radius, 'the balloon fits the lumen');
});
