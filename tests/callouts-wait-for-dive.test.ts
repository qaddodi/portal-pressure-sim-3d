// Mohammad, 22 Nov: the pressure callouts hung over the lobule mid-dive. One rule gates every readout callout on a settled picture: the body's anatomy standing still (never in a dive to the lobule or sinusoid,
// going in or coming back) and the reading settled (cath-callout-waits-for-tracing.test.ts). The label layer's `anatomy` dep says it, from the scene's `diving`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';

const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

test('the catheter\'s cards leave as soon as the dive starts and come back only after the body is settled again', () => {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, diving = false;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => 5.2, level: () => 'all', anatomy: () => !diving,
    cathere: (tip: Vector3, ahead: Vector3) => { tip.set(0.02, 0.02, 0); ahead.set(0.1, 0.12, 0); return 2; },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath: 'wedge' });
  const step = (ms: number) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } };
  step(2500);
  assert.equal(ctl.cath.pills.length, 2, 'standing');
  diving = true; step(600);
  assert.equal(ctl.cath.pills.length, 0, 'gone while diving');
  let seen = 0; for (let i = 0; i < 300; i++) { step(16); seen += ctl.cath.pills.length; }
  assert.equal(seen, 0, 'never shown during the dive');
  diving = false; step(3000);
  assert.equal(ctl.cath.pills.length, 2, 'back once settled');
});

test('the label layer\'s anatomy is the settled body: no dive in either direction', () => {
  assert.match(readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), /anatomy: \(\) => cel\.view === 'body' && cel\.circuit\.t === 0 && !cel\.circuit\.toCircuit && !cel\.diving/);
  assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /get diving\(\): boolean \{ return this\.inDive\(\); \}/);
});
