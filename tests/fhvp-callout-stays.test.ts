// Mohammad, 25 Nov (iPhone, HVPG and PPG 3/15): "when the callout FHVP appears it flickers before it settles".
// Root cause: the controller took every change of how far the catheter has come (`got`: 0 nothing, 1 the tip, 2 the balloon up) for a cut of the picture, and a cut fades every card out and brings it back
// FADE.settleMs after. The balloon goes up (Next, slide 3 to 4) and comes down (Back) with the tip standing still, so the FHVP, which stays where it was taken the whole time, dipped from 1 to 0 and returned
// 270 ms later: a card that never moved, flashing. Now a change of `got` is a cut only for a card it takes away (or the first free reading to come); the card it brings (the WHVP) is an arrival of its own.
// The live pieces together at a phone's size (the real scene's catheter and route, the deck's catheter clock, the chase camera, the real label controller), stepped at 16 ms, through every step of the talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { makeCathClock, aimCath, stepCath, poseAt, readTaken } from '../src/ui/deck/cath-clock.ts';
import { tipCloseShot } from '../src/ui/deck/cath-shot.ts';
import { hvpgChase, type ChasePose } from '../src/scene/camera/chase.ts';
import { calloutNeeds, calloutsFor } from '../src/scene/labels/cath-show.ts';
import type { CathState } from '../src/decks/schema.ts';

const vp = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const FREE = { x0: 0, y0: 279, x1: 393, y1: 599 };

test('what a card needs of the catheter is one rule', () => {
  assert.equal(calloutNeeds('f'), 1, 'the free reading stands with the tip');
  assert.equal(calloutNeeds('w'), 2, 'the wedged reading needs the balloon up');
  assert.equal(calloutNeeds('s'), 2, 'the stack needs the balloon up');
});

test('the FHVP callout never dips while the balloon goes up and down under it, and each card eases in once', () => {
  const cel = new CelScene(), room = { x: 0, y: 279, w: 393, h: 320 };
  cel.rig.resize(vp.w, vp.h);
  let t = 1000; const now = () => t;
  const cc = makeCathClock(); aimCath(cc, 'route');
  const d = {
    now, project: (p: Vector3, o: { x: number; y: number }) => cel.rig.project(p, o), cameraMoving: () => cel.rig.isMoving, hand: () => cel.rig.handView,
    free: () => FREE, view: () => ({ x0: 0, y0: 59, x1: vp.w, y1: vp.h - 34 }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: (k: string) => (k === 'fhvp' ? 5.2 : k === 'whvp' ? 17.4 : k === 'hvpg' ? 12.2 : null), level: () => 'all', anatomy: () => true,
    cathere: (tip: Vector3, ahead: Vector3) => {
      const c = cel.catheter;   // (LabelLayer's own rule)
      if (c.current.advance < 0.999 || !cel.catheterRead || !cel.procPoints('hvpg', tip, ahead)) return 0;
      return c.current.balloon >= 0.999 ? 2 : 1;
    },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath: 'route' });
  const P = { advance: 0, balloon: 0, column: 0 }, chase: ChasePose = { yaw: 0, pitch: 0, dist: 1, fov: 14, target: [0, 0, 0] };
  let drawn = false, readWas = false;
  const frame = () => {
    t += 16;
    const moving = stepCath(cc, 16, 64), rd = readTaken(cc.clk.t);
    if (moving || !drawn || rd !== readWas) { readWas = rd; poseAt(cc.clk.t, P); cel.setCatheter({ advance: P.advance, balloon: P.balloon, column: P.column, read: rd }); drawn = true; cel.rig.setChase(hvpgChase(P.advance, chase)); }
    cel.rig.update(t); cel.procs.update(t); ctl.tick();
  };
  const settle = (ms: number) => { for (let i = 0; i < ms / 16; i++) frame(); };
  const alpha = (id: 'f' | 'w') => ctl.cath.pills.find((p) => p.id === id)?.alpha ?? 0;

  settle(14000);   // the way in
  const stats: string[] = [];
  const go = (to: CathState, jump = false) => {
    const from = ctl.cath.pills.map((p) => p.id), stays = calloutsFor(to).includes('f') && alpha('f') >= 0.999;
    ctl.setState({ ...NO_STATE, cath: to }); aimCath(cc, to, jump); drawn = false;
    const shot = tipCloseShot('tip'); if (shot) cel.goTo(shot, room, t);
    let dipped = 0, wBack = 0, wWas = alpha('w'), fWas = alpha('f'), fFull = fWas >= 0.999;
    for (let i = 0; i < 1200; i++) {
      frame();
      const f = alpha('f'), w = alpha('w');
      if (stays && f < 0.999) dipped++;                    // the free reading was on show and stays on show: it never dips
      if (w < wWas - 1e-9 && w > 0 && calloutsFor(to).includes('w') && w < 0.999 && wWas > 0 && fFull) wBack++;   // the wedged one eases in: it never steps back while it comes
      wWas = w; fWas = f; if (f >= 0.999) fFull = true;
    }
    stats.push(`${from.join('') || '-'} -> ${to}: dipped ${dipped}, w stepped back ${wBack}, f ${alpha('f').toFixed(2)}, w ${alpha('w').toFixed(2)}`);
    assert.equal(dipped, 0, `the FHVP callout stays steady going to ${to} (dipped in ${dipped} frames)`);
    assert.equal(wBack, 0, `the WHVP eases in once going to ${to}`);
  };
  go('free');      // Next from the way in: the callout comes with the tracing
  assert.ok(alpha('f') >= 0.999, 'the FHVP callout is up on the free step');
  go('wedge');     // the balloon goes up under it: the FHVP stays, the WHVP comes
  assert.ok(alpha('f') >= 0.999 && alpha('w') >= 0.999, 'FHVP and WHVP stand on the wedge step');
  go('free');      // Back: the balloon lets down under it: the FHVP stays, the WHVP leaves
  assert.ok(alpha('f') >= 0.999 && alpha('w') === 0, 'only the FHVP stands again');
  go('wedge');
  go('result');    // the stack takes the cards' place
  go('wedge');
  go('free');
  console.log(stats.join('\n'));
});
