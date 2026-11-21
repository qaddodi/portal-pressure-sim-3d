// A view's captions are carried by four corners of its plate (labels/ride.ts). Zeroing the corners when the view is not showing collapsed the quad, and a name still fading out as the lobule went away was
// carried to the screen's corner: "Portal venule", "Sinusoids", "Central vein" jumped 700 to 1300 px in one frame at half opacity (21 Nov audit, Presinusoidal stop 7). The corners keep the last real read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ride } from '../src/scene/labels/ride.ts';

test('a fading name stays on its dot when its view goes away: the corners are never zeroed', () => {
  for (const f of ['src/scene/lobule/LobuleCaptions.tsx', 'src/scene/circuit/CircuitCaptions.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/pa\.x\s*=\s*pa\.y\s*=\s*pb\.x/.test(src), `${f} writes zeros into the ride's corners`);
  }
});

test('ride with the last real corners (the view gone) leaves every dot where it is; a leap of the corners is held, not carried', () => {
  const r = new Ride();
  const a = { x: 100, y: 100 }, b = { x: 300, y: 100 }, c = { x: 300, y: 300 }, d = { x: 100, y: 300 };
  const base = { now: 0, dt: 16, moving: false, layout: () => 'x', fits: () => true } as const;
  for (let i = 0; i < 40; i++) r.step({ ...base, now: i * 100, on: true, a, b, c, d });
  const keep = r.ride(150, 150);
  r.step({ ...base, now: 5000, on: false, a, b, c, d });
  assert.deepEqual([r.ride(150, 150).x, r.ride(150, 150).y], [keep.x, keep.y], 'frozen corners: the dot stays');
  const z = { x: 0, y: 0 };
  r.step({ ...base, now: 5016, on: false, a: z, b: z, c: z, d: z });
  assert.deepEqual([r.ride(150, 150).x, r.ride(150, 150).y], [keep.x, keep.y], 'and now even corners that leap (collapsed to the origin) are a cut: the carry is held, the dot stays (what zeroing did is gone at the root)');
});

test('a cut while the names are half faded moves nothing: the carry is held until they are placed again on the new picture', () => {
  const r = new Ride();
  const A = (x: number, y: number) => ({ a: { x, y }, b: { x: x + 200, y }, c: { x: x + 200, y: y + 200 }, d: { x, y: y + 200 } });
  const base = { dt: 16, moving: false, layout: () => 'x', fits: () => true, on: true } as const;
  let t = 0, solves = 0;
  const step = (x: number, y: number, o: { on?: boolean } = {}) => { t += 16; const out = r.step({ ...base, ...o, now: t, ...A(x, y) }); if (out.solve) solves++; return out; };
  for (let i = 0; i < 120; i++) step(100, 100);
  assert.equal(r.alpha, 1); assert.equal(solves, 1);
  const home = r.ride(150, 150);
  // the cut: the picture leaps 1,000 px; the names fade out, and for every frame they are visible they stay where they were
  let seen = 0;
  for (let i = 0; i < 80; i++) {
    const out = step(1100, 900);
    if (out.alpha > 0 && !out.solve) { seen++; const p = r.ride(150, 150); assert.ok(Math.hypot(p.x - home.x, p.y - home.y) < 1e-6, `frame ${i}: alpha ${out.alpha.toFixed(2)} but the dot moved to ${p.x},${p.y}`); }
  }
  assert.ok(seen > 3, 'they were visible for some frames after the cut');
  assert.equal(solves, 2, 'placed again once, on the new picture');
  const p = r.ride(1150, 950);
  assert.ok(Math.hypot(p.x - 1150, p.y - 950) < 1e-6, 'after the new placement the dots ride the new picture');
});

test('the Anatomy controller holds a cut the same way: names and cards fading out keep the places the dots stood at (cutAnchors, cutCard)', () => {
  const src = readFileSync('src/scene/labels/controller.ts', 'utf8');
  assert.match(src, /cutDot = true/);
  assert.match(src, /this\.cutAnchors = this\.anchors/);
  assert.match(src, /frozen\?\.get\(id\)/, 'a fading name is drawn at its frozen dot');
  assert.match(src, /this\.show\.ride\(this\.cutCard \? this\.cutCard\.tip : this\.cTipPx/, 'and the catheter cards ride the held points');
});
