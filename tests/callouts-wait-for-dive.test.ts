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

test('one gate, every readout: the station names, the catheter\'s and procedures\' cards and the probes\' readings all stand aside while the camera dives, and ease back after', () => {
  const layer = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.match(layer, /hidden: \(\) => cel\.circuit\.t > 0 \|\| cel\.circuit\.toCircuit \|\| cel\.diving/, 'the station names');
  assert.match(layer, /probeLabels\.paint\(!cel\.diving, fr\.dt\)/, 'the probes\' readings');
  const dom = readFileSync('src/scene/labels/probe-labels-dom.ts', 'utf8');
  assert.match(dom, /s\.alpha \* gate/); assert.match(dom, /d\.alpha \* gate/);
  const ctl = readFileSync('src/scene/labels/controller.ts', 'utf8');
  assert.match(ctl, /const all = d\.hidden\?\.\(\) \? \[\] : this\.active\(\);/);
  assert.match(ctl, /const here = d\.anatomy \? d\.anatomy\(\) : true;/, 'the catheter\'s and the procedures\' cards');
});

test('a station name leaves a dive in steps of a soft curve, never in one frame: 240 ms, starting and ending gently', () => {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, hidden = false;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => 5, level: () => 'all', hidden: () => hidden, cathere: () => 0,
  } as unknown as LabelDeps;
  const ctl = new LabelController(d);
  for (let i = 0; i < 200; i++) { t += 16; ctl.tick(); }
  const before = ctl.out.filter((o) => o.kind === 'station');
  assert.ok(before.length > 0 && before.every((o) => o.alpha === 1), 'names standing');
  hidden = true;
  const a: number[] = [];
  for (let i = 0; i < 20; i++) { t += 16; ctl.tick(); const o = ctl.out.find((x) => x.id === before[0]!.id); a.push(o ? o.alpha : 0); }
  assert.ok(a[0]! > 0.9, `no cut in the first frame (${a[0]})`);
  assert.ok(a.some((v) => v > 0.1 && v < 0.9), 'seen part-way');
  assert.equal(a[a.length - 1], 0);
  assert.ok(a.every((v, i) => i === 0 || v <= a[i - 1]! + 1e-9), 'monotonic');
});
