import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';

// Mohammad 21 Nov: running the EUS-PPG from the Tests card showed no callouts. Cause: since the cards were made to ride their points (2cc71fe0) the controller solved them only once the picture had rested
// (nothing sliding for FOLLOW_MS); while the points slide (a tilt, a follow, the scope bending) it never rests, so a card that came during it (the PV, then the HV, then the result) never appeared. The cards
// ride their points, so they are placed at once; only the names wait for the rest.
const vp = { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const proc = (kinds: string[]) => ({ kinds, sig: kinds.join(''), kickers: { f: 'HV', w: 'PV', h: '' }, tones: { f: 'free', w: 'pv' }, text: { f: '5.0', w: '12', h: '', hv: null }, points: (a: Vector3, b: Vector3) => { a.set(0.02, 0.02, 0); b.set(0.1, 0.12, 0); return true; } });

function world() {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, dx = 0;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => { rig.project(p, o); o.x += dx; return o; }, cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => null, level: () => 'all', anatomy: () => true, cathere: () => 0,
  } as unknown as LabelDeps;
  const ctl = new LabelController(d);
  return { ctl, tick: (ms: number, drift = 0) => { for (let i = 0; i < ms / 16; i++) { t += 16; dx += drift; ctl.tick(); } } };
}

test('a reading card that comes while the points slide (never at rest) still comes in, whole', () => {
  const w = world();
  w.ctl.setState({ ...NO_STATE, quiet: true, proc: proc([]) as never });
  w.tick(300);
  w.tick(200, 0.6);                                   // the tip slides 0.6 px a frame from here on
  w.ctl.setState({ ...NO_STATE, quiet: true, proc: proc(['w']) as never });
  w.tick(1500, 0.6);
  assert.deepEqual(w.ctl.cath.pills.map((p) => p.alpha), [1], 'the PV card is up while sliding');
  w.ctl.setState({ ...NO_STATE, quiet: true, proc: proc(['w', 'f']) as never });
  w.tick(1500, 0.6);
  assert.deepEqual(w.ctl.cath.pills.map((p) => p.alpha), [1, 1], 'and the HV card comes after it');
});
