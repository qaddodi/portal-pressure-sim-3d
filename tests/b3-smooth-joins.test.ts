// Smooth vessel joins (Settings > Figure depth): the joins are geometry, behind one switch. These read the tubes the way the shader does and check what the owner asked for: no gap between a branch
// and its trunk, no step or seam where two vessels carry on, clean monotone tapers, the cava ending in the right atrium, the pressure colour continuous along a chain, and the switch off
// being the figure as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPPED, NETWORK_BY_ID, NODE_Z, RUN_ONS, cutEnd, meetRadius } from '../src/scene/vessels/network.ts';
import { liverTaperOf, REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { TIP_K, buildTubes, buriedRadius, pointFactor, pointLength } from '../src/scene/vessels/tubes.ts';
import { CEIL, SMOOTH, UNEQUAL, joinSwell } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { computeLens, lensColourAt, edgeIndex } from '../src/scene/lenses/model.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { frameFor } from './b3-frames.ts';
import { CelScene } from '../src/scene/scene.ts';
import { useSettings } from '../src/state/settings.ts';
import manifest from '../src/scene/organs/organs-manifest.json' with { type: 'json' };
import { AlwaysStencilFunc, KeepStencilOp } from 'three';
import { VESSEL_STENCIL } from '../src/scene/vessels/cel-ink.ts';
import { PLACED_ORGANS } from '../src/scene/anatomy/placement.generated.ts';
import { PLACED_ORGAN_BOX } from '../src/scene/anatomy/placed-organs.generated.ts';

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };
const off = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(false); try { return f(); } finally { setSmoothJoins(was); } };

type V3 = readonly [number, number, number];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function distToPoly(p: V3, poly: readonly V3[]): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)));
    best = Math.min(best, Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!));
  }
  return best;
}
/** One vessel's own tube, built as the scene builds it. */
const built = (id: string) => { const v = NETWORK_BY_ID.get(id)!; const b = buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius); return { v, b, run: b.runs[0]! }; };
/** The end ring of a vessel's own tube: its centre and radius. */
function ring(id: string, end: 0 | 1) {
  const { b, run } = built(id), pos = b.geometry.getAttribute('position'), k = end ? run.tubular : 0;
  const pts: V3[] = [];
  for (let j = 0; j < run.radial; j++) { const i = run.tubeStart + k * (run.radial + 1) + j; pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
  const c: V3 = [0, 1, 2].map((d) => pts.reduce((s, p) => s + p[d]!, 0) / pts.length) as unknown as V3;
  return { c, r: dist(pts[0]!, c), pts };
}

test('the switch is off in the vessel code until the scene sets it, and off the courses are the 2D rule\'s own (no clamp, no point, the old caps and tapers)', () => {
  assert.equal(smoothJoinsOn(), false);
  for (const v of MAPPED) {
    const c = coursesOf(v, REST)[0]!;
    assert.equal(c.clamp, undefined, v.id); assert.equal(c.point, undefined, v.id);
    if (c.sewn) continue;   // (a shunt sewn onto a vein narrows to its host's caliber there, shunt-ends.ts, switch or not)
    if (cutEnd(v.id) != null) continue;   // (a vein that branches narrows to its tip whatever the switch says: liver-branches.ts)
    // (restated for the placed anatomy, the only one now: the left portal vein narrows on into the left lobe whatever the switch says, as it fades there (shape.ts LIVER_TAPER, fades.ts PLACED_LIVER_FADE))
    if (liverTaperOf(v.id)) { assert.deepEqual(c.capless, v.joined, v.id); assert.deepEqual(c.taper, v.taper, v.id); assert.deepEqual(c.along, liverTaperOf(v.id), v.id); continue; }
    assert.deepEqual(c.capless, v.joined, v.id); assert.deepEqual(c.taper, v.taper, v.id);
  }
});

test('every vessel has the same vertices with the switch on and off (a toggle rewrites the tubes in place)', () => {
  for (const v of MAPPED) {
    const a = off(() => buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius).geometry), b = on(() => buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius).geometry);
    for (const name of ['position', 'normal', 'uv', 'tang', 'rk']) assert.equal(a.getAttribute(name)!.count, b.getAttribute(name)!.count, `${v.id} ${name}`);
    assert.deepEqual(off(() => tubularOf(v, 16)), on(() => tubularOf(v, 16)), v.id);
  }
});

test('a run-on carries on as one tube: the two end rings share one centre and one radius, including pairs of different caliber (a vein into a liver bed), and have no cap', () => {
  on(() => {
    let pairs = 0, unequal = 0;
    for (const r of RUN_ONS) {
      const A = NETWORK_BY_ID.get(r.a)!, B = NETWORK_BY_ID.get(r.b)!;
      if (A.kind === 'collateral' || B.kind === 'collateral') continue;
      const ra = ring(r.a, r.ia), rb = ring(r.b, r.ib);
      assert.ok(dist(ra.c, rb.c) < 1e-5, `${r.a} to ${r.b}: centres ${dist(ra.c, rb.c)}`);
      assert.ok(Math.abs(ra.r - rb.r) < 1e-5 * Math.max(1, ra.r), `${r.a} to ${r.b}: radii ${ra.r} and ${rb.r}`);
      pairs++;
      if (Math.max(A.radius, B.radius) > UNEQUAL * Math.min(A.radius, B.radius)) unequal++;
      const sa = SMOOTH.get(r.a)!, sb = SMOOTH.get(r.b)!;
      if (sa.joined[r.ia]) assert.ok(sb.joined[r.ib], `${r.a} and ${r.b} agree on their cap`);
    }
    // (placed: one calibre per whole vessel (network.ts oneCalibre) makes the pieces of a vein equal, which leaves three unequal pairs)
    assert.ok(pairs > 25 && unequal >= 3, `${pairs} pairs, ${unequal} of unequal caliber`);
  });
  // off, those unequal pairs keep their step (the 2D rule) (placed: one calibre per whole leaves no pair twice apart)
  
});

test('a vein narrowing into a thin bed keeps the bed as drawn (only the wide one narrows); two stretches of one vein ease to their mean', () => {
  const s = SMOOTH.get('PRE_R')!, w = SMOOTH.get('PVH_R_2')!, bed = NETWORK_BY_ID.get('PRE_R')!, vein = NETWORK_BY_ID.get('PVH_R_2')!;
  // (placed: a vein and its bed, a few hundredths long, share the change by length (network.ts meetRadius): the bed keeps its own 3.6 along it and meets the vein at one width; two stretches of one vein likewise)
  assert.ok(Math.abs(s.taper![0]! * bed.radius - w.taper![1]! * vein.radius) < 1e-9 && Math.abs(s.taper![0]! * bed.radius - meetRadius(bed, vein)) < 1e-9, 'they meet at one width');
  const a = NETWORK_BY_ID.get('PV_TRUNK_1')!, b = NETWORK_BY_ID.get('PV_TRUNK')!;
  assert.ok(Math.abs(SMOOTH.get('PV_TRUNK_1')!.taper![1]! * a.radius - SMOOTH.get('PV_TRUNK')!.taper![0]! * b.radius) < 1e-9);
});

test('tapers are monotone: along the first and last 30 % the radius moves from the join\'s width to the vessel\'s own and never back', () => {
  on(() => {
    let checked = 0;
    for (const v of MAPPED) {
      const c = coursesOf(v, REST)[0]!;
      if (!c.taper || v.flare || v.id.startsWith('C') || c.sewn || cutEnd(v.id) != null) continue;   // (a vein that branches is one tube to its tip: its own test)   // (a sewn shunt's heel flares over its taper: shunt-ends.ts)
      const { b: bt, run } = built(v.id), rk = bt.geometry.getAttribute('rk');
      const at = (k: number) => rk.getX(run.tubeStart + k * (run.radial + 1));
      const N = run.tubular, lo = Math.ceil(0.3 * N);
      for (const end of [0, 1] as const) {
        const t: number = c.taper[end]!;
        if (Math.abs(t - 1) < 1e-6) continue;
        let prev = at(end ? N : 0);
        for (let i = 1; i <= lo; i++) {
          const x = at(end ? N - i : i);
          assert.ok(t > 1 ? x <= prev + 1e-9 : x >= prev - 1e-9, `${v.id} end ${end} step ${i}: ${prev} then ${x}`);
          prev = x;
        }
        // (placed: a taper spans a length, shape.ts lengthSpans, so its own spans say whether it reaches the vessel's own width by the middle)
        // (the radius is the vessel's own from the end of this end's own span on, which is past the 30 % checked above for a short vein: the middle hepatic vein's start, 0.41 long since round 19)
        if ((c.taperSpan ?? [0.3, 0.3]).every((x) => x < 0.5)) { const k = Math.max(lo, Math.ceil((c.taperSpan ?? [0.3, 0.3])[end]! * N) + 1), own = at(end ? N - k : k); assert.ok(Math.abs(own - at(Math.floor(N / 2))) < 0.02 * at(Math.floor(N / 2)) + 1e-9, `${v.id} end ${end} reaches its own width`); }
        checked++;
      }
    }
    // (placed: one calibre per whole vessel leaves fewer ends that change width: 6)
    assert.ok(checked >= 6, `${checked} tapered ends`);   // (was 21, less the four split ends of the veins that branch, which keep their width: liver-branches.ts; before: 21: the two arterioles into the sinusoid fans are no longer drawn)
  });
});

test('a junction is a fork: the branch ends on its trunk\'s centreline at its own width, behind the trunk, with no collar and no buried ring (the outline is the union\'s: neighbour.ts)', () => {
  on(() => {
    let fitted = 0;
    for (const v of MAPPED) {
      const sm = SMOOTH.get(v.id)!;
      const c = coursesOf(v, REST)[0]!;
      for (const end of [0, 1] as const) {
        if (!sm.attach[end]) continue;   // (a collateral's or a shunt's end keeps its course; only its collar is held, below)
        fitted++;
        assert.equal(c.clamp?.[end] ?? null, null, `${v.id} end ${end}: no buried ring`);
        assert.equal(c.flare?.[end] ?? null, null, `${v.id} end ${end}: no collar (a pad or a knot where it meets the trunk)`);
        const hosts = sm.attach[end]!.map((id) => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts);
        const e = (end ? c.pts[c.pts.length - 1] : c.pts[0])!;
        const hostR = Math.max(...sm.attach[end]!.map((id) => NETWORK_BY_ID.get(id)!.radius));
        const flat = (p: V3): V3 => [p[0], p[1], 0];   // (the figure's plane: the depth is the tuck, below)
        const d = Math.min(...hosts.map((h) => distToPoly(flat(e), h.map(flat))));
        assert.ok(d < 0.2 * hostR + 0.003, `${v.id} end ${end}: ${d.toFixed(4)} off the trunk's axis (radius ${hostR.toFixed(4)})`);
        // the branch keeps its own width to its very end, and its end ball stays inside the trunk
        const { b: bt, run } = built(v.id), rk = bt.geometry.getAttribute('rk');
        const ringR = rk.getX(run.tubeStart + (end ? run.tubular : 0) * (run.radial + 1)) * v.radius, capR = rk.getX(run.capStart + end * run.capCount) * v.radius;
        assert.ok(ringR <= v.radius * 1.0001 && ringR >= v.radius * 0.97 * (c.taper?.[end] ?? 1), `${v.id} end ${end}: the end ring ${ringR} is the branch's own width ${v.radius}`);
        assert.ok(d + capR < hostR * 1.05 + 0.003, `${v.id} end ${end} cap ${capR} stands out of a trunk of ${hostR}`);
        // it ends a little behind the trunk's axis, so the trunk's wall covers its start (the order is decided by the axes' depths)
        const hz = Math.min(...hosts.map((h) => { let best = Infinity, z = 0; for (const p of h) { const dd = Math.hypot(p[0] - e[0], p[1] - e[1]); if (dd < best) { best = dd; z = p[2]; } } return z; }));
        assert.ok(e[2] < hz - 0.0015, `${v.id} end ${end}: ends ${(hz - e[2]).toFixed(4)} behind the trunk`);
      }
    }
    assert.ok(fitted >= 6, `${fitted} branch ends fitted`);
  });
  // (off: the same ends have no allowance and were never moved)
  off(() => { for (const v of MAPPED) assert.equal(coursesOf(v, REST)[0]!.clamp, undefined); });
});

test('the buried radius is held under the trunk\'s allowance at the end and eases back to the tube\'s own, never above either, and monotone', () => {
  const b = { max: 0.8, d0: 0.5, d1: 0.85 };
  assert.equal(buriedRadius(1.6, 0, b), 0.8);
  assert.equal(buriedRadius(1.6, 0.5, b), 0.8);
  assert.equal(buriedRadius(1.6, 0.85, b), 1.6);
  assert.equal(buriedRadius(0.5, 0, b), 0.5, 'a thinner tube is left alone');
  let prev = 0;
  for (let d = 0; d <= 1; d += 0.01) { const r = buriedRadius(1.6, d, b); assert.ok(r >= prev - 1e-12 && r <= 1.6 && r >= 0.8 - 1e-12); prev = r; }
  assert.equal(buriedRadius(2, 0, null), 2);
});

test('a free end tapers to a point instead of a round cap: the radius falls monotonically to TIP_K of its own and the cap is that small', () => {
  const pts = Array.from({ length: 12 }, (_, i): [number, number, number] => [i * 0.05, 0, 0]);
  const radius = 0.02, tubular = 40;
  const g = buildTubes([{ pts, radius, point: [false, true] }, { pts, radius }], [tubular, tubular], radius);
  const rk = g.geometry.getAttribute('rk'), run = g.runs[0]!, plain = g.runs[1]!;
  const at = (r: typeof run, k: number) => rk.getX(r.tubeStart + k * (r.radial + 1));
  let prev = Infinity;
  for (let k = 0; k <= tubular; k++) { const x = at(run, k); if (k > tubular / 2) { assert.ok(x <= prev + 1e-9, `step ${k}`); } prev = x; assert.ok(x <= 1 + 1e-9); }
  assert.ok(Math.abs(at(run, tubular) - TIP_K) < 1e-6, `tip ${at(run, tubular)}`);
  assert.ok(Math.abs(at(run, 0) - 1) < 1e-9, 'the other end is as it was');
  assert.ok(Math.abs(rk.getX(run.capStart + run.capCount) - TIP_K) < 1e-6, 'the cap at the tip is its width');
  assert.ok(Math.abs(rk.getX(run.capStart) - 1) < 1e-9, 'a free end that does not taper keeps its cap');
  assert.equal(at(plain, tubular), 1);
  // the taper is monotone as a function and runs over four radii, never more than 40 % of the course
  let q = 0; for (let d = 0; d <= 0.2; d += 0.001) { const f = pointFactor(d, 0.08); assert.ok(f >= q - 1e-12); q = f; }
  assert.equal(pointFactor(0, 0.08), TIP_K); assert.equal(pointFactor(0.08, 0.08), 1);
  assert.ok(Math.abs(pointLength(0.02, 1) - 0.08) < 1e-12); assert.ok(Math.abs(pointLength(0.02, 0.1) - 0.04) < 1e-12);
});

test('a vessel with an alpha fade of its own never takes the radius taper (2D\'s TIP_FADE and the rest stay alpha fades)', () => {
  on(() => {
    for (const v of MAPPED) if (['V_SPL', 'V_INT', 'V_COL', 'A_HEP', 'V_KID_L'].includes(v.id)) assert.equal(coursesOf(v, REST)[0]!.point, undefined, v.id);
  });
});

test('the cava and the SVC end in the right atrium: they run on one monotone slope to its back wall, and meet there at one depth', () => {
  const heart = (() => {
    const b = readFileSync('public/anatomy/organs.bin'), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const M = manifest as unknown as { q: number; organs: Record<string, [number, number]> }, [pb, nv] = M.organs['heart-ra']!, q = new Int16Array(buf, pb, nv * 3);
    let zmin = Infinity, zmax = -Infinity; for (let i = 0; i < nv; i++) { const z = q[i * 3 + 2]! / M.q; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    return { zmin, zmax };
  })();
  // (placed: the atrium is the placed organ, placement A's heart-ra: its centre depth and its box)
  const ra = { z: PLACED_ORGANS.A['heart-ra'].zc };
  const raBox = PLACED_ORGAN_BOX['heart-ra']!;
  assert.ok(ra.z > raBox[2] && ra.z < raBox[5], `the end depth ${ra.z} is inside the atrium (${heart.zmin} to ${heart.zmax})`);
  on(() => {
    const ivc = coursesOf(NETWORK_BY_ID.get('IVCS_RA')!, REST)[0]!.pts, svc = coursesOf(NETWORK_BY_ID.get('SVC_RA')!, REST)[0]!.pts;
    const eI = ivc[ivc.length - 1]!, eS = svc[svc.length - 1]!;
    assert.ok(Math.abs(eI[2] - ra.z) < 1e-9 && Math.abs(eS[2] - ra.z) < 1e-9);
    assert.ok(dist(eI, eS) < 1e-9, 'the two end at one point');
    // one slope each: the distance to the atrium's depth never grows toward the end (no dip behind the heart on the way in)
    for (const pts of [ivc, svc]) for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i]![2] - ra.z) <= Math.abs(pts[i - 1]![2] - ra.z) + 1e-9, `toward the atrium at ${i}`);
    assert.ok(Math.min(...ivc.map((p) => p[2])) >= NODE_Z.get('IVCS')! - 1e-9, 'the cava never dips below the depth it arrives at (no S at its upper end)');
    // it is a ring-to-ring match with the run-on pair: no step
    assert.ok(dist(ring('IVCS_RA', 1).c, ring('SVC_RA', 1).c) < 1e-5);
  });
  off(() => { const ivc = coursesOf(NETWORK_BY_ID.get('IVCS_RA')!, REST)[0]!.pts; assert.ok(Math.abs(ivc[ivc.length - 1]![2] - NODE_Z.get('RA')!) < 1e-9); });
});

test('the live width easing: the two vessels\' swells meet at the join at the mean, ease back to their own over 30 %, and agree from both sides (the vertex shader mirrors it)', () => {
  for (const [a, b] of [[1, 1.4], [0.7, 1.9], [1.2, 1.2]] as const) {
    assert.ok(Math.abs(joinSwell(a, b, 1, 1) - joinSwell(b, a, 0, 0)) < 1e-12, 'the same at the join from both sides');
    assert.ok(Math.abs(joinSwell(a, b, 1, 1) - (a + b) / 2) < 1e-12);
    assert.equal(joinSwell(a, b, 0.5, 1), a); assert.equal(joinSwell(a, b, 0.5, 0), a);
    // between the join and 30 % along the swell stays between the mean and the vessel's own, and returns to its own
    const mid = (a + b) / 2;
    for (let u = 0; u <= 0.3; u += 0.01) { const x = joinSwell(a, b, u, 0); assert.ok(x >= Math.min(a, mid) - 1e-12 && x <= Math.max(a, mid) + 1e-12, `u ${u}`); }
    assert.ok(Math.abs(joinSwell(a, b, 0.3, 0) - a) < 1e-12 && Math.abs(joinSwell(a, b, 0.7, 1) - a) < 1e-12);
  }
  // the shader's own easing is the same one (its first and last 30 % by smoothstep, from the neighbour's width by the mate uniforms)
  assert.ok(VESSEL_VS.includes('smoothstep(mateCut.x, mateCut.x + 0.3, uv.x)') && VESSEL_VS.includes('smoothstep(mateCut.y - 0.3, mateCut.y, uv.x)') && VESSEL_VS.includes('uniform vec2 mateCut;'));
  assert.ok(VESSEL_VS.includes('0.5 * (swell + swellOf(mate0.x, mate0.y, mate0.z))') && VESSEL_VS.includes('0.5 * (swell + swellOf(mate1.x, mate1.y, mate1.z))'));
  assert.ok(VESSEL_VS.includes('mate0.x >= 0.0'), 'nothing is read for a vessel with no mate');
});

const edges = EDGES as { id: string; from: string; to: string }[];
test('pressure colour runs smoothly along a chain: the two vessels of a run-on wear one colour at their join, and a third and two thirds along are the ramp\'s own colours at those pressures', async () => {
  const { frame, healthy } = await frameFor('cirr-decomp');
  const d = computeLens('pressure', frame as never, 'light', { healthy, ref: null });
  let joins = 0;
  for (const r of RUN_ONS) {
    const A = edges[edgeIndex.get(r.a)!]!, B = edges[edgeIndex.get(r.b)!]!;
    const nodeA = r.ia ? A.to : A.from, nodeB = r.ib ? B.to : B.from;
    if (nodeA !== nodeB) continue;
    const ca = lensColourAt(d, r.a, r.ia), cb = lensColourAt(d, r.b, r.ib);
    if (!ca || !cb) continue;
    joins++;
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(ca[i]! - cb[i]!) < 1e-6, `${r.a} to ${r.b}`);
  }
  assert.ok(joins > 15, `${joins} joins`);
  // the extra rows: a third and two thirds along lie on the colour path through the ramp, between the ends' pressures; and every row-2/3 texel is filled where the vessel is coloured
  const NE = edges.length, G = d.grad;
  let filled = 0;
  for (let k = 0; k < NE; k++) {
    if (G[k * 4 + 3] === 0) { assert.equal(G[(2 * NE + k) * 4 + 3], 0); continue; }
    assert.equal(G[(2 * NE + k) * 4 + 3], 1); assert.equal(G[(3 * NE + k) * 4 + 3], 1);
    filled++;
  }
  assert.ok(filled > 100);
  // a vessel whose pressure is flat has the same colour all along; one that falls from the red zone to the green passes through colours that are neither end's blend
  const flat = (id: string) => { const k = edgeIndex.get(id)!; return [0, 1, 2, 3].map((r) => [0, 1, 2].map((i) => G[(r * NE + k) * 4 + i]!)); };
  let differsFromBlend = 0;
  for (let k = 0; k < NE; k++) {
    if (G[k * 4 + 3] === 0) continue;
    const id = edges[k]!.id, rows = flat(id), lerp = rows[0]!.map((x, i) => x + (rows[1]![i]! - x) / 3);
    if (rows[2]!.some((x, i) => Math.abs(x - lerp[i]!) > 0.02)) differsFromBlend++;
  }
  assert.ok(differsFromBlend >= 1, 'some vessel\'s colour along it is the ramp\'s, not the blend of its ends');
  // a lens whose colour does not run along the vessel keeps its own colour a third and two thirds along, and its ends take the node's (lenses/model.ts meetAtNodes): the colour never steps at a junction
  const f = computeLens('flow', frame as never, 'light', { healthy, ref: null });
  for (let k = 0; k < NE; k++) { if (f.grad[k * 4 + 3] === 0) continue; for (let i = 0; i < 3; i++) assert.ok(Math.abs(f.grad[(2 * NE + k) * 4 + i]! - f.grad[(3 * NE + k) * 4 + i]!) < 1e-6, `${edges[k]!.id}: one colour through the middle`); }
});

test('no vessel TESTS a stencil bit another one wrote: every tube is one opaque draw with the outline in its own fragments, so a crossing is never merged and a join is buried only by the mates (the same on or off). Every tube WRITES the one shared vessel bit (plan 18: the crossing shadow falls only where it is set) with a function that always passes', () => {
  const s = new CelScene();
  let n = 0;
  for (const v of MAPPED) {
    const m = s.vesselObject(v.id)!.toonMesh.material as import('three').ShaderMaterial;
    assert.ok(!Array.isArray(m), v.id);
    // (the old rule was "no stencil at all": a per-vessel bit merged a crossing. The shared bit is write-only for the tube, so it can never cut another tube's pixels.)
    assert.ok(!m.stencilWrite || (m.stencilFunc === AlwaysStencilFunc && m.stencilRef === VESSEL_STENCIL && m.stencilWriteMask === VESSEL_STENCIL && m.stencilZFail === KeepStencilOp && m.stencilFail === KeepStencilOp), `${v.id}: a tube's stencil is the shared vessel bit, written and never read`);
    n++;
  }
  assert.ok(n > 50);
  s.dispose();
});

test('the switch applies live: toggling it rewrites every tube in place (same vertices), sets or clears the shader\'s mates and the colour path, and a free tube is drawn once', () => {
  try {
    const s = new CelScene({ joins: 'old' }); // (the old method's rule: with ?joins=old every mate stays; the skin's rule is tests/skin-scene.test.ts)
    assert.equal(smoothJoinsOn(), true, 'the scene sets smooth joins on');
    const toggle = (on: boolean) => (s as unknown as { useSmoothJoins(on: boolean): void }).useSmoothJoins(on);
    const obj = (id: string) => s.vesselObject(id) as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array; count: number } } }; toon: { uniforms: Record<string, { value: { x: number } | number }> } };
    const posOn = Float32Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), nOn = obj('PVH_L').toonMesh.geometry.getAttribute('position').count;
    assert.ok((obj('PV_TRUNK').toon.uniforms.mate1!.value as { x: number }).x >= 0 && obj('PV_TRUNK').toon.uniforms.lensSmooth!.value === 1);
    toggle(false);
    assert.equal(smoothJoinsOn(), false);
    assert.equal(obj('PVH_L').toonMesh.geometry.getAttribute('position').count, nOn, 'the same vertices');
    assert.notDeepEqual(Array.from(posOn), Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), 'the branch end moved back');
    // (placed: the widths meet at one width with the switch off too (network.ts meetRadius), so there is no step to come back)
    
    assert.equal((obj('PV_TRUNK').toon.uniforms.mate1!.value as { x: number }).x, -1);
    assert.equal(obj('PV_TRUNK').toon.uniforms.lensSmooth!.value, 0);
    toggle(true);
    assert.deepEqual(Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), Array.from(posOn), 'and on again is the same drawing');
    s.dispose();
  } finally { setSmoothJoins(false); }
});

test('a vein narrowing into a thin bed funnels over its whole length: its radius only ever falls toward the join, never swells into a bulb (it rises from the join to its widest and only falls after)', () => {
  on(() => {
    let funnels = 0;
    for (const v of MAPPED) {
      const sm = SMOOTH.get(v.id)!;
      for (const end of [0, 1] as const) {
        if (sm.span[end] !== 1 || cutEnd(v.id) === end || v.flare) continue;   // (a vein that branches is cut at its split: it keeps its width there)
        funnels++;
        const { b, run } = built(v.id), rk = b.geometry.getAttribute('rk');
        const at = (k: number) => rk.getX(run.tubeStart + k * (run.radial + 1));
        const t = sm.taper![end]!;
        let prev = at(end ? run.tubular : 0);
        assert.ok(Math.abs(prev - t) < 1e-6, `${v.id} end ${end} meets the thin vessel's width`);
        // unimodal: the radius rises from the join to the vessel's widest and only falls after it (a vessel funnelling at both ends peaks between them), and never leaves 1
        let fell = false;
        for (let i = 1; i <= run.tubular; i++) { const x = at(end ? run.tubular - i : i); assert.ok(x <= Math.max(1, ...sm.taper!) + 1e-5, `${v.id} end ${end} step ${i} above its own width`); if (x < prev - 1e-9) fell = true; else if (fell) assert.ok(x <= prev + 1e-9, `${v.id} end ${end} step ${i}: swells again, ${prev} then ${x}`); prev = x; }
      }
    }
    // (placed: no vein funnels over its whole length into a bed: the two share the change by length, network.ts meetRadius, and the taper rules above pin them)
    assert.ok(funnels === 0, `${funnels} funnels`);
  });
});

test('the centreline is the 2D course with smooth joins on too: snapping only moves a branch\'s end (within the trunk\'s reach, easing out over a quarter), and adds no wiggle (no extra turn reversals)', () => {
  const sample = (v: (typeof MAPPED)[number]) => { const b = buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius), run = b.runs[0]!, pos = b.geometry.getAttribute('position'); const cs: V3[] = []; for (let k = 0; k <= run.tubular; k++) { let x = 0, y = 0, z = 0; for (let j = 0; j < run.radial; j++) { const i = run.tubeStart + k * (run.radial + 1) + j; x += pos.getX(i); y += pos.getY(i); z += pos.getZ(i); } cs.push([x / run.radial, y / run.radial, z / run.radial]); } return cs; };
  const reversals = (cs: V3[]) => { let rev = 0, prev = 0; for (let k = 2; k < cs.length; k++) { const a = [cs[k - 1]![0] - cs[k - 2]![0], cs[k - 1]![1] - cs[k - 2]![1]], c = [cs[k]![0] - cs[k - 1]![0], cs[k]![1] - cs[k - 1]![1]]; const ang = Math.atan2(a[0]! * c[1]! - a[1]! * c[0]!, a[0]! * c[0]! + a[1]! * c[1]!) * 180 / Math.PI; const sg = Math.abs(ang) > 0.5 ? Math.sign(ang) : 0; if (sg && prev && sg !== prev) rev++; if (sg) prev = sg; } return rev; };
  let moved = 0;
  for (const v of MAPPED) {
    if (v.id.startsWith('C') || v.kind === 'shunt') continue;
    const a = off(() => sample(v)), b = on(() => sample(v));
    assert.ok(reversals(b) <= reversals(a) + 1, `${v.id}: ${reversals(a)} turn reversals off, ${reversals(b)} on`);
    // the middle half of the tube is where the 2D course put it (x and y); only the ends move
    // (measured across the 2D course, not along it: a snapped end makes the tube a little longer, which slides the rings along the same path)
    for (let k = Math.ceil(a.length * 0.3); k <= Math.floor(a.length * 0.7); k++) assert.ok(distToPoly([b[k]![0], b[k]![1], 0], a.map((p) => [p[0], p[1], 0] as V3)) < 0.004, `${v.id} ring ${k} moved off the 2D course`);
    const end = Math.max(Math.hypot(a[0]![0] - b[0]![0], a[0]![1] - b[0]![1]), Math.hypot(a.at(-1)![0] - b.at(-1)![0], a.at(-1)![1] - b.at(-1)![1]));
    if (end > 1e-6) moved++;
    assert.ok(end < 0.06, `${v.id}: an end moved ${end.toFixed(3)}`);
  }
  // (placed: the courses already meet at their 3D attach points (placed-network.ts), so smooth joins move no end; the middle and the wiggle checks above still hold)
  assert.ok(moved === 0, `${moved} vessels have an end fitted`);
});

test('one outline rule at every junction: a vein that opens into the cava, and a liver branch that leaves a vein, hold their ink back where they lie inside the other vessel\'s lumen', () => {
  try {
    const s = new CelScene();
    const bury = (id: string) => (s.vesselObject(id) as unknown as { toon: { uniforms: { bury: { value: { x: number; y: number } } } } }).toon.uniforms.bury.value;
    // (a hepatic vein's end at the cava is a skin's arm too since T3 (spec 10.1: the cava's side-wall junction IVCS): the tube stops at the skin's seam, outside the wall, so nothing is held back; with `?joins=old` it is held back inside the cava)
    assert.equal(bury('RHV_IVC').y, 0, 'a hepatic vein\'s end is a skin\'s: no ink held back');
    // (a renal vein's end at the cava is a skin's arm since spec 10.4 (node IVCI): the tube stops at the skin's seam, outside the wall, so nothing is held back there; with `?joins=old` it is held back as before)
    assert.equal(bury('LRV_IVC').y, 0, 'a renal vein\'s end is a skin\'s: no ink held back');
    const old = new CelScene({ joins: 'old' });
    assert.ok(((old.vesselObject('LRV_IVC') as unknown as { toon: { uniforms: { bury: { value: { y: number } } } } }).toon.uniforms.bury.value).y > 0, 'so is a renal vein\'s, with the old joins');
    assert.ok(((old.vesselObject('RHV_IVC') as unknown as { toon: { uniforms: { bury: { value: { y: number } } } } }).toon.uniforms.bury.value).y > 0, 'a hepatic vein\'s is held back inside the cava, with the old joins');
    const oldBury = (id: string) => (old.vesselObject(id) as unknown as { toon: { uniforms: { bury: { value: { x: number; y: number } } } } }).toon.uniforms.bury.value;
    assert.ok(oldBury('PVH_R_2~F:b').x > 0, 'a portal branch\'s start is held back inside the vein it leaves');
    assert.ok(oldBury('RHV_IVC_1~F:b').y > 0, 'a hepatic vein\'s side branch holds back its end (the flow end, at the vein)');
    old.dispose();
    // (a branch whose join end a skin has (the whole-network weld, 21 Nov: the intrahepatic forks) stops at the skin's seam, outside the vein, so nothing is held back there either)
    assert.equal(bury('PVH_R_2~F:b').x, 0, 'a welded portal branch: the tube starts at the skin\'s seam');
    assert.equal(bury('RHV_IVC_1~F:b').y, 0, 'a welded hepatic side branch: the tube ends at the skin\'s seam');
    assert.equal(bury('PVH_R_2').x, 0, 'a vein\'s own free end keeps its whole outline');
    s.dispose();
  } finally { setSmoothJoins(false); }
});

test('no collateral or shunt is a branch of a trunk: its end keeps its course whatever its width (the thinned splenorenal shunt was moved onto the splenic vein\'s axis and pinched to a point, 27 Nov)', () => {
  on(() => {
    for (const v of MAPPED) {
      if (v.kind !== 'shunt' && !/^C\d/.test(v.id)) continue;
      assert.deepEqual(SMOOTH.get(v.id)!.attach, [null, null], `${v.id}: no attach`);
    }
  });
});
