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
  assert.equal(boxesFit([], ride, view, []), false, 'nothing placed is nothing to keep: a cold start that solved to no names is placed again once the picture has moved');
});

test('a solve that placed nothing is placed again when the picture comes to rest somewhere else (cold ?slide= start: the closer boot view, then the real framing)', () => {
  const r = new Ride(); let t = 1000;
  const pts = (x: number) => ({ a: { x, y: 100 }, b: { x: x + 100, y: 100 }, c: { x: x + 100, y: 200 }, d: { x, y: 200 } });
  const run = (x: number, ms: number, moving: boolean) => { let out = r.step({ now: t, dt: 16, on: true, moving, ...pts(x), layout: () => 'L', fits: (ride) => boxesFit([], ride, { x0: 0, y0: 0, x1: 500, y1: 500 }, []) }); for (let k = 0; k < ms / 16; k++) { t += 16; out = r.step({ now: t, dt: 16, on: true, moving, ...pts(x), layout: () => 'L', fits: (ride) => boxesFit([], ride, { x0: 0, y0: 0, x1: 500, y1: 500 }, []) }); if (out.solve) return true; } return false; };
  assert.equal(run(50, 2000, false), true, 'solved once at rest');
  assert.equal(run(50, 1000, false), false, 'and not again while nothing changes');
  run(80, 300, true);
  assert.equal(run(80, 2000, false), true, 'the picture moved and came to rest: nothing was placed to keep, so it is placed again');
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

// Mohammad 20 Nov ("random labels"): the Lobule's tract names stood in the empty field right of the lobule, their dots far off the vessels they name. Root cause: the dots were carried by a similarity
// read from two points, which cannot follow a tilted plate (or a dolly over one), and at rest a carry whose boxes still fit was kept as the new truth, so the error stayed. Four references now give the
// plate's own perspective map: exact for every dot on the plate, under any camera.
test('with four references a dot rides a tilted plate exactly: every carried dot stays on the plate point it names, after a zoom out and a tilt', () => {
  /** A pinhole camera at height dist over the plate's point (cx, cy), tilted by `tilt` about the screen's x axis: plate (x, y, 0) to screen px. */
  const cam = (dist: number, tilt: number, cx: number, cy: number) => (x: number, y: number): Pt => {
    const px = x - cx, py = y - cy, c = Math.cos(tilt), s = Math.sin(tilt);
    const yy = py * c, zz = dist + py * s, f = 900;
    return { x: 640 + f * px / zz, y: 400 + f * yy / zz };
  };
  const plate: [number, number][] = [[0, 0], [0.9, 0.05], [-0.7, 0.6], [0.95, -0.4], [0.3, 0.85], [-0.9, -0.5]];
  const r = new Ride();
  let t = 1000;
  const feed = (P: (x: number, y: number) => Pt, moving: boolean) => r.step({ now: (t += 16), dt: 16, on: true, moving, a: P(0, 0), b: P(1, 0), c: P(1, 1), d: P(0, 1), layout: () => 'a', fits: () => true });
  const before = cam(2.2, 0, 0.1, 0);
  for (let i = 0; i < 80; i++) feed(before, false);
  assert.equal(r.alpha, 1);
  const solved = plate.map(([x, y]) => before(x, y));
  // zoom out and tilt 25 degrees, a frame at a time, then rest
  let after = before;
  for (let i = 1; i <= 40; i++) { after = cam(2.2 + 1.3 * i / 40, (25 * Math.PI / 180) * i / 40, 0.1 - 0.2 * i / 40, 0); feed(after, true); }
  for (let i = 0; i < 80; i++) feed(after, false);
  const p: Pt = { x: 0, y: 0 };
  plate.forEach(([x, y], i) => {
    r.ride(solved[i]!.x, solved[i]!.y, p);
    const want = after(x, y);
    assert.ok(Math.hypot(p.x - want.x, p.y - want.y) < 0.01, `plate point ${x},${y}: carried to ${p.x.toFixed(1)},${p.y.toFixed(1)}, drawn at ${want.x.toFixed(1)},${want.y.toFixed(1)}`);
  });
  // (the two-point similarity it replaces misses by many px on the same move)
  const two = new Ride();
  t = 1000;
  for (let i = 0; i < 80; i++) two.step({ now: (t += 16), dt: 16, on: true, moving: false, a: before(0, 0), b: before(1, 0), layout: () => 'a', fits: () => true });
  two.step({ now: (t += 16), dt: 16, on: true, moving: true, a: after(0, 0), b: after(1, 0), layout: () => 'a', fits: () => true });
  two.ride(solved[2]!.x, solved[2]!.y, p);
  assert.ok(Math.hypot(p.x - after(-0.7, 0.6).x, p.y - after(-0.7, 0.6).y) > 5, 'a similarity cannot carry a tilted plate');
});

test('the Circuit\'s and the Lobule\'s captions give the ride four corners of a square on their plate', () => {
  for (const f of ['src/scene/circuit/CircuitCaptions.tsx', 'src/scene/lobule/LobuleCaptions.tsx']) assert.match(readFileSync(f, 'utf8'), /a: pa, b: pb, c: pc, d: pd/, f);
});

test('after a pan comes to rest and the words still fit, the dots stay where the picture took them (they snapped back to where they stood before the pan: "random labels", 20 Nov)', () => {
  const g = rig(); standing(g);
  g.set({ moving: true });
  for (let i = 1; i <= 10; i++) { g.set({ at: { x: 300 - i * 20, y: 200 } }); g.step(); }
  g.set({ moving: false, k: 1 });
  let solves = 0;
  for (let i = 0; i < 80; i++) if (g.step().solve) solves++;
  assert.equal(solves, 0, 'kept, not placed again');
  const p: Pt = { x: 0, y: 0 };
  g.r.ride(320, 230, p);
  assert.ok(Math.abs(p.x - 120) < 1e-9 && Math.abs(p.y - 230) < 1e-9, `the dot stays on the picture at rest: ${p.x},${p.y}`);
  // and after a zoom at rest as well
  g.set({ moving: true, k: 1.5 }); g.step(); g.set({ moving: false });
  for (let i = 0; i < 80; i++) g.step();
  g.r.ride(350, 200, p);   // 50 px right of the reference when solved
  assert.ok(Math.abs(p.x - (100 + 75)) < 1e-9, `scaled about the picture at rest: ${p.x}`);
});
