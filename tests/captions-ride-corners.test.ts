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

test('ride with the last real corners (the view gone) leaves every dot where it is; collapsed corners would take it to the corner', () => {
  const r = new Ride();
  const a = { x: 100, y: 100 }, b = { x: 300, y: 100 }, c = { x: 300, y: 300 }, d = { x: 100, y: 300 };
  const base = { now: 0, dt: 16, moving: false, layout: () => 'x', fits: () => true } as const;
  for (let i = 0; i < 40; i++) r.step({ ...base, now: i * 100, on: true, a, b, c, d });
  const keep = r.ride(150, 150);
  r.step({ ...base, now: 5000, on: false, a, b, c, d });
  assert.deepEqual([r.ride(150, 150).x, r.ride(150, 150).y], [keep.x, keep.y], 'frozen corners: the dot stays');
  const z = { x: 0, y: 0 };
  r.step({ ...base, now: 5016, on: false, a: z, b: z, c: z, d: z });
  assert.ok(Math.hypot(r.ride(150, 150).x - keep.x, r.ride(150, 150).y - keep.y) > 50, 'collapsed corners throw the dot away (what zeroing did)');
});
