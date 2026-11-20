// A tapped vein is lit on its own and fades out a short way past its ends: it never runs on through the liver to light the cava, the shunts and every collateral (iPhone, 20 Nov: "i'm only
// choosing the portal vein; why am i highlighting everything"). And the lobule's tapped part has a mark of its own shape (lobule/mark.ts), where it had none.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CelScene } from '../src/scene/scene.ts';
import { DEFAULT_RANGE, computeHighlight } from '../src/scene/highlight.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { lobuleHit } from '../src/scene/lobule/pick.ts';
import { markShapes, ribbon, type MarkEnv } from '../src/scene/lobule/mark.ts';

test('a pick reaches only a short way: nothing beyond the range along the flow is lit, and the cava stays out of a portal pick', () => {
  const s = new CelScene();
  const edges = s.vessels.filter((o) => o.edge).map((o) => ({ id: o.edge!.id, from: o.edge!.from, to: o.edge!.to, length: o.edge!.length }));
  assert.ok(DEFAULT_RANGE.ahead <= 0.6 && DEFAULT_RANGE.behind <= 0.25, 'a few tenths of a scene unit');
  for (const pick of ['PV_TRUNK', 'SMV_CONF', 'IVC_IS_1', 'A_HEP']) {
    if (!edges.some((e) => e.id === pick)) continue;
    const m = computeHighlight(pick, edges);
    for (const [id, v] of m) {
      if (v.dir === 0) continue;
      assert.ok(v.offset < (v.dir > 0 ? DEFAULT_RANGE.ahead : DEFAULT_RANGE.behind), `${pick}: ${id} starts within the range (${v.offset.toFixed(2)})`);
    }
    assert.ok(m.size < 25, `${pick} lights ${m.size} edges`);
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
  const alphas = r.col.filter((_, i) => i % 4 === 3), n = alphas.length;
  assert.ok(alphas[0]! < 0.3 && alphas[n - 1]! < 0.3, 'faint at both ends');
  assert.equal(Math.max(...alphas), 1, 'whole in the middle');
  const ring = ribbon(markShapes({ part: 'cv' }, env), 0);
  assert.ok(ring.col.filter((_, i) => i % 4 === 3).every((a) => a === 1), 'a ring is even');
  assert.equal(ring.pos.length / 3 % 2, 0);
  assert.ok(ring.idx.every((i) => i < ring.pos.length / 3));
});
