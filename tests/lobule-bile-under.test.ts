// The bile goes UNDER the blood, never through it (Mohammad, 20 Nov 2026: "bile ducts go right through blood vessels still in lobule"). Root cause: the bile part drew in the same tier as the vessels, writing depth, and
// its centre line (2D's lanes beside each sinusoid, the canals of Hering over the inlets) crosses sinusoids, cross-links and inlets here and there, so wherever it did the later-drawn bile was stamped over the blood and
// read as a duct running through it. 2D draws the bile in its lowest tier (lobule-pick.js); the scene now draws it first of the vessels and without depth, ink then body, so every vessel is painted over it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import type { ShaderMaterial } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { buildBile } from '../src/scene/lobule/bile.ts';
import { AN_K, sinRadius } from '../src/scene/lobule/widths.ts';
import { BILE_ORDER, LZ, Lobule3D, OVER_Z } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), net = flat.net, l3 = new Lobule3D(flat, createShared());
l3.buildForTest('light');
const parts = l3.partsForTest, bile = parts.find((p) => p.toonMesh.name === 'lobule3d/canaliculi')!;
const blood = parts.filter((p) => /sinusoids|inlets|arteriole-twigs/.test(p.toonMesh.name));

test('the bile draws before every blood vessel and the lymph, with no depth write, its ink first and its body over it', () => {
  assert.ok(bile.inkMesh, 'it has an ink line');
  const body = bile.toonMesh, ink = bile.inkMesh!;
  assert.equal(BILE_ORDER, body.renderOrder);
  assert.ok(ink.renderOrder < body.renderOrder, 'the line first');
  for (const m of [body, ink]) assert.equal((m.material as ShaderMaterial).depthWrite, false, 'the bile writes no depth, so a vessel drawn later is never hidden by it');
  assert.equal(body.visible, true);
  for (const p of [...blood, parts.find((q) => q.toonMesh.name === 'lobule3d/lymph-channels')!]) for (const m of [p.toonMesh, p.inkMesh]) if (m) assert.ok(m.renderOrder > body.renderOrder, `${m.name} draws after the bile`);
  // the vessels are drawn in the same (see-through) list as the bile, so the order above is the order drawn
  for (const m of [body, ink, blood[0]!.toonMesh]) assert.equal((m.material as ShaderMaterial).transparent, true);
});

test('where the bile crosses a blood vessel its centre lies below the vessel\'s axis, so it is under it in depth too (the weld heights: bile at the plate surface, sinusoids over it)', () => {
  assert.ok(LZ.cellTop + 0.001 < OVER_Z, 'the bile\'s level is under the sinusoids\' axis');
  // and the bile\'s thickest tube (a duct, not a canaliculus) is thinner than the thinnest sinusoid it could cross
  const pos = (bile.geometry.getAttribute('position') as BufferAttribute).array;
  let bottom = Infinity; for (let i = 2; i < pos.length; i += 3) bottom = Math.min(bottom, pos[i]!);
  assert.ok(bottom > LZ.disse - 0.02, 'it lies on the plates, not below the lymph level');
});

test('the crossings are few and short: the bile\'s centre lines run beside the sinusoids, and only the canals of Hering over the inlets and the odd lane across a vessel pass beneath one', () => {
  const vessels = net.courses.filter((c) => ['s0', 's1', 's2', 'an', 'in', 'tw'].includes(c.kind));
  const wall = (c: (typeof vessels)[number], rho: number) => (c.kind === 'an' ? sinRadius('s0', rho) * AN_K : c.kind === 'in' || c.kind === 'tw' ? 0.012 : sinRadius(c.kind as 's0', rho));
  const dist = (q: readonly number[], c: (typeof vessels)[number]) => { let best = Infinity, rho = 0; for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0]! - a[0]) * bx + (q[1]! - a[1]) * by) / bb)) : 0, d = Math.hypot(q[0]! - a[0] - t * bx, q[1]! - a[1] - t * by); if (d < best) { best = d; rho = c.rho[i]! + (c.rho[i + 1]! - c.rho[i]!) * t; } } return { d: best, rho }; };
  let n = 0, under = 0, underSin = 0;
  for (const b of buildBile(net)) for (let i = 0; i < b.pts.length; i++) {
    n++;
    for (const c of vessels) { const q = dist(b.pts[i]!, c); if (q.d < wall(c, q.rho)) { under++; if (c.kind !== 'in') underSin++; break; } }
  }
  assert.ok(under / n < 0.15, `${under} of ${n} bile samples lie beneath a vessel`);
  assert.ok(underSin / n < 0.1, `${underSin} of ${n} beneath a sinusoid or cross-link (not an inlet)`);
});
