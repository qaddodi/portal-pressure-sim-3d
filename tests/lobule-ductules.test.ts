// The Lobule's lymph ductules (Mohammad, 20 Nov 2026: "the lymph ductules regressed", a flat grey plate stood out beside each inlet, "they don't join"). Root cause: each space of Disse that leaves a lymphatic
// channel (`ly` level 0, geometry.ts) runs from the channel to its sinusoid, and was drawn whole as the flat pale sleeve, so the stretch between the channel and the sinusoid's start stood out as a grey slab
// with a square end. 2D draws that stretch as a thin lymph-coloured tube joined to the channel; the sleeve belongs only under the sinusoid. The stretch is now a tube of the terminal lymphatics' part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { DISC_R, DUCT_R } from '../src/scene/lobule/widths.ts';
import { tissueInk } from '../src/scene/lobule/cel.ts';
import { Lobule3D, DISSE_OPEN, disseDuctules, disseOpen, lymphIntoPools } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), net = flat.net;
const R = 3;

test('every level-0 Disse space has a ductule from its channel to the sinusoid, and its sleeve starts where the sinusoid does', () => {
  const ly0 = net.courses.filter((c) => c.kind === 'ly' && c.lvl === 0), d = disseDuctules(net.courses.filter((c) => c.kind === 'ly'), net.courses);
  assert.ok(ly0.length >= 12);
  assert.equal(d.length, ly0.length);
  for (const x of d) {
    const sib = net.courses.find((c) => c.id === x.src.sib)!, a = x.src.pts[x.from]!, b = sib.pts[0]!;
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02, 'the sleeve begins at the sinusoid\'s own start');
    assert.equal(x.conn.kind, 'lt');
    assert.deepEqual(x.conn.pts[0], x.src.pts[0], 'the ductule starts on the channel');
    assert.deepEqual(x.conn.pts[x.conn.pts.length - 1], x.src.pts[x.from]);
  }
});

test('no flat Disse sleeve stands out beside a sinusoid or an inlet: every vertex of it lies within the sleeve\'s width of some sinusoid or inlet', () => {
  const l3 = new Lobule3D(flat, createShared());
  l3.buildForTest('light');
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/disse')!;
  assert.ok(part, 'the Disse part');
  const under = net.courses.filter((c) => c.kind[0] === 's' || c.kind === 'an' || c.kind === 'in');
  const pos = (part.geometry.getAttribute('position') as BufferAttribute).array;
  const near = (x: number, y: number) => { let best = Infinity; for (const c of under) for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((x - a[0]) * bx + (y - a[1]) * by) / bb)) : 0; best = Math.min(best, Math.hypot(x - a[0] - t * bx, y - a[1] - t * by)); } return best; };
  let worst = 0;
  for (let v = 0; v < pos.length; v += 3) worst = Math.max(worst, near(pos[v]! / R, -pos[v + 1]! / R));
  assert.ok(worst < 0.02, `a sleeve vertex stands ${worst.toFixed(4)} lobule radii from every sinusoid and inlet`);
});

test('every terminal lymphatic runs on into the middle of the lymphatic pool it meets (it stopped on the pool\'s rim, a butt joint against the pool\'s wall)', () => {
  const lt = net.courses.filter((c) => c.kind === 'lt'), lv = net.courses.filter((c) => c.kind === 'lv'), out = lymphIntoPools(lt, lv);
  assert.equal(out.length, lt.length);
  for (const c of out) {
    const e = c.pts[c.pts.length - 1]!, d = Math.min(...lv.map((v) => { const m = v.pts[Math.floor(v.pts.length / 2)]!; return Math.hypot(m[0] - e[0], m[1] - e[1]); }));
    assert.ok(d < DISC_R.lv * 0.1, `ends ${(d / DISC_R.lv).toFixed(2)} pool radii from a pool's middle`);
    assert.equal(c.pts.length, c.rho.length);
  }
});

test('a Disse sleeve opens out from a point: it is no wider than the inlet it begins under at its start (a square start plate stood out beside every sinusoid\'s foot)', () => {
  assert.equal(disseOpen(0), 0);
  assert.equal(disseOpen(DISSE_OPEN), 1);
  for (let k = 0; k < DISSE_OPEN; k++) assert.ok(disseOpen(k + 1) >= disseOpen(k), 'it only widens');
  // (the inlet there is 0.009 to 0.015 of a lobule radius, the sleeve 0.0132 each side: the first sample's width must be inside the tube)
  const l3 = new Lobule3D(flat, createShared());
  l3.buildForTest('light');
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/disse')!, pos = (part.geometry.getAttribute('position') as BufferAttribute).array;
  const ly0 = net.courses.filter((c) => c.kind === 'ly' && c.lvl === 0), d = disseDuctules(net.courses.filter((c) => c.kind === 'ly'), net.courses);
  const first = d.map((x) => x.src.pts[x.from]!);
  // each sleeve's start row (two vertices on the same spot): find the vertex pair nearest each start and check they coincide
  for (const q of first.slice(0, 12)) {
    let best = Infinity; for (let v = 0; v + 5 < pos.length; v += 3) best = Math.min(best, Math.hypot(pos[v]! / R - q[0], -pos[v + 1]! / R - q[1]));
    assert.ok(best < 1e-6, 'the sleeve begins exactly at the sinusoid\'s start');
  }
  assert.equal(ly0.length, d.length);
});

test('the ductules are their own part, at 2D\'s width: a thread half a sinusoid\'s radius, beside the terminal lymphatics\' 0.0075', () => {
  const l3 = new Lobule3D(flat, createShared());
  l3.buildForTest('light');
  const duct = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/lymph-ductules')!, lt = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/terminal-lymphatics')!;
  assert.ok(duct && (duct.geometry.getAttribute('position') as BufferAttribute).count > 0, 'the ductules are drawn');
  const ext = (p: typeof duct) => { const a = (p.geometry.getAttribute('position') as BufferAttribute).array; let z0 = Infinity, z1 = -Infinity; for (let i = 2; i < a.length; i += 3) { z0 = Math.min(z0, a[i]!); z1 = Math.max(z1, a[i]!); } return (z1 - z0) / 2; };
  assert.ok(Math.abs(ext(duct) - DUCT_R * R) < 1e-3, `ductule radius ${ext(duct)}`);
  assert.ok(Math.abs(ext(lt) - 0.0075 * R) < 1e-3, `channel radius ${ext(lt)}`);
});

test('the floor between the cells reads as the gap between tiles, never as a plate: as dark as the tile casing in every look (the open wedges beside a sinusoid showed 2D\'s pale gap colour, big grey-green plates)', () => {
  const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const l3 = new Lobule3D(flat, createShared());
    l3.buildForTest(look);
    const ground = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/ground')!, tint = (ground.mats.toon.uniforms.tint!.value as { r: number; g: number; b: number }), t = [tint.r, tint.g, tint.b], ink = tissueInk(look);
    assert.ok(luma(t) <= luma(ink) + 0.06, `${look}: the floor (${luma(t).toFixed(2)}) is lighter than the tile casing (${luma(ink).toFixed(2)})`);
  }
});
