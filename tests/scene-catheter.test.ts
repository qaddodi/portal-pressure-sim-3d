import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CATHETER_ROUTE } from '../src/scene/catheter.ts';
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
  assert.ok(end.x < -1, 'right side of the patient is the viewer\'s left');
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
