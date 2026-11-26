// A tapped vein is lit on its own and fades out a short way past its ends: it never runs on through the liver to light the cava, the shunts and every collateral (iPhone, 20 Nov: "i'm only
// choosing the portal vein; why am i highlighting everything"). And the lobule's tapped part has a mark of its own shape (lobule/mark.ts), where it had none.
import { GLOW_LAYER } from '../src/scene/layers.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CelScene } from '../src/scene/scene.ts';
import { DEFAULT_RANGE, HI_PX, computeHighlight } from '../src/scene/highlight.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { lobuleHit } from '../src/scene/lobule/pick.ts';
import { markShapes, ribbon, type MarkEnv } from '../src/scene/lobule/mark.ts';

test('a pick reaches only a short way: nothing beyond the range along the flow is lit, and the cava stays out of a portal pick', () => {
  const s = new CelScene();
  const edges = s.vessels.filter((o) => o.edge).map((o) => ({ id: o.edge!.id, from: o.edge!.from, to: o.edge!.to, length: o.edge!.length }));
  assert.ok(DEFAULT_RANGE.ahead <= 0.6 && DEFAULT_RANGE.behind <= 0.25, 'a few tenths of a scene unit at most');
  assert.ok(HI_PX <= 1, 'thin (20 Nov: less thick)');
  for (const pick of ['PV_TRUNK', 'SMV_CONF', 'IVC_IS_1', 'A_HEP']) {
    if (!edges.some((e) => e.id === pick)) continue;
    const m = computeHighlight(pick, edges);
    for (const [id, v] of m) {
      if (v.dir === 0) continue;
      assert.ok(v.offset < (v.dir > 0 ? DEFAULT_RANGE.ahead : DEFAULT_RANGE.behind), `${pick}: ${id} starts within the range (${v.offset.toFixed(2)})`);
    }
    assert.ok(m.size < 25 && [...m.values()].every((v) => v.dir === 0), `${pick} lights ${m.size} edges`);
  }
  const pv = computeHighlight('PV_TRUNK', edges);
  for (const far of ['IVC_IS_1', 'IVC_IS', 'IVCS_RA', 'LHV_IVC', 'MHV_IVC', 'RHV_IVC', 'RHV_IVC_1', 'EPI_ILI', 'EPI_SVC', 'POST_L_LHV', 'POST_R_RHV']) assert.ok(!pv.has(far), `${far} is not lit by the portal vein`);
  s.dispose?.();
});

// ── the lobule's mark ──
const net = buildLobule(7);
const env: MarkEnv = { net, tubes: net.courses, cvRadius: 0.1, septU: 0.5, radius: () => 0.01 };

test('every part the lobule lets you tap has a shape to mark, in lobule radii on the part itself', () => {
  const st = { septU: 0.5, lymphOn: true, bileOn: false, radius: () => 0.01, cvRadius: 0.1, pxPerR: 300 };
  const parts = new Map<string, number>();
  for (let y = -1; y <= 1; y += 0.015) for (let x = -1.1; x <= 1.1; x += 0.015) {
    const h = lobuleHit(net, net.courses, st, x, y);
    if (!h) continue;
    const lines = markShapes(h, env);
    assert.ok(lines.length > 0, `${h.part} has a mark`);
    for (const L of lines) { assert.ok(L.w > 0 && L.pts.length >= 2); for (const p of L.pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1])); }
    parts.set(h.part, (parts.get(h.part) ?? 0) + 1);
  }
  for (const part of ['cv', 'triad', 'hep', 'sin']) assert.ok(parts.has(part), `${part} was tapped somewhere`);
  assert.equal(markShapes(null, env).length, 0, 'nothing tapped, nothing marked');
});

test('a vessel\'s mark runs along its course, wider than the vessel, and thins toward both ends; a ring does not', () => {
  const c = net.courses.find((k) => k.kind === 's1')!;
  const lines = markShapes({ part: 'sin', tube: c.id }, env);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0]!.pts[0], c.pts[0]);
  assert.ok(lines[0]!.w > 2 * 0.01, 'wider than the vessel, so it shows on both sides');
  const r = ribbon(lines, 0);
  const alphas = r.col.filter((_, i) => i % 4 === 3), C = 9, n = alphas.length / C;
  const row = (i: number) => alphas.slice(i * C, (i + 1) * C);
  assert.ok(Math.max(...row(0)) < 0.3 && Math.max(...row(n - 1)) < 0.3, 'faint at both ends');
  assert.ok(Math.max(...row(Math.floor(n / 2))) > 0.8, 'bright in the middle');
  for (let i = 0; i < n; i++) { const a = row(i); assert.equal(a[0], 0); assert.equal(a[C - 1], 0); assert.ok(a[4]! >= a[2]! && a[2]! >= a[1]!, 'a glow: bright at the line, thinning to nothing at each edge'); }
  const ring = ribbon(markShapes({ part: 'cv' }, env), 0);
  const ra = ring.col.filter((_, i) => i % 4 === 3);
  assert.ok(Math.max(...ra) <= 1 && ra.some((a) => a === 0), 'a ring is a halo too, even round');
  assert.equal(ring.pos.length / 3 % C, 0);
  assert.ok(ring.idx.every((i) => i < ring.pos.length / 3));
});

// ── the selection's glow (owner, 20 Nov: "instead of an outline, make it a glow"; "even the glow should take the shape of the vessel (and fade at the ends)") ──
test('a picked vessel lights its glow mask, eased in and out, in the body only; a shunt target set glows whole; the outline is not widened or recoloured', () => {
  const s = new CelScene();
  const glows = () => s.vessels.filter((o) => o.glowMesh?.visible).map((o) => ({ id: o.edge!.id, mesh: o.glowMesh! }));
  assert.equal(glows().length, 0);
  s.pick('PV_TRUNK');
  s.highlight.step(16);
  const part = glows();
  assert.ok(part.length >= 1 && part.every((g) => ['PV_TRUNK', 'PV_TRUNK_1'].includes(g.id)), 'only the picked vein: ' + part.map((g) => g.id).join());
  assert.equal(part[0]!.mesh.layers.mask, 1 << GLOW_LAYER, 'on the glow\'s own layer (glow.ts GLOW_LAYER): drawn by the mask pass only');
  const pv = s.vessels.find((o) => o.edge!.id === 'PV_TRUNK')!;
  assert.ok((pv.toon.uniforms.hiOn!.value as number) > 0 && (pv.toon.uniforms.hiOn!.value as number) < 1, 'eases in (the pick\'s weight the shader reads)');
  while (s.highlight.step(16)) { /* settle */ }
  assert.equal(pv.toon.uniforms.hiOn!.value, 1);
  assert.equal(pv.ink.uniforms.hiPx.value, 0, 'no widened outline');
  s.highlight.setGlowShown(false); s.highlight.step(16);
  assert.equal(glows().length, 0, 'not in the Circuit');
  s.highlight.setGlowShown(true);
  s.pick(null);
  while (s.highlight.step(16)) { /* fade out */ }
  assert.equal(glows().length, 0);
  s.highlight.setOnly(['V_KID_L']); while (s.highlight.step(16)) { /* settle */ }
  assert.ok(glows().some((g) => g.id === 'V_KID_L'), 'a shunt target glows');
  s.dispose();
});
