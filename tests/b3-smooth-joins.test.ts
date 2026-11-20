// Smooth vessel joins (Settings > Figure depth): the joins are geometry, behind one switch. These read the tubes the way the shader does and check what the owner asked for: no gap between a branch
// and its trunk, no step or seam where two vessels carry on, clean monotone tapers, the cava ending in the right atrium, the pressure colour continuous along a chain, and the switch off
// being the figure as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPPED, NETWORK_BY_ID, NODE_Z, RUN_ONS } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { TIP_K, buildTubes, buriedRadius, pointFactor, pointLength } from '../src/scene/vessels/tubes.ts';
import { NODE_RISE, SMOOTH, UNEQUAL, joinSwell } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { computeLens, lensColourAt, edgeIndex } from '../src/scene/lenses/model.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { frameFor } from './b3-frames.ts';
import { CelScene } from '../src/scene/scene.ts';
import { useSettings } from '../src/state/settings.ts';
import manifest from '../src/scene/organs/organs-manifest.json' with { type: 'json' };

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
    assert.ok(pairs > 25 && unequal >= 4, `${pairs} pairs, ${unequal} of unequal caliber`);
  });
  // off, those unequal pairs keep their step (the 2D rule)
  off(() => { const ra = ring('PVH_R_2', 1), rb = ring('PRE_R', 0); assert.ok(ra.r > rb.r * 2); });
});

test('a vein narrowing into a thin bed keeps the bed as drawn (only the wide one narrows); two stretches of one vein ease to their mean', () => {
  const s = SMOOTH.get('PRE_R')!, w = SMOOTH.get('PVH_R_2')!, bed = NETWORK_BY_ID.get('PRE_R')!, vein = NETWORK_BY_ID.get('PVH_R_2')!;
  assert.equal(s.taper![0], 1);
  assert.ok(Math.abs(w.taper![1]! * vein.radius - bed.radius) < 1e-9);
  const a = NETWORK_BY_ID.get('PV_TRUNK_1')!, b = NETWORK_BY_ID.get('PV_TRUNK')!, m = (a.radius + b.radius) / 2;
  assert.ok(Math.abs(SMOOTH.get('PV_TRUNK_1')!.taper![1]! * a.radius - m) < 1e-9 && Math.abs(SMOOTH.get('PV_TRUNK')!.taper![0]! * b.radius - m) < 1e-9);
});

test('tapers are monotone: along the first and last 30 % the radius moves from the join\'s width to the vessel\'s own and never back', () => {
  on(() => {
    let checked = 0;
    for (const v of MAPPED) {
      const c = coursesOf(v, REST)[0]!;
      if (!c.taper || v.flare || v.id.startsWith('C')) continue;
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
        assert.ok(Math.abs(prev - v.radius / v.radius * (at(Math.floor(N / 2)))) < 0.02 * at(Math.floor(N / 2)) + 1e-9, `${v.id} end ${end} reaches its own width`);
        checked++;
      }
    }
    assert.ok(checked > 20, `${checked} tapered ends`);
  });
});

test('a branch ends on its trunk: its last ring lies on the trunk\'s centreline (no gap), and its collar and cap stay inside the trunk (no stub out of the far wall)', () => {
  on(() => {
    let fitted = 0;
    for (const v of MAPPED) {
      const sm = SMOOTH.get(v.id)!;
      const c = coursesOf(v, REST)[0]!;
      for (const end of [0, 1] as const) {
        const cl = c.clamp?.[end];
        if (!cl) continue;
        fitted++;
        const hosts = sm.attach[end]!.map((id) => coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts);
        const e = (end ? c.pts[c.pts.length - 1] : c.pts[0])!;
        const hostR = cl.max / 0.8;
        const d = Math.min(...hosts.map((h) => distToPoly(e, h)));
        assert.ok(d < 0.15 * hostR, `${v.id} end ${end}: ${d.toFixed(4)} off the trunk's axis (radius ${hostR.toFixed(4)})`);
        // the end ring and the cap are held to the allowance, and so the ball stays inside the trunk
        const { b: bt, run } = built(v.id), rk = bt.geometry.getAttribute('rk');
        const ringR = rk.getX(run.tubeStart + (end ? run.tubular : 0) * (run.radial + 1)) * v.radius, capR = rk.getX(run.capStart + end * run.capCount) * v.radius;
        assert.ok(ringR <= cl.max + 1e-9, `${v.id} end ${end} ring ${ringR} over ${cl.max}`);
        assert.ok(capR <= cl.max + 1e-9 && d + capR < hostR, `${v.id} end ${end} cap ${capR} stands out of a trunk of ${hostR}`);
      }
    }
    assert.ok(fitted >= 7, `${fitted} branch ends fitted`);
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
  const ra = NODE_RISE.get('RA')!;
  assert.ok(ra.z > heart.zmin && ra.z < heart.zmax, `the end depth ${ra.z} is inside the atrium (${heart.zmin} to ${heart.zmax})`);
  on(() => {
    const ivc = coursesOf(NETWORK_BY_ID.get('IVCS_RA')!, REST)[0]!.pts, svc = coursesOf(NETWORK_BY_ID.get('SVC_RA')!, REST)[0]!.pts;
    const eI = ivc[ivc.length - 1]!, eS = svc[svc.length - 1]!;
    assert.ok(Math.abs(eI[2] - ra.z) < 1e-9 && Math.abs(eS[2] - ra.z) < 1e-9);
    assert.ok(dist(eI, eS) < 1e-9, 'the two end at one point');
    // one slope each: the distance to the atrium's depth never grows toward the end (no dip behind the heart on the way in)
    for (const pts of [ivc, svc]) for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i]![2] - ra.z) <= Math.abs(pts[i - 1]![2] - ra.z) + 1e-9, `toward the atrium at ${i}`);
    assert.ok(Math.min(...ivc.map((p) => p[2])) > -0.1, 'the cava\'s last stretch no longer lies 0.3 behind the heart');
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
  assert.ok(VESSEL_VS.includes('smoothstep(0.0, 0.3, uv.x)') && VESSEL_VS.includes('smoothstep(0.7, 1.0, uv.x)'));
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
  // a lens whose colour does not run along the vessel gives its ends\' blend (so nothing else moves with the switch on)
  const f = computeLens('flow', frame as never, 'light', { healthy, ref: null });
  for (let k = 0; k < NE; k++) { if (f.grad[k * 4 + 3] === 0) continue; for (let i = 0; i < 3; i++) { const a = f.grad[k * 4 + i]!, b = f.grad[(NE + k) * 4 + i]!; assert.ok(Math.abs(f.grad[(2 * NE + k) * 4 + i]! - (a + (b - a) / 3)) < 1e-6); assert.ok(Math.abs(f.grad[(3 * NE + k) * 4 + i]! - (a + (b - a) * 2 / 3)) < 1e-6); } }
});

test('every vessel\'s ink shares the one stencil (an outline round the union, never doubled at a fork), with the switch on or off', () => {
  const s = new CelScene();
  let n = 0;
  for (const v of MAPPED) {
    const o = s.vesselObject(v.id) as unknown as { hullMat: { stencilWrite: boolean; stencilRef: number; stencilFunc: number; stencilZPass: number; stencilFail: number; stencilZFail: number } };
    const h = o.hullMat;
    assert.ok(h.stencilWrite && h.stencilRef === 1, v.id);
    assert.deepEqual([h.stencilFunc, h.stencilZPass, h.stencilFail, h.stencilZFail], [517, 7681, 7680, 7680], v.id);   // NotEqual, Replace, Keep, Keep
    n++;
  }
  assert.ok(n > 50);
  s.dispose();
});

test('the switch applies live: toggling it rewrites every tube in place (same vertices), sets or clears the shader\'s mates and the colour path, and a free tube is drawn once', () => {
  const was = useSettings.getState().smoothJoins;
  try {
    useSettings.getState().set('smoothJoins', true);
    const s = new CelScene();
    assert.equal(smoothJoinsOn(), true, 'the scene took the setting');
    const obj = (id: string) => s.vesselObject(id) as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array; count: number } } }; toon: { uniforms: Record<string, { value: { x: number } | number }> } };
    const posOn = Float32Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), nOn = obj('PVH_L').toonMesh.geometry.getAttribute('position').count;
    const rkOn = Float32Array.from(obj('PVH_R_2').toonMesh.geometry.getAttribute('rk').array);
    assert.ok((obj('PV_TRUNK').toon.uniforms.mate1!.value as { x: number }).x >= 0 && obj('PV_TRUNK').toon.uniforms.lensSmooth!.value === 1);
    useSettings.getState().set('smoothJoins', false);
    assert.equal(smoothJoinsOn(), false);
    assert.equal(obj('PVH_L').toonMesh.geometry.getAttribute('position').count, nOn, 'the same vertices');
    assert.notDeepEqual(Array.from(posOn), Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), 'the branch end moved back');
    assert.notDeepEqual(Array.from(rkOn), Array.from(obj('PVH_R_2').toonMesh.geometry.getAttribute('rk').array), 'the step is back');
    assert.equal((obj('PV_TRUNK').toon.uniforms.mate1!.value as { x: number }).x, -1);
    assert.equal(obj('PV_TRUNK').toon.uniforms.lensSmooth!.value, 0);
    useSettings.getState().set('smoothJoins', true);
    assert.deepEqual(Array.from(obj('PVH_L').toonMesh.geometry.getAttribute('position').array), Array.from(posOn), 'and on again is the same drawing');
    s.dispose();
  } finally { useSettings.getState().set('smoothJoins', was); setSmoothJoins(false); }
});
