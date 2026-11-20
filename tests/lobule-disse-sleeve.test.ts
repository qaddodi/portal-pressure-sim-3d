// The Lobule's lymph is the space of Disse as 2D draws it (b3058ef3, lobule-zoom.js: `lyOff = 0`, "Wet Disse, 16 Nov 2026: the space of Disse is a sleeve centred on its sinusoid, drawn under it"; lobule-zoom-field.js radiusAt):
// a sleeve round every sinusoid, as wide as the fluid filtered at that point, under the blood, only its rim showing. Mohammad, 20 Nov 2026, on the beside-the-sinusoid tubes this replaces: "Lymph vessels do not hug the
// blood vessels yet", a dark gap between the green and the blue, lymph nearly as wide as the sinusoid, no taper to the central vein, loops and stray strands between plates, "the whole thing is not right".
// Root cause: the tubes were laid BESIDE each sinusoid and every defect came from that (a gap where the two outlines met, strands where one was cut by the next vessel, loops at a branch, a width that was its own);
// 2D never lays one beside: its sleeve has its sinusoid's own centre line. These tests read the RENDERED vertices (the part's positions after `update`), not the course lists, and hold them to 2D's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ShaderMaterial } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { disseProfile, type LobuleModel } from '../src/scene/lobule/model.ts';
import { RS0 } from '../src/scene/lobule/geometry.ts';
import { LT_R, RS_N, congShare, sinRadius } from '../src/scene/lobule/widths.ts';
import { sinK } from '../src/scene/lobule/from2d/lobule-mouths.generated.js';
import { BILE_ORDER, Lobule3D, OVER_Z, SLEEVE_CAP, SLEEVE_ORDER, SLEEVE_Z, sleeveWidths } from '../src/scene/micro3d/lobule3d.ts';
import { pinned2D } from './two-d-pin.ts';

const R = 3;
const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
});
/** The 2D text's smooth() and radiusAt 'ly' rim, written out here from the pinned file's line (not imported from widths.ts), for a profile j. */
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rim2D = (rho: number, j: number) => RS0 * (0.12 + 0.42 * Math.sqrt(j)) * (0.55 + 0.45 * smooth(0.07, 0.24, rho));
/** 2D disseJ's interpolation of the 32-point profile. */
const jAt = (p: Float32Array, rho: number) => { const f = Math.min(1, Math.max(0, (rho - 0.06) / 0.94)) * 31, k = Math.min(30, Math.floor(f)); return p[k]! + (p[k + 1]! - p[k]!) * (f - k); };

function scene(m: LobuleModel = model()) {
  const sh = createShared(), flat = new LobuleView(sh), l3 = new Lobule3D(flat, sh);
  flat.setVisible(true); flat.snapModel(m); l3.buildForTest('light'); l3.update(true, 0, 1000, 1);
  return { flat, l3, net: flat.net, sleeve: l3.sleeveForTest! };
}
const part = (l3: Lobule3D, name: string) => l3.partsForTest.find((p) => p.toonMesh.name === `lobule3d/${name}`)!;
const mats = (p: ReturnType<typeof part>) => p.toonMesh.material as ShaderMaterial;

test('layering is 2D\'s: the space of Disse is drawn first among the vessels, writes no depth and has no line of its own, so every blood vessel and the lymphatics are drawn over it; the bile lies under it', () => {
  const { l3 } = scene(), duct = part(l3, 'lymph-channels');
  assert.equal(duct.inkMesh, null, 'no outline round a sleeve (one would cross every neighbouring sleeve where they meet)');
  assert.equal(mats(duct).depthWrite, false);
  assert.equal(duct.toonMesh.renderOrder, SLEEVE_ORDER);
  for (const n of ['sinusoids-0', 'sinusoids-1', 'sinusoids-2', 'sinusoids-links', 'inlets', 'arteriole-twigs', 'terminal-lymphatics', 'portal-venules', 'arterioles', 'ductules', 'lymphatics', 'central-vein']) {
    const p = part(l3, n); assert.ok(p, n);
    assert.ok(p.toonMesh.renderOrder > SLEEVE_ORDER, `${n} is drawn after the sleeve`);
    assert.equal(mats(p).depthWrite, true, `${n} writes depth`);
  }
  assert.ok(part(l3, 'canaliculi').toonMesh.renderOrder === BILE_ORDER && BILE_ORDER < SLEEVE_ORDER, 'the bile is under the lymph');
  const z = (duct.geometry.getAttribute('position').array as Float32Array);
  for (let i = 2; i < z.length; i += 3) assert.equal(z[i], Math.fround(SLEEVE_Z));
  assert.ok(SLEEVE_Z <= OVER_Z, 'never above its sinusoid\'s centre line');
});

test('RENDERED: every ribbon\'s centre line is its sinusoid\'s own, so no gap, nothing beside it, and the two sides are equal (flush by construction)', () => {
  const { net, sleeve, l3 } = scene(), pos = part(l3, 'lymph-channels').geometry.getAttribute('position').array as Float32Array, byId = new Map(net.courses.map((c) => [c.id, c]));
  assert.ok(sleeve.data.cs.length >= 84);
  for (const { course: c, n, v0 } of sleeve.data.cs) {
    const s = byId.get(c.sib!)!, k = c.reach ?? 0;
    for (let i = 0; i < n; i++) {
      const L = v0 + 2 * i, R_ = L + 1, cx = (pos[3 * L]! + pos[3 * R_]!) / 2, cy = (pos[3 * L + 1]! + pos[3 * R_ + 1]!) / 2;
      const q = c.pts[i]!;
      assert.ok(Math.hypot(cx - q[0] * R, cy + q[1] * R) < 1e-5, `course ${c.id} sample ${i} is off its centre line`);
      if (i >= k && i - k < s.pts.length) assert.ok(Math.hypot(cx - s.pts[i - k]![0] * R, cy + s.pts[i - k]![1] * R) < 1e-5, `course ${c.id} sample ${i} is off its sinusoid's`);
    }
  }
});

test('RENDERED: each sample\'s half width is 2D\'s: its sinusoid\'s radius there plus rs0 (0.12 + 0.42 sqrt j)(0.55 + 0.45 smooth(0.07, 0.24, rho)), j the Starling profile along the sinusoid', () => {
  const m = model(), { net, sleeve, flat, l3 } = scene(m), pos = part(l3, 'lymph-channels').geometry.getAttribute('position').array as Float32Array;
  const prof = disseProfile(m, flat.cur.lymphRate);
  let checked = 0;
  for (const { course: c, n, v0 } of sleeve.data.cs) {
    const k = c.reach ?? 0;
    for (let i = k; i < n; i++) {
      const L = v0 + 2 * i, half = Math.hypot(pos[3 * L]! - pos[3 * (L + 1)]!, pos[3 * L + 1]! - pos[3 * (L + 1) + 1]!) / 2 / R, rho = c.rho[i]!;
      const want = RS_N * sinK(rho) + rim2D(rho, jAt(prof, rho));
      assert.ok(Math.abs(half - want) < 2e-6, `course ${c.id} sample ${i} rho ${rho.toFixed(2)}: ${half} vs 2D ${want}`);
      checked++;
    }
  }
  assert.ok(checked > 3000, `${checked} samples held to 2D`);
  void net;
});

test('RENDERED: it is never narrower than its sinusoid (outside the central vein\'s trumpet), a rim shows on BOTH sides all along, and the rim thins toward the central vein as 2D\'s does', () => {
  const { sleeve, net, l3 } = scene(), pos = part(l3, 'lymph-channels').geometry.getAttribute('position').array as Float32Array, byId = new Map(net.courses.map((c) => [c.id, c]));
  let near = 0, nearN = 0, far = 0, farN = 0, vein = 0, veinN = 0;
  for (const { course: c, n, v0 } of sleeve.data.cs) {
    const kind = byId.get(c.sib!)!.kind as 's0' | 's1' | 's2', k = c.reach ?? 0;
    for (let i = k; i < n; i++) {
      const rho = c.rho[i]!;
      if (rho < 0.13) { const L = v0 + 2 * i; vein += Math.hypot(pos[3 * L]! - pos[3 * (L + 1)]!, pos[3 * L + 1]! - pos[3 * (L + 1) + 1]!) / 2 / R - RS_N * sinK(rho); veinN++; continue; }
      if (rho < 0.2) continue;
      const L = v0 + 2 * i, half = Math.hypot(pos[3 * L]! - pos[3 * (L + 1)]!, pos[3 * L + 1]! - pos[3 * (L + 1) + 1]!) / 2 / R, rim = half - sinRadius(kind, rho);
      assert.ok(rim > 0.0005, `course ${c.id} sample ${i}: the rim ${rim.toFixed(5)} R`);
      if (rho < 0.3) { near += rim; nearN++; } else if (rho > 0.8) { far += rim; farN++; }
    }
  }
  assert.ok(nearN > 20 && farN > 100 && veinN > 5);
  // (2D's numbers for a healthy liver: the rim is 0.0057 R at the portal end, 0.0031 by rho 0.25 and 0.0015 at the vein, a quarter of it; and the sinusoid itself widens to 1.3 times there)
  assert.ok(near / nearN < 0.6 * (far / farN), `the rim at rho 0.2 to 0.3 (${(near / nearN).toFixed(4)}) is well under the portal end's (${(far / farN).toFixed(4)})`);
  assert.ok(vein / veinN < 0.3 * (far / farN), `the rim at the vein (${(vein / veinN).toFixed(4)}) is under a third of the portal end's`);
});

test('RENDERED: a first-generation sleeve\'s reach narrows from its sinusoid\'s width to the lymphatic\'s own and ends INSIDE the lymphatic\'s tube (its round cap is wholly within the tube\'s silhouette: no blunt stub)', () => {
  const { sleeve, net, l3 } = scene(), pos = part(l3, 'lymph-channels').geometry.getAttribute('position').array as Float32Array, lt = net.courses.filter((c) => c.kind === 'lt');
  const distTo = (x: number, y: number) => Math.min(...lt.map((c) => { let best = Infinity; for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((x - a[0]) * bx + (y - a[1]) * by) / bb)) : 0; best = Math.min(best, Math.hypot(x - a[0] - t * bx, y - a[1] - t * by)); } return best; }));
  let reaches = 0;
  for (const { course: c, n, v0 } of sleeve.data.cs) {
    const k = c.reach ?? 0;
    if (!k) continue;
    reaches++;
    const half = (i: number) => { const L = v0 + 2 * i; return Math.hypot(pos[3 * L]! - pos[3 * (L + 1)]!, pos[3 * L + 1]! - pos[3 * (L + 1) + 1]!) / 2 / R; };
    assert.ok(Math.abs(half(0) - LT_R) < 1e-6, `the reach starts as wide as the lymphatic (${half(0)})`);
    for (let i = 1; i <= k && i < n; i++) assert.ok(half(i) >= half(i - 1) - 1e-9, `the reach only widens inward (${i})`);
    // the cap: the fan after the strip, first cap = the first sample's: every rim vertex of it lies within the lymphatic tube's radius of its axis
    const cap0 = v0 + 2 * n;
    for (let q = 1; q <= SLEEVE_CAP; q++) { const x = pos[3 * (cap0 + q)]! / R, y = -pos[3 * (cap0 + q) + 1]! / R; assert.ok(distTo(x, y) <= LT_R * 1.001, `a cap vertex of course ${c.id} stands ${(distTo(x, y) / LT_R).toFixed(2)} lymphatic radii from its axis`); }
  }
  assert.equal(reaches, net.courses.filter((c) => c.kind === 's0').length, 'every first-generation sleeve reaches its lymphatic');
});

test('the sleeve follows the state: congestion widens it with its sinusoid and the fluid filtered there with the rim; the Lymph layer going off closes it up under the vessel, nothing popping', () => {
  const { flat, sleeve } = scene();
  const before = sleeveWidths(sleeve.data, flat, 1);
  flat.cur.congU = 0.8; flat.cur.lum = 1.2;
  const wide = sleeveWidths(sleeve.data, flat, 1);
  let wider = 0; for (let i = 0; i < wide.length; i++) { assert.ok(wide[i]! >= before[i]! - 1e-9); if (wide[i]! > before[i]! + 1e-4) wider++; }
  assert.ok(wider > wide.length * 0.5, `${wider} of ${wide.length} samples are wider`);
  flat.cur.congU = 0; flat.cur.lum = 1;
  // the layer's fade: rim and reach go with it, the part under the sinusoid does not
  let prev = Infinity;
  for (const f of [1, 0.75, 0.5, 0.25, 0]) {
    const w = sleeveWidths(sleeve.data, flat, f), total = w.reduce((a, b) => a + b, 0);
    assert.ok(total < prev, 'it only closes'); prev = total;
  }
  const none = sleeveWidths(sleeve.data, flat, 0);
  for (const { course: c, from, n } of sleeve.data.cs) {
    const k = c.reach ?? 0;
    for (let i = 0; i < k; i++) assert.equal(none[from + i], 0, 'the reach closes to nothing');
    for (let i = k; i < n; i++) assert.ok(Math.abs(none[from + i]! - sinRadius('s0', c.rho[i]!) * R) < 1e-9, 'the rest is exactly its sinusoid\'s own width, hidden under it');
  }
});

test('the fluid filtered shows in the rim: a high-pressure portal edge (cirrhosis) widens the rim toward the portal end more than at the vein, from the engine\'s own profile', () => {
  const sh = createShared(), flat = new LobuleView(sh);
  flat.snapModel(model());
  const healthy = [0.15, 0.5, 0.9].map((r) => flat.sleeveNow(r));
  flat.snapModel(model({ P1: 24, P3: 6, lymph: 3, lymph0: 0.9 }));
  const wet = [0.15, 0.5, 0.9].map((r) => flat.sleeveNow(r));
  assert.ok(wet[2]! > healthy[2]! + 0.002, `the portal end: ${wet[2]} vs ${healthy[2]}`);
  assert.ok(wet[2]! - healthy[2]! > wet[0]! - healthy[0]!, 'it gains most where the pressure is highest');
  assert.equal(flat.radiusNow({ ...flat.net.courses.find((c) => c.kind === 'ly')!, kind: 'ly' }, 20), flat.sleeveNow(flat.net.courses.find((c) => c.kind === 'ly')!.rho[20]!), 'a tap picks the sleeve as drawn');
});

test('the sleeve and the terminal lymphatics are one tone, one network (2D: "one network that joins with no line")', () => {
  const { l3 } = scene(), a = part(l3, 'lymph-channels').mats.toon.uniforms.tint!.value as { r: number; g: number; b: number }, b = part(l3, 'terminal-lymphatics').mats.toon.uniforms.tint!.value as { r: number; g: number; b: number };
  assert.deepEqual([a.r, a.g, a.b], [b.r, b.g, b.b]);
});

test('the sleeve is 2D\'s at the pin: lyOff = 0, the radius line, and drawn under every blood vessel (Z_OF ly 0.05 against 0.1 to 0.7)', (t) => {
  const two = pinned2D('src/ui/lobule-zoom.js');
  if (two.skip) { t.skip(two.skip); return; }
  const zoom = readFileSync(`${two.repo}/src/ui/lobule-zoom.js`, 'utf8'), field = readFileSync(`${two.repo}/src/ui/lobule-zoom-field.js`, 'utf8');
  assert.match(zoom, /const lyOff = 0;/);
  assert.match(field, /case 'ly': \{ const j = disseJ\(m, t\.rho\[i\]\); return rs \* sinK\(t\.rho\[i\]\) \+ g\.rs0 \* \(0\.12 \+ 0\.42 \* Math\.sqrt\(j\)\) \* \(0\.55 \+ 0\.45 \* smooth\(0\.07, 0\.24, t\.rho\[i\]\)\); \}/);
  assert.match(field, /Z_OF = \{[^}]*\bs0: 0\.1, s1: 0\.11, s2: 0\.12, ly: 0\.05, an: 0\.09/);
  assert.match(zoom, /const poly = \[E, \.\.\.P\];/);
});

test('the congestion share a sinusoid takes is the same function the sleeve follows (no second copy)', () => {
  const { flat } = scene();
  flat.cur.congU = 0.6;
  for (const rho of [0.2, 0.5, 0.9]) assert.ok(Math.abs(flat.sinScaleAt(rho) - (1 + 1.5 * 0.6 * congShare(rho))) < 1e-12);
});
