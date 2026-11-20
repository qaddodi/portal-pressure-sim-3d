// The Lobule's terminal lymphatics and the floor between the cells. (The space of Disse itself, the lymph's sleeve along each sinusoid, is tests/lobule-disse-sleeve.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { tissueInk } from '../src/scene/lobule/cel.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, lymphIntoPools } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), net = flat.net;

test('every terminal lymphatic runs on into the middle of the lymphatic pool it meets (it stopped on the pool\'s rim, a butt joint against the pool\'s wall)', () => {
  const lt = net.courses.filter((c) => c.kind === 'lt'), lv = net.courses.filter((c) => c.kind === 'lv'), out = lymphIntoPools(lt, lv);
  assert.equal(out.length, lt.length);
  for (const c of out) {
    const e = c.pts[c.pts.length - 1]!, d = Math.min(...lv.map((v) => { const m = v.pts[Math.floor(v.pts.length / 2)]!; return Math.hypot(m[0] - e[0], m[1] - e[1]); }));
    assert.ok(d < DISC_R.lv * 0.1, `ends ${(d / DISC_R.lv).toFixed(2)} pool radii from a pool's middle`);
    assert.equal(c.pts.length, c.rho.length);
  }
});

test('the floor between the cells reads as the gap between tiles, never as a plate: as dark as the tile casing in every look', () => {
  const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const l3 = new Lobule3D(flat, createShared());
    l3.buildForTest(look);
    const ground = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/ground')!, tint = (ground.mats.toon.uniforms.tint!.value as { r: number; g: number; b: number }), t = [tint.r, tint.g, tint.b], ink = tissueInk(look);
    assert.ok(luma(t) <= luma(ink) + 0.06, `${look}: the floor (${luma(t).toFixed(2)}) is lighter than the tile casing (${luma(ink).toFixed(2)})`);
  }
});
