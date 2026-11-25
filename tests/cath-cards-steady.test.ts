// The catheter's reading cards (FHVP, WHVP, the HVPG stack, the EUS-PPG's PV and HV) stand steady: they ease in once and stay. Mohammad, 20 Nov: "these callouts for HVPG and for EUS-PPG and stuff
// keep flashing in and out of existence". Root cause: the controller took ANY 0.35 px move of the catheter's tip (a tilt, the camera following the tip, the scope bending) for a cut of the picture, and a cut
// fades every card out and brings it back FADE.settleMs after; and a card placed again at a pixel's difference was a new key, so it faded out and in too. Now a small move is CARRIED (the cards ride
// their points and glide when placed again, as 2D's stage-cath.js pins a reading to its point in the world), and only a real jump hides them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { CathShow } from '../src/scene/labels/cath-show.ts';

const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

function world(cath: 'free' | 'wedge' | 'result') {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, dx = 0, dy = 0;
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => { rig.project(p, o); o.x += dx; o.y += dy; return o; }, cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => 5.2, level: () => 'all',
    cathere: (tip: Vector3, ahead: Vector3) => { tip.set(0.02, 0.02, 0); ahead.set(0.1, 0.12, 0); return 2; },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath });
  const step = (ms: number, each?: () => void) => { for (let i = 0; i < ms / 16; i++) { t += 16; each?.(); ctl.tick(); } };
  return { ctl, step, move: (x: number, y = 0) => { dx += x; dy += y; } };
}

test('a card comes in once and a tilt (the tip drifting under a pixel a frame) never takes it out', () => {
  const w = world('wedge');
  w.step(2500);
  assert.equal(w.ctl.cath.pills.length, 2); assert.ok(w.ctl.cath.pills.every((p) => p.alpha === 1), 'both cards whole');
  const x0 = w.ctl.cath.pills[0]!.x;
  let dipped = 0, gone = 0;
  w.step(4000, () => w.move(0.2, 0.1));   // 12 px a second for 4 s, in sub-pixel steps
  w.step(0, () => {});
  for (let i = 0; i < 250; i++) { w.move(0.2, 0.1); w.step(16); if (w.ctl.cath.pills.length < 2) gone++; else if (w.ctl.cath.pills.some((p) => p.alpha < 1)) dipped++; }
  assert.equal(gone, 0, 'a card never leaves while the tip drifts');
  assert.equal(dipped, 0, 'a card never dims while the tip drifts');
  assert.ok(Math.abs(w.ctl.cath.pills[0]!.x - x0) > 20, 'it rode its point instead');
});

test('the result\'s stack stands steady through the same drift', () => {
  const w = world('result');
  w.step(3000);
  assert.ok(w.ctl.cath.sum && w.ctl.cath.sum.alpha === 1);
  let bad = 0;
  for (let i = 0; i < 300; i++) { w.move(0.25, -0.1); w.step(16); const s = w.ctl.cath.sum; if (!s || s.alpha < 1 || s.lead < 1 || s.calcAlpha < 1) bad++; }
  assert.equal(bad, 0);
});

test('a real jump of the tip (a cut) still hides the cards, and they ease back once the picture is still', () => {
  const w = world('wedge');
  w.step(2500);
  w.move(300); w.step(16); w.step(80);
  assert.ok(w.ctl.cath.pills.length === 0 || w.ctl.cath.pills.every((p) => p.alpha < 1), 'going');
  w.step(2500);
  assert.equal(w.ctl.cath.pills.length, 2); assert.ok(w.ctl.cath.pills.every((p) => p.alpha === 1));
});

test('a card placed again at a pixel\'s difference glides there; it does not fade out and in', () => {
  const base = { vp: { w: 1280, h: 800 }, cath: 'free' as const, measure, band: { x0: 0, y0: 56, x1: 1280, y1: 800 }, blockers: [], tip: [600, 400] as [number, number], ahead: [650, 330] as [number, number], got: 2 as const, text: { f: '5.0', w: '16.5', h: '11.5', hv: 11.5 } };
  const show = new CathShow();
  show.solve(base); for (let i = 0; i < 60; i++) show.step(16, false);
  const was = show.frame.pills[0]!;
  show.solve({ ...base, tip: [603, 401] });
  show.step(16, false);
  const first = show.frame.pills[0]!;
  assert.equal(first.alpha, 1, 'not dimmed');
  assert.ok(Math.abs(first.x - was.x) < 4 && Math.abs(first.y - was.y) < 4, 'continuous: no jump');
  for (let i = 0; i < 60; i++) { show.step(16, false); assert.equal(show.frame.pills[0]!.alpha, 1); }
});

test('the controller carries a small move of the tip and only cuts for a jump', () => {
  const c = readFileSync(new URL('../src/scene/labels/controller.ts', import.meta.url), 'utf8');
  assert.match(c, /const cutPt = /);
  assert.match(c, /else if \(slidPt\(nowTip, this\.cTipPx\)/);
  assert.match(c, /this\.show\.ride\(this\.cutCard \? this\.cutCard\.tip : this\.cTipPx, this\.cutCard \? this\.cutCard\.ahead : this\.cAheadPx\)/);   // (9c859999: a card cut by a change rides the points it was cut at)
  assert.doesNotMatch(c, /movedPt/, 'no 0.35 px move of the catheter\'s tip is a cut any more');
});
