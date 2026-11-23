// Mohammad 23 Nov: "the word occluded and no reading are flickering ... as the catheter is moving". The live pieces together (the real scene's catheter and route, the deck's catheter clock, the slide's pushes, the camera glide to
// the ostium shot, the real label controller), stepped at 16 ms. Root cause: the route's AHEAD point leaps ~150 px when the tip crosses into the next part of the route; the controller counted that leap as a cut and faded the
// tip's own tag (which never points to it) out and back, over and over, for as long as the catheter moved. A tag now judges only the points its cards point to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { OSTIUM_U } from '../src/scene/procedures/ostium.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { makeCathClock, aimCath, stepCath, poseAt, readTaken, ARRIVE_MS } from '../src/ui/deck/cath-clock.ts';
import { tipCloseShot } from '../src/ui/deck/cath-shot.ts';

const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
test('a blocked vein\'s tag stays steady while the catheter pushes and the camera glides', () => {
  const cel = new CelScene(); const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  cel.rig.resize(vp.w, vp.h);
  cel.procs.keptRing = 'bad';
  let t = 1000; const now = () => t;
  const cc = makeCathClock(); aimCath(cc, 'blocked');
  const d = {
    now, project: (p: Vector3, o: { x: number; y: number }) => cel.rig.project(p, o), cameraMoving: () => cel.rig.isMoving,
    hand: () => cel.rig.handView,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => null, level: () => 'all',
    anatomy: () => true,
    cathere: (tip: Vector3, ahead: Vector3, blocked?: boolean) => { const c = cel.catheter; if (blocked) return c.current.advance >= OSTIUM_U - 0.01 && cel.procPoints('hvpg', tip, ahead) ? 1 : 0; return 0; },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath: 'blocked' });
  // camera: the shot the blocked slide uses (ostium), glided to at the start
  const shot = tipCloseShot('ostium'); if (shot) cel.goTo(shot, room, 1000, 1100);
  let arrived = false, worst = 1, kickers = new Set<string>(), gone = 0;
  const PROBE0 = ARRIVE_MS + 300, PROBE_MS = 3600, t0 = t;
  for (let i = 0; i < 700; i++) {
    t += 16; const el = t - t0;
    const moving = stepCath(cc, 16, 64);
    if (moving || i === 0) { poseAt(cc.clk.t, P); cel.setCatheter({ advance: P.advance, balloon: P.balloon, column: P.column, read: readTaken(cc.clk.t) }); }
    if (el >= PROBE0 && el < PROBE0 + PROBE_MS) { const k = Math.min(1, (el - PROBE0) / PROBE_MS), u = OSTIUM_U + Math.sin(k * 3 * Math.PI) ** 2 * 0.02; cel.setCatheter({ advance: u, balloon: 0 }); }
    cel.rig.update(t); cel.procs.update(t); ctl.tick();
    const p = ctl.cath.pills[0];
    if (p && p.alpha >= 0.999) arrived = true;
    if (arrived) { if (!p) gone++; else { worst = Math.min(worst, p.alpha); kickers.add(p.reading.kicker); } }
  }
  assert.ok(arrived, 'the tag comes');
  assert.equal(gone, 0, 'the tag never leaves while the catheter moves');
  assert.ok(worst >= 0.999, `the tag never dips while the catheter pushes and the camera glides (lowest ${worst})`);
  assert.equal(kickers.size, 2, 'its words change once: Occluded, then No reading');
});
const P = { advance: 0, balloon: 0, column: 0 };
