// Slide 6 to 7 of the HVPG talk (Mohammad, 21 Nov): the catheter's FHVP, WHVP and HVPG numbers kept updating from the engine while they faded out, so they showed the NEXT patient's
// (3 or 4) on the outgoing slide's cards. Root cause: CathShow.setText wrote the live readings into every card on show, leaving or not. A card that is leaving keeps the numbers it had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';

const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

function world(cath: 'result') {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, live = 11.1;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => live, level: () => 'all',
    cathere: (tip: Vector3, ahead: Vector3) => { tip.set(0.02, 0.02, 0); ahead.set(0.1, 0.12, 0); return 2; },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath });
  const step = (ms: number) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } };
  return { ctl, step, setLive: (v: number) => { live = v; } };
}

test('the stack leaving with the slide keeps the numbers it had while the next patient loads', () => {
  const w = world('result');
  w.step(3000);
  const before = JSON.stringify(w.ctl.cath.sum?.rows.map((r) => r.value).concat(w.ctl.cath.sum?.calc.value ?? ''));
  assert.ok(w.ctl.cath.sum && before.includes('11'), before);
  w.ctl.setState({ ...NO_STATE, cath: null });   // the next slide: the card goes
  w.setLive(3.4);                                 // the next patient loads
  let seen = 0;
  for (let i = 0; i < 40; i++) {
    w.step(16);
    const s = w.ctl.cath.sum;
    if (!s) continue;
    seen++;
    assert.equal(JSON.stringify(s.rows.map((r) => r.value).concat(s.calc.value)), before, 'frozen while it fades');
  }
  assert.ok(seen > 0, 'it was on screen while fading');
});
