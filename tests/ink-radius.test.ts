// Every tube wears an ink line that never outgrows its own radius (Mohammad, 23 Nov 2026, the SOS slide: black ink beyond the width of the twigs and the bile threads near their thin ends). Root cause: the clamp read the
// tube's radius from `swell.x`, and only the sinusoids and the lymph channels carry `swell`; the twigs, the bile, the terminal lymphatics, the inlets and every junction skin had a fixed `px` hull, the same sliver at
// their thin ends. A second defect: the fade multiplied the opacity of an OPAQUE ink material, which only darkened the line. Now every tube vertex carries `inkR` (its own rest radius), the width is clamped and faded by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D, OVER_Z } from '../src/scene/micro3d/lobule3d.ts';
import { weldRequest } from '../src/scene/micro3d/lobule3d.ts';
import { planWelds } from '../src/scene/lobule/welds.ts';
import { emitCourse, emitSkin } from '../src/scene/micro3d/lobule-welded.ts';
import type { PartData } from '../src/scene/micro3d/lobule-welded.ts';
import { MeshBuilder, INK_HALF, MICRO_INK_FS, MICRO_INK_VS, inkWidth } from '../src/scene/micro3d/cel3d.ts';
import { LOBULE_R } from '../src/scene/lobule/sizes.ts';
import { RS_N, twigR } from '../src/scene/lobule/widths.ts';

const TUBES = ['sinusoids-0', 'sinusoids-1', 'sinusoids-2', 'sinusoids-links', 'sinusoids-fine', 'inlets', 'arteriole-twigs', 'terminal-lymphatics', 'lymph-channels', 'canaliculi'];
const attr = (g: { getAttribute(n: string): unknown }, n: string) => g.getAttribute(n) as BufferAttribute | undefined;

function check(l3: Lobule3D, label: string): void {
  const parts = l3.partsForTest;
  for (const name of TUBES) {
    const p = parts.find((q) => q.toonMesh.name === `lobule3d/${name}`)!, g = p.geometry, ir = attr(g, 'inkR'), n = attr(g, 'position')!.count;
    assert.ok(ir, `${label}: ${name} has no inkR`);
    assert.equal(ir.count, n, `${label}: ${name} inkR count`);
    assert.equal(ir.itemSize, 1);
    for (let v = 0; v < n; v++) assert.ok(ir.array[v]! > 0 && Number.isFinite(ir.array[v]!), `${label}: ${name} vertex ${v}: ${ir.array[v]}`);
    assert.ok(p.mats.ink!.defines && 'INKR' in p.mats.ink!.defines, `${label}: ${name} ink has no INKR define`);
    // the radius function: where a part keeps its radius in `swell` too, the two are the same number
    const sw = attr(g, 'swell');
    if (sw) for (let v = 0; v < n; v++) assert.ok(Math.abs(sw.array[2 * v]! - ir.array[v]!) < 1e-6, `${label}: ${name} vertex ${v}: swell ${sw.array[2 * v]} inkR ${ir.array[v]}`);
  }
  for (const p of parts) {
    if (TUBES.some((t) => p.toonMesh.name === `lobule3d/${t}`)) continue;
    assert.equal(attr(p.geometry, 'inkR'), undefined, `${label}: ${p.toonMesh.name} must have none`);
    if (p.mats.ink) assert.ok(!p.mats.ink.defines || !('INKR' in p.mats.ink.defines), `${label}: ${p.toonMesh.name} ink`);
  }
}

test('unwelded: every tube part carries inkR per vertex, equal to its radius; the twigs\' rings match twigR; the other parts none', () => {
  const l3 = new Lobule3D(new LobuleView(createShared()), createShared());
  l3.buildForTest('light');
  check(l3, 'unwelded');
  const net = new LobuleView(createShared()).net, tw = net.courses.filter((c) => c.kind === 'tw');
  const part = l3.partsForTest.find((q) => q.toonMesh.name === 'lobule3d/arteriole-twigs')!, ir = attr(part.geometry, 'inkR')!, pos = attr(part.geometry, 'position')!;
  let v = 0, rings = 0;
  for (const c of tw) {
    for (let i = 0; i < c.pts.length; i++) for (let k = 0; k < 10; k++, v++) {
      const want = Math.max(1e-4, twigR(i / (c.pts.length - 1), RS_N) * LOBULE_R), cx = c.pts[i]![0] * LOBULE_R, cy = -c.pts[i]![1] * LOBULE_R;
      assert.ok(Math.abs(ir.array[v]! - want) < 1e-6, `twig ${c.id} ring ${i}`);
      const d = Math.hypot(pos.getX(v) - cx, pos.getY(v) - cy, pos.getZ(v) - OVER_Z);
      assert.ok(Math.abs(d - want) < 1e-5, `twig ${c.id} ring ${i}: the ring's own radius ${d} against ${want}`);
      if (k === 0) rings++;
    }
    break;   // (the first twig's rings are enough: its caps follow them and break the simple order)
  }
  assert.ok(rings > 5);
});

test('welded: every tube part carries inkR per vertex, and the sinusoids\' and channels\' equal their swell radius at every vertex, skins included', () => {
  const l3 = new Lobule3D(new LobuleView(createShared()), createShared());
  const req = weldRequest(new LobuleView(createShared()).net), plan = planWelds(req.courses, { avoid: req.avoid, splay: false });
  l3.buildForTest('light');
  l3.layWeldsForTest(plan);
  assert.ok(l3.weldCount > 100);
  check(l3, 'welded');
});

test('every junction skin\'s inkR lies within the radii of its arms (and is never zero)', () => {
  const req = weldRequest(new LobuleView(createShared()).net), plan = planWelds(req.courses, { avoid: req.avoid, splay: false });
  let n = 0, worstLo = Infinity, worstHi = 0; const LO = 0.99, HI = 1.01;
  for (const sk of plan.skins) {
    const d: PartData = { b: new MeshBuilder(), W: [], K: [], ir: [] }, host = plan.courses.get(sk.host)!;
    emitSkin(d, sk, plan.courses, { R: LOBULE_R, seg: 10, endHush: 0 }, () => true);
    const rs = sk.arms.map((a) => plan.courses.get(a.key)!.rad[a.at]! ), lo = Math.min(...rs, ...sk.arms.map((a) => a.rSeam)), hi = Math.max(...rs, ...sk.arms.map((a) => a.rSeam)), cnt = sk.mesh.position.length / 3;
    assert.equal(d.ir!.length, cnt);
    for (const r of d.ir!) { assert.ok(r > 0 && r >= lo * LO - 1e-9 && r <= hi * HI + 1e-9, `${sk.host}: ${r} outside ${lo}..${hi}`); n++; worstLo = Math.min(worstLo, r / lo); worstHi = Math.max(worstHi, r / hi); }
    assert.ok(host);
  }
  assert.ok(n > 1000, `vertices ${n}`);
  assert.ok(worstLo >= LO && worstHi <= HI);
  // and a course's own pieces carry their sample's radius
  const d: PartData = { b: new MeshBuilder(), W: [], K: [], ir: [] }, out = [...plan.courses.values()][0]!;
  emitCourse(d, out, { R: LOBULE_R, seg: 10, endHush: 0 });
  assert.equal(d.ir!.length, d.W.length);
  assert.ok(d.ir!.every((r) => out.rad.some((x) => x === r)));
});

test('the twin: at most half the radius, nothing as the tube goes to nothing, thinning (not darkening) under the minimum line, the whole line from twice the width', () => {
  for (const px of [1, 1.25, 1.5, 2.5]) {
    let prev = 0;
    for (let r = 0; r <= 12; r += 0.02) {
      const w = inkWidth(px, r);
      assert.ok(w <= INK_HALF * r + 1e-12, `px ${px} r ${r}: ${w}`);
      assert.ok(w >= prev - 1e-12, 'it grows with the tube');
      assert.ok(w - prev < 0.12, 'no step');
      if (r >= 2 * px) assert.equal(w, px);
      prev = w;
    }
    assert.equal(inkWidth(px, 0), 0);
    assert.ok(inkWidth(px, 1e-6) < 1e-5);
  }
});

test('the shaders: the width is faded, no opacity is written from an ink varying, every INKR tube reads inkR', () => {
  assert.match(MICRO_INK_VS, /#ifdef INKR[^\n]*\n[^\n]*\nattribute float inkR;/);
  assert.match(MICRO_INK_VS, /max\(inkR \+ infl, 0\.0\)/);
  assert.doesNotMatch(MICRO_INK_VS, /swell\.x/);
  assert.match(MICRO_INK_VS, /w \*= smoothstep\(/);
  assert.doesNotMatch(MICRO_INK_VS, /vInkA/);
  assert.doesNotMatch(MICRO_INK_FS, /vInkA|varying float vInk/);
  assert.match(MICRO_INK_FS, /float o = opacity;/);
});
