// Mohammad, 20 Nov: "why does panning in the circuit or lobule view make the labels hide, but not in anatomy?" Root cause: the Circuit's and the Lobule's captions each had their own copy of "come in
// once the picture is still, go the moment anything moves", while the Anatomy's labels ride the camera. One rule now (labels/ride.ts), used by all three views' captions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FADE } from '../src/scene/labels/alpha.ts';
import { FOLLOW_JUMP, Ride, RoomFade, boxesFit, type Pt } from '../src/scene/labels/ride.ts';

/** A picture: a map point at the origin `at`, scaled by `k`; two reference points 100 units apart on it. */
function rig(opts: { layout?: () => string; fits?: () => boolean } = {}) {
  const r = new Ride();
  let t = 1000, at = { x: 300, y: 200 }, k = 1, moving = false, layoutNow = 'a';
  const layout = opts.layout ?? (() => layoutNow);
  const step = (ms = 16) => {
    let out = r.step({ now: t, dt: 16, on: true, moving, a: { x: at.x, y: at.y }, b: { x: at.x + 100 * k, y: at.y }, layout, fits: opts.fits ?? (() => true) });
    for (let i = 16; i < ms; i += 16) { t += 16; out = r.step({ now: t, dt: 16, on: true, moving, a: { x: at.x, y: at.y }, b: { x: at.x + 100 * k, y: at.y }, layout, fits: opts.fits ?? (() => true) }); }
    t += 16;
    return out;
  };
  return { r, step, set: (o: { at?: { x: number; y: number }; k?: number; moving?: boolean; layout?: string }) => { if (o.at) at = o.at; if (o.k) k = o.k; if (o.moving !== undefined) moving = o.moving; if (o.layout) layoutNow = o.layout; } };
}
/** Bring the captions in: placed once the picture is still, fully faded in. */
function standing(g: ReturnType<typeof rig>) { let solves = 0; for (let i = 0; i < 80; i++) { if (g.step().solve) solves++; } assert.equal(solves, 1, 'placed once'); assert.equal(g.r.alpha, 1); }

test('the captions come in once the picture is still, and are placed once', () => {
  const g = rig();
  const first = g.step();
  assert.equal(first.alpha, 0, 'nothing is shown before the picture has been still');
  standing(g);
});

test('a pan carries the captions: they stay shown the whole way and their dots follow the picture', () => {
  const g = rig(); standing(g);
  g.set({ moving: true });
  const p: Pt = { x: 0, y: 0 };
  for (let i = 1; i <= 30; i++) {
    g.set({ at: { x: 300 + i * 6, y: 200 - i * 2 } });
    const out = g.step();
    assert.equal(out.alpha, 1, `frame ${i}: never hidden while the camera pans`);
    assert.equal(out.solve, false, 'and never placed again mid-pan');
    g.r.ride(320, 230, p);
    assert.ok(Math.abs(p.x - (320 + i * 6)) < 1e-9 && Math.abs(p.y - (230 - i * 2)) < 1e-9, 'the dot rides the picture');
  }
});

test('a zoom carries the dots with the scale, about the picture (a dot twice as far from the reference is twice as far)', () => {
  const g = rig(); standing(g);
  g.set({ moving: true, k: 2, at: { x: 300, y: 200 } });
  g.step();
  const p: Pt = { x: 0, y: 0 };
  g.r.ride(350, 200, p);   // 50 px right of the reference point, now twice as far
  assert.ok(Math.abs(p.x - 400) < 1e-9 && Math.abs(p.y - 200) < 1e-9, `x ${p.x} y ${p.y}`);
});

test('a pan that keeps every caption clear just keeps its places: no new placement, no fade', () => {
  let fits = true;
  const g = rig({ fits: () => fits }); standing(g);
  g.set({ moving: true, at: { x: 340, y: 220 } }); for (let i = 0; i < 5; i++) g.step();
  g.set({ moving: false });
  let solves = 0, minAlpha = 1;
  for (let i = 0; i < 60; i++) { const o = g.step(); if (o.solve) solves++; minAlpha = Math.min(minAlpha, o.alpha); }
  assert.equal(solves, 0); assert.equal(minAlpha, 1);
  void fits;
});

test('a pan after which a caption no longer fits fades the words out where they stand, places them again at the fade\'s end, and fades them in: nothing pops', () => {
  let fits = true;
  const g = rig({ fits: () => fits }); standing(g);
  g.set({ moving: true, at: { x: 340, y: 220 } }); for (let i = 0; i < 5; i++) g.step();
  fits = false; g.set({ moving: false });
  const alphas: number[] = []; let solveAt = -1;
  for (let i = 0; i < 80; i++) { const o = g.step(); alphas.push(o.alpha); if (o.solve) { solveAt = i; fits = true; } }
  assert.ok(solveAt > 0, 'placed again');
  assert.equal(alphas[solveAt - 1], 0, 'placed only once it was out');
  // never an instant change: each frame's alpha differs from the one before by at most one frame's share of the fade
  for (let i = 1; i < alphas.length; i++) assert.ok(Math.abs(alphas[i]! - alphas[i - 1]!) <= 16 / Math.min(FADE.inMs, FADE.outMs) + 1e-9, `step ${i}`);
  assert.equal(alphas[alphas.length - 1], 1, 'in again');
  assert.ok(alphas.some((a) => a === 0), 'it was out when it was placed');
});

test('a new layout (a card, the level, a zoom) fades out, is placed at the fade\'s end, and fades in', () => {
  const g = rig(); standing(g);
  g.set({ layout: 'b' });
  const alphas: number[] = []; let solves = 0;
  for (let i = 0; i < 80; i++) { const o = g.step(); alphas.push(o.alpha); if (o.solve) solves++; }
  assert.equal(solves, 1);
  for (let i = 1; i < alphas.length; i++) assert.ok(Math.abs(alphas[i]! - alphas[i - 1]!) <= 16 / Math.min(FADE.inMs, FADE.outMs) + 1e-9);
  assert.equal(alphas[alphas.length - 1], 1);
});

test('a dot that jumps (a cut) is not carried: the words fade out, never in one frame, and come back placed again once the picture is still', () => {
  const g = rig(); standing(g);
  g.set({ at: { x: 300 + FOLLOW_JUMP + 40, y: 200 } });
  const o = g.step();
  assert.ok(o.alpha > 0 && o.alpha < 1, `easing out, not gone: ${o.alpha}`);
  const alphas = [o.alpha]; let solves = 0;
  for (let i = 0; i < 90; i++) { const q = g.step(); alphas.push(q.alpha); if (q.solve) solves++; }
  assert.equal(solves, 1, 'placed again');
  assert.equal(alphas[alphas.length - 1], 1);
  for (let i = 1; i < alphas.length; i++) assert.ok(Math.abs(alphas[i]! - alphas[i - 1]!) <= 16 / Math.min(FADE.inMs, FADE.outMs) + 1e-9);
});

test('another view (or this one on its way): the words fade out and are placed again when it stands', () => {
  const r = new Ride();
  const frame = (on: boolean, t: number) => r.step({ now: t, dt: 16, on, moving: false, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, layout: () => 'a', fits: () => true });
  let t = 0, solves = 0;
  for (let i = 0; i < 60; i++) { if (frame(true, t += 16).solve) solves++; }
  assert.equal(r.alpha, 1);
  frame(false, t += 16);
  assert.ok(r.alpha > 0 && r.alpha < 1, 'out by easing');
  for (let i = 0; i < 60; i++) frame(false, t += 16);
  assert.equal(r.alpha, 0);
  for (let i = 0; i < 60; i++) { if (frame(true, t += 16).solve) solves++; }
  assert.equal(solves, 2); assert.equal(r.alpha, 1);
});

test('boxesFit judges the carried boxes against the view and the cards', () => {
  const view = { x0: 0, y0: 50, x1: 400, y1: 400 };
  const ride = (x: number, y: number, out: Pt) => { out.x = x + 10; out.y = y; return out; };
  const it = { ax: 100, ay: 100, dx: 5, dy: -20, w: 60, h: 14 };
  assert.equal(boxesFit([it], ride, view, []), true);
  assert.equal(boxesFit([{ ...it, ax: 380 }], ride, view, []), false, 'past the edge');
  assert.equal(boxesFit([it], ride, view, [{ x0: 110, y0: 70, x1: 300, y1: 300 }]), false, 'under a card');
});

test('a caption carried under a card or past the edge fades out whole over FADE.roomMs and back once it stands clear (RoomFade, one rule for every view)', () => {
  const f = new RoomFade(), view = { x0: 0, y0: 0, x1: 500, y1: 500 }, card = { x0: 100, y0: 100, x1: 200, y1: 200 };
  const box = { x0: 150, y0: 150, x1: 190, y1: 164 }, clear = { x0: 300, y0: 300, x1: 340, y1: 314 };
  assert.equal(f.of('a', clear, view, [card], 16), 1, 'first drawn as it stands');
  const a1 = f.of('a', box, view, [card], 16);
  assert.ok(a1 > 0 && a1 < 1, 'easing out, not gone in a frame');
  for (let i = 0; i < 20; i++) f.of('a', box, view, [card], 16);
  assert.equal(f.of('a', box, view, [card], 16), 0);
  for (let i = 0; i < 20; i++) f.of('a', clear, view, [card], 16);
  assert.equal(f.of('a', clear, view, [card], 16), 1);
});

test('the Circuit\'s and the Lobule\'s captions use the one rule, and keep no hide-while-moving of their own', () => {
  for (const f of ['src/scene/circuit/CircuitCaptions.tsx', 'src/scene/lobule/LobuleCaptions.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /new Ride\(\)/, f);
    assert.match(src, /new RoomFade\(\)/, f);
    assert.ok(!/lastMove|SETTLE_MS|FADE_MS/.test(src), `${f} has its own copy of the hide-while-moving rule`);
  }
  assert.ok(!/private roomOf|room = new Map/.test(readFileSync('src/scene/labels/controller.ts', 'utf8')), 'the controller uses RoomFade, not a copy');
});
