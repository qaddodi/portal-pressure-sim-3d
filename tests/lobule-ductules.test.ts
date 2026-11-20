// The Lobule's lymph (Mohammad, 20 Nov 2026: "those lymph vessels should be drawn like on the outside of the blood vessels and taper to nothing closer to 90% of the way to the central vein"; before that "the lymph
// ductules regressed", "big plates"). Root cause of the grey-green wedges beside the sinusoids: each space of Disse (`ly`) was drawn as a flat sleeve centred ON its sinusoid, 0.0132 a side (a sinusoid is 0.0065),
// and where two sinusoids part at a small angle the two sleeves covered the cleft between them. 2D draws it as "a thin channel beside each sinusoid, between the sinusoid and its plate" (lobule-zoom.js `beside`,
// radiusAt 'ly'): a tube half a sinusoid's radius, lyOff = rsN + rs0 * 1.1 off the axis, tapering (lyTaper) to a thread by the central vein. The 3D now draws exactly that and no sleeve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { tissueInk } from '../src/scene/lobule/cel.ts';
import { DISC_R, DUCT_R, RS0, RS_N, lyTaper, sinRadius } from '../src/scene/lobule/widths.ts';
import { Lobule3D, lymphIntoPools } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), net = flat.net;
const R = 3, ly = net.courses.filter((c) => c.kind === 'ly'), byId = new Map(net.courses.map((c) => [c.id, c]));
const distToAxis = (q: readonly number[], c: { pts: readonly (readonly number[])[] }) => { let best = Infinity; for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0]! - a[0]!, by = b[1]! - a[1]!, bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0]! - a[0]!) * bx + (q[1]! - a[1]!) * by) / bb)) : 0; best = Math.min(best, Math.hypot(q[0]! - a[0]! - t * bx, q[1]! - a[1]! - t * by)); } return best; };

test('each lymph channel runs BESIDE its sinusoid, the same gap from the wall all along (2D lyOff = rsN + rs0 * 1.1), never on it', () => {
  const off = net.rsN + net.rs0 * 1.1;
  assert.ok(Math.abs(off - (RS_N + RS0 * 1.1)) < 1e-12);
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    // (the first samples of a first-generation channel are its reach from the terminal lymphatic to the sinusoid)
    for (let i = c.lvl === 0 ? 8 : 0; i < c.pts.length; i++) {
      const d = distToAxis(c.pts[i]!, s);
      assert.ok(d > off * 0.9 && d < off * 1.12, `course ${c.id} sample ${i}: ${d.toFixed(4)} from its sinusoid's axis, not ${off.toFixed(4)}`);
      const w = sinRadius(s.kind as 's0', s.rho[Math.min(i, s.rho.length - 1)]!);
      assert.ok(d > w + 0.002, `clear of the blood vessel's own wall (${d.toFixed(4)} from the axis, wall at ${w.toFixed(4)})`);
    }
  }
});

test('the channel tapers to a thread toward the central vein (2D lyTaper): whole from rho 0.42 out, 6 % inside 0.13, never wider outward than inward', () => {
  assert.equal(lyTaper(1), 1); assert.equal(lyTaper(0.42), 1); assert.ok(Math.abs(lyTaper(0.13) - 0.06) < 1e-12); assert.ok(Math.abs(lyTaper(0.05) - 0.06) < 1e-12);
  for (let k = 0; k < 100; k++) assert.ok(lyTaper(k / 100 + 0.01) >= lyTaper(k / 100) - 1e-12, 'it only widens outward');
  assert.ok(lyTaper(0.28) > 0.2 && lyTaper(0.28) < 0.8, 'a smooth way between');
});

test('no flat lymph sleeve is drawn, and the channels are tubes no wider than 2D\'s: the part\'s widest tube is half a sinusoid\'s radius, at its own course', () => {
  const l3 = new Lobule3D(flat, createShared());
  l3.buildForTest('light');
  assert.equal(l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/disse'), undefined, 'the Disse sleeve is gone');
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/lymph-channels')!;
  assert.ok(part, 'the lymph channels');
  const pos = (part.geometry.getAttribute('position') as BufferAttribute).array, sw = (part.geometry.getAttribute('swell') as BufferAttribute).array;
  assert.equal(sw.length / 2, pos.length / 3, 'a radius on every vertex');
  let rmax = 0, zlo = Infinity, zhi = -Infinity;
  for (let v = 0; v < sw.length; v += 2) rmax = Math.max(rmax, sw[v]!);
  for (let i = 2; i < pos.length; i += 3) { zlo = Math.min(zlo, pos[i]!); zhi = Math.max(zhi, pos[i]!); }
  assert.ok(Math.abs(rmax - DUCT_R * R) < 1e-9, `widest ${rmax}`);
  assert.ok(Math.abs((zhi - zlo) / 2 - DUCT_R * R) < 1e-3, 'and the mesh is that wide');
  // the thread end: the vertices nearest the central vein carry the taper's own small radius
  let near = Infinity; for (let v = 0; v < pos.length / 3; v++) if (Math.hypot(pos[3 * v]!, pos[3 * v + 1]!) < 0.1 * R) near = Math.min(near, sw[2 * v]!);
  assert.ok(near <= DUCT_R * R * 0.1, `${near} at the centre`);
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

test('the floor between the cells reads as the gap between tiles, never as a plate: as dark as the tile casing in every look', () => {
  const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    const l3 = new Lobule3D(flat, createShared());
    l3.buildForTest(look);
    const ground = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/ground')!, tint = (ground.mats.toon.uniforms.tint!.value as { r: number; g: number; b: number }), t = [tint.r, tint.g, tint.b], ink = tissueInk(look);
    assert.ok(luma(t) <= luma(ink) + 0.06, `${look}: the floor (${luma(t).toFixed(2)}) is lighter than the tile casing (${luma(ink).toFixed(2)})`);
  }
});
