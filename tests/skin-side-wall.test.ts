// T3 of the junction skins (docs/junction-skin-spec.md section 10.1): SIDE-WALL arms and HOLES. A junction that lies on a tube's side, not at a node, has that tube as an arm on each side of it (or one side, when the tube ends in the skin's reach):
// the walk of its rings starts at the ring nearest the junction, the tube is cut (one side) or has a hole (both sides) there, and the cava, whose three hepatic veins end on its side 1.7 to 7.1 radii down its axis, is welded this way.
// Pure numbers and the real network; no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { JUNCTIONS } from '../src/engine/hales/portal/topology.js';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { TUBE_RADIAL, buildTubes } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { shaderText } from './shader-text.ts';
import { armWalk, chooseCuts, type ArmTube } from '../src/scene/vessels/skin/cuts.ts';
import { SIDE_TOL_R, SKIN_REACH, armReach, findSkinJunctions, isLiverBranch, joinsNode, nearestOnPolyline, pointAtShare } from '../src/scene/vessels/skin/inventory.ts';
import { GENTLE, PACES, SLOW, buildSkin, buildSkinSteady, foldedTriangles, hullCovers, minAngleDeg } from '../src/scene/vessels/skin/mesh.ts';
import { SkinSet, axisOf, holesOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_HOLE_NONE, SkinBuildError, type SkinArm, type SkinCut, type SkinJunction, type Vec3 } from '../src/scene/vessels/skin/types.ts';
import type { Capsule } from '../src/scene/vessels/skin/sdf.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const N = TUBE_RADIAL;
const arm = (id: string, R: number, end: 0 | 1, side?: SkinArm['side']): SkinArm => ({ vesselId: id, end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: R, ...(side ? { side } : {}) });
const tube = (pts: [number, number, number][], R: number, tubular: number): ArmTube => { const b = buildTubes([{ pts, radius: R }], [tubular], R); return { geometry: b.geometry, tubular: b.runs[0]!.tubular }; };
const ringOf = (t: ArmTube, k: number): { pos: Float32Array; nor: Float32Array } => {
  const p = t.geometry.getAttribute('position'), n = t.geometry.getAttribute('normal'), pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  for (let j = 0; j < N; j++) { const i = k * (N + 1) + j; pos.set([p.getX(i), p.getY(i), p.getZ(i)], j * 3); nor.set([n.getX(i), n.getY(i), n.getZ(i)], j * 3); }
  return { pos, nor };
};
const capsuleOf = (a: { pts: readonly Vec3[]; radii: readonly number[] }): Capsule => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii) });

/** Closed except at the seams: every edge has two triangles, but the seam rings' edges, which have one each (the tubes' own rings go on from them), and there are exactly the arms' ring edges of those. */
function assertWatertight(m: { index: Uint32Array; seamVerts: Uint32Array[] }): void {
  const e = new Map<string, number>(), key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < m.index.length; i += 3) for (let s = 0; s < 3; s++) { const k = key(m.index[i + s]!, m.index[i + (s + 1) % 3]!); e.set(k, (e.get(k) ?? 0) + 1); }
  const seam = new Set<string>();
  for (const ids of m.seamVerts) for (let q = 0; q < ids.length; q++) seam.add(key(ids[q]!, ids[(q + 1) % ids.length]!));
  for (const [k, c] of e) assert.equal(c, seam.has(k) ? 1 : 2, `edge ${k}${seam.has(k) ? ' (a seam edge)' : ''}`);
  for (const k of seam) assert.ok(e.has(k), `seam edge ${k} is in the skin`);
}

test('armWalk: an end arm walks from the tube\'s own end, a side arm from the ring nearest its u, outward either way', () => {
  assert.deepEqual(armWalk({ end: 1 }, 40), { from: 40, step: -1, count: 41 });
  assert.deepEqual(armWalk({ end: 0 }, 40), { from: 0, step: 1, count: 41 });
  assert.deepEqual(armWalk({ end: 1, side: { u: 0.5, dir: -1 } }, 40), { from: 20, step: -1, count: 21 }, 'the part below u: end-1-like');
  assert.deepEqual(armWalk({ end: 0, side: { u: 0.5, dir: 1 } }, 40), { from: 20, step: 1, count: 21 }, 'the part above u: end-0-like');
  assert.deepEqual(armWalk({ end: 1, side: { u: 0.77, dir: -1 } }, 16), { from: 12, step: -1, count: 13 }, 'u rounds to a ring');
});

test('a synthetic T with a hole: a branch ends on the side of a straight host; the host is an arm on each side of it, the cuts leave a hole, the skin is closed and fold-free and starts on the tubes\' own rings', () => {
  const R = 0.1, r = 0.04, host = tube([[-3, 0, 0], [3, 0, 0]], R, 60), branch = tube([[0, R * 0.6, 0], [0, 3, 0]], r, 30);
  const J: Vec3 = [0, 0, 0];
  const arms = [arm('H', R, 1, { u: 0.5, dir: -1 }), arm('H', R, 0, { u: 0.5, dir: 1 }), arm('B', r, 0)];
  const j: SkinJunction = { node: 'T', J, arms };
  const tubes = new Map([['H', host], ['B', branch]]);
  const cuts = chooseCuts(j, tubes, (cs) => hullCovers(cs.map((c) => ringOf(tubes.get(c.vesselId)!, c.ring).pos)));
  const [lo, hi, br] = cuts as [SkinCut, SkinCut, SkinCut];
  assert.equal(lo.side, -1); assert.equal(hi.side, 1); assert.equal(br.side, undefined);
  assert.ok(lo.ring < 30 && hi.ring > 30, `the host's two seams (${lo.ring}, ${hi.ring}) lie on either side of the junction ring 30`);
  assert.ok(Math.abs(lo.ring - 30) >= 1.5 * R / (6 / 60) && Math.abs(hi.ring - 30) >= 1.5 * R / (6 / 60), 'each seam is at least 1.5 radii from J (rings are 0.1 apart)');
  const holes = holesOf(cuts);
  assert.deepEqual(holes, [{ id: 'H', lo: lo.u, hi: hi.u }], 'two side arms of one vessel are a hole between their seams');
  assert.ok(lo.u < hi.u, 'the hole runs low to high');
  const rings = cuts.map((c) => ringOf(tubes.get(c.vesselId)!, c.ring));
  const axes = arms.map((a, i) => axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!, J, a.side ? armWalk(a, tubes.get(a.vesselId)!.tubular).from : undefined));
  const m = buildSkin(j, cuts, rings.map((x) => x.pos), rings.map((x) => x.nor), axes.map(capsuleOf));
  // the skin's seam vertices ARE the tubes' ring vertices (no crack at the hole's edges)
  m.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { for (let d = 0; d < 3; d++) assert.equal(m.position[v * 3 + d], rings[a]!.pos[q * 3 + d]!, `arm ${a} seam vertex ${q}`); }));
  assertWatertight(m);
  assert.deepEqual(foldedTriangles(m.position, m.normal, m.index), [], 'no fold');
  let worst = 180;
  for (let i = 0; i < m.index.length; i += 3) worst = Math.min(worst, minAngleDeg(m.position, m.index[i]!, m.index[i + 1]!, m.index[i + 2]!));
  assert.ok(worst > 10, `smallest angle ${worst.toFixed(1)} degrees`);
  // one host side only: the cut is an ordinary one (no hole)
  assert.deepEqual(holesOf([lo, br]), []);
});

test('a bridge: an arm that ends 3 radii short of J is still welded (every capsule starts at J, spec 10.5), on the side-wall path too', () => {
  const R = 0.1, r = 0.04, host = tube([[-3, 0, 0], [3, 0, 0]], R, 60), branch = tube([[0, 3 * R, 0], [0, 3, 0]], r, 30);
  const J: Vec3 = [0, 0, 0], arms = [arm('H', R, 1, { u: 0.5, dir: -1 }), arm('H', R, 0, { u: 0.5, dir: 1 }), arm('B', r, 0)];
  const j: SkinJunction = { node: 'TB', J, arms }, tubes = new Map([['H', host], ['B', branch]]);
  const cuts = chooseCuts(j, tubes, (cs) => hullCovers(cs.map((c) => ringOf(tubes.get(c.vesselId)!, c.ring).pos)));
  const rings = cuts.map((c) => ringOf(tubes.get(c.vesselId)!, c.ring));
  const axes = arms.map((a, i) => axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!, J, a.side ? armWalk(a, tubes.get(a.vesselId)!.tubular).from : undefined));
  assert.deepEqual([...axes[2]!.pts[0]], [...J], 'the branch\'s capsule starts at J: the gap is bridged with its own width');
  const m = buildSkin(j, cuts, rings.map((x) => x.pos), rings.map((x) => x.nor), axes.map(capsuleOf));
  assert.deepEqual(foldedTriangles(m.position, m.normal, m.index), []);
});

test('the tube: no hole by default, setSkinHole writes the two slots and reports a change only when there is one, and the fragment stage discards inside a hole by the same rule as a cut', () => {
  assert.deepEqual([...SKIN_HOLE_NONE], [2, -1]);
  const was = smoothJoinsOn(), scene = new CelScene({ joins: 'old' });
  try {
    const o = scene.vesselObject('IVC_IS') as VesselObject;
    assert.deepEqual([o.skinHole(0), o.skinHole(1)], [[2, -1], [2, -1]]);
    assert.equal(o.setSkinHole(0, 0.3, 0.6), true); assert.equal(o.setSkinHole(0, 0.3, 0.6), false);
    assert.equal(o.setSkinHole(1, 0.7, 0.8), true);
    assert.deepEqual([o.skinHole(0), o.skinHole(1)], [[0.3, 0.6], [0.7, 0.8]]);
    assert.equal(o.setSkinHole(0, ...SKIN_HOLE_NONE), true); assert.equal(o.setSkinHole(1, ...SKIN_HOLE_NONE), true);
    assert.deepEqual(o.skinCut(), [-1, 2], 'a hole does not touch the cut');
  } finally { scene.dispose?.(); setSmoothJoins(was); }
  assert.match(shaderText(VESSEL_FS), /uniform vec2 skinHole;/); assert.match(shaderText(VESSEL_FS), /uniform vec2 skinHole2;/);
  assert.match(shaderText(VESSEL_FS), /bool inSkinHole\(vec2 h\) \{ return h\.y > h\.x && vUv\.x > h\.x \+ [^;]*&& vUv\.x < h\.y - [^;]*; \}/, 'inside (lo, hi), a hair of margin so the seam rings themselves are kept');
  assert.match(shaderText(VESSEL_FS), /inSkinHole\(skinHole\) \|\| inSkinHole\(skinHole2\)/);
  assert.match(shaderText(VESSEL_FS), /if \(skinCutOn\(\) && skinPast\(\)\) \{[^}]*cutA <= 0\.0[^}]*discard;/s, 'the Circuit rule (the cut part comes back as the skin goes) is the cut\'s own');
});

test('the set keeps a vessel\'s holes (two slots), writes them to the tube, and takes them back; a third hole is a SkinBuildError', () => {
  const calls: string[] = [], slots = new Map<string, [number, number][]>();
  const rec = (id: string) => ({ setSkinCut: () => true, setSkinWeld: () => true, setSkinHole: (slot: number, lo: number, hi: number) => { const s = slots.get(id) ?? [[2, -1], [2, -1]]; s[slot] = [lo, hi]; slots.set(id, s); calls.push(`${id}:${slot}:${lo}:${hi}`); return true; } });
  const objs = new Map<string, ReturnType<typeof rec>>();
  const set = new SkinSet({ vessel: (id) => { if (!objs.has(id)) objs.set(id, rec(id)); return objs.get(id) as never; }, stateOf: () => undefined, make: () => ({}) as never, add: () => {}, remove: () => {} });
  const priv = set as unknown as { takeCuts(b: unknown): string[]; dropCuts(b: unknown): void; putHoles(id: string): void };
  const built = (node: string, lo: number, hi: number) => ({ node, arms: [{ id: 'H', end: 1, u: lo }, { id: 'H', end: 0, u: hi }, { id: 'B', end: 0, u: 0.1 }], hidden: [], holes: [{ id: 'H', lo, hi }] });
  const a = built('A', 0.2, 0.3), b = built('B', 0.5, 0.6), c = built('C', 0.8, 0.9);
  priv.takeCuts(a); priv.takeCuts(b);
  priv.putHoles('H');
  assert.deepEqual(set.holesOn('H').map((h) => [h.lo, h.hi]), [[0.2, 0.3], [0.5, 0.6]]);
  assert.deepEqual(slots.get('H'), [[0.2, 0.3], [0.5, 0.6]]);
  assert.equal(set.endsOf('H')[0] || set.endsOf('H')[1], false, 'a hole does not make the host\'s own ends skinned (their mates and ink stay)');
  assert.throws(() => priv.takeCuts(c), (e: unknown) => e instanceof SkinBuildError, 'a vessel has at most two holes');
  priv.dropCuts(a);
  assert.deepEqual(slots.get('H'), [[0.5, 0.6], [2, -1]], 'the first skin\'s hole goes, the second\'s moves to slot 0');
  priv.dropCuts(b);
  assert.deepEqual(slots.get('H'), [[2, -1], [2, -1]]);
});

// ---- the real network: the cava ----
const withSmooth = <T,>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

// (placed anatomy, round 18 (Mohammad, 25 Nov: "RHV alone, MHV+LHV shared trunk"): the hepatic veins open at the cava's node itself, IVC_IS's end, not 1.7 to 7.1 cava radii down its side as the 2D art spread them. IVCS is a NODE junction of five arms
//  (the cava below and above, the three veins), no side arm; the side-wall rule's real cases are the left portal vein's LPV (PVH_L_1 runs on past the node into the left lobe) and the hepatic vein's mid-host fork)
test('IVCS: the hepatic veins open at the cava\'s node, so the junction is a node one of five arms: no side arm, every arm within the reach', () => {
  withSmooth(() => {
    const j = findSkinJunctions().find((x) => x.node === 'IVCS')!;
    assert.ok(j, 'IVCS is a junction');
    assert.equal(j.arms.filter((a) => a.side).length, 0, 'no side arm');
    assert.deepEqual(j.arms.map((a) => `${a.vesselId}:${a.end}`).sort(), ['IVCS_RA:0', 'IVC_IS:1', 'LHV_IVC:1', 'MHV_IVC:1', 'RHV_IVC:1']);
    const cava = coursesOf(NETWORK_BY_ID.get('IVC_IS')!, REST)[0]!.pts as Vec3[];
    // (the right hepatic vein and the common trunk open into the cava; the middle hepatic vein opens into the trunk beside it (fades.ts trunkMateOf), so it ends on the trunk's axis, not the cava's)
    for (const id of ['RHV_IVC', 'LHV_IVC']) {
      const pts = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts, e = pts[pts.length - 1]!, n = nearestOnPolyline(cava, e);
      assert.ok(n.d <= SIDE_TOL_R * NETWORK_BY_ID.get('IVC_IS')!.radius, `${id} ends ${(n.d / NETWORK_BY_ID.get('IVC_IS')!.radius).toFixed(2)} cava radii from its axis`);
    }
    { const t = coursesOf(NETWORK_BY_ID.get('LHV_IVC')!, REST)[0]!.pts as Vec3[], pts = coursesOf(NETWORK_BY_ID.get('MHV_IVC')!, REST)[0]!.pts, n = nearestOnPolyline(t, pts[pts.length - 1]!);
      assert.ok(n.d <= SIDE_TOL_R * NETWORK_BY_ID.get('LHV_IVC')!.radius, `MHV_IVC ends ${(n.d / NETWORK_BY_ID.get('LHV_IVC')!.radius).toFixed(2)} trunk radii from the common trunk's axis`); }
    assert.ok(armReach(j).every((r) => r <= SKIN_REACH), `reach ${armReach(j).map((r) => r.toFixed(1)).join(', ')}`);
    void pointAtShare;
  });
});

test('IVCS is welded: five arms, the cava cut below the hepatic veins and its end inside the skin, no fold, closed, a fair mesh, meshed from the union\'s surface (the last rung of the pace ladder)', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const warnings: string[] = [];
    const set = new SkinSet({ vessel: (id) => scene.vesselObject(id), stateOf: () => undefined, make: (mesh, axes, arms) => new SkinObject(mesh, arms[0]!, axes, arms), add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: (m) => warnings.push(m) });
    set.build(2);
    assert.deepEqual(warnings, []);
    const m = set.skinOf('IVCS')!;
    assert.ok(m, 'IVCS has a skin');
    assert.equal(m.junction.arms.length, 5);
    const cut = m.cuts[m.junction.arms.findIndex((a) => a.vesselId === 'IVC_IS')]!;
    assert.equal(cut.side, undefined, 'an end cut, not a side one');
    // (its START is the IVC_D junction's seam since the DIPS stent's skin: the IVCS end is what this test is about)
    assert.equal(scene.vesselObject('IVC_IS')!.skinCut()[1], cut.u, 'the cava is drawn only up to the seam: its end is inside the skin');
    assert.equal(set.endsOf('IVC_IS')[1], true, 'its end is skinned (mate and bury off there)');
    assert.deepEqual(set.holesOn('IVC_IS'), [], 'a cut, not a hole');
    // (the seam lies below BOTH hepatic mouths, which are level since mock F (25 Nov): at least 2 cava radii under the lower of them, so the five arms' ring clears the cava's cut)
    const seamY = centrelineOf('IVC_IS')!.pointAt(cut.u)[1]!, mouthY = Math.min(...m.junction.arms.filter((a) => a.vesselId === 'RHV_IVC' || a.vesselId === 'LHV_IVC').map((a) => (centrelineOf(a.vesselId)!.pointAt(a.end === 0 ? 0 : 1)[1])!));
    assert.ok(cut.u > 0.2 && seamY < mouthY - 2 * NETWORK_BY_ID.get('IVC_IS')!.radius, `the cava's seam is ${cut.u.toFixed(2)} of its length, y ${seamY.toFixed(3)} (the lowest hepatic mouth ${mouthY.toFixed(3)})`);
    assert.deepEqual(foldedTriangles(m.position, m.normal, m.index), []);
    assertWatertight(m);
    let worst = 180;
    for (let i = 0; i < m.index.length; i += 3) worst = Math.min(worst, minAngleDeg(m.position, m.index[i]!, m.index[i + 1]!, m.index[i + 2]!));
    assert.ok(worst > 8, `smallest angle ${worst.toFixed(1)} degrees`);
    assert.ok(m.junction.surface, 'meshed from the surface (five arms close together: the hull starts far from it)');
    assert.equal((set as unknown as { paces: Map<string, number> }).paces.get('IVCS'), PACES.length - 1, 'on the last rung');
  } finally { scene.dispose?.(); setSmoothJoins(was); }
});

test('the side-wall rule changes only a node the art spreads past SKIN_REACH: every other junction is as it was (no side arm, J at the widest arm\'s end)', () => {
  withSmooth(() => {
    const sides = findSkinJunctions().filter((j) => j.arms.some((a) => a.side)).map((j) => j.node);
    // (placed: the left portal vein's take-offs are nodes of their own since the junction table cuts the vein there, LPV_U and LPV_X, so the old side-wall node LPV is gone: the only side arms left are a liver branch's, a virtual node on its host, and which those are is read from the network, not typed)
    const branches = NETWORK.filter((v) => isLiverBranch(v) && !joinsNode(v)).map((v) => v.id.replace(/~F:b$/, '') + '~F:b').sort();
    assert.deepEqual(sides.sort(), branches, 'only the hepatic vein fork that leaves its host mid-run (a liver branch: a virtual node on the host with two side arms)');
    assert.ok(branches.length > 0, 'the network has such a fork');
    // the table's nodes are real nodes, never a side landing on a host: no junction the engine's table names has a side arm
    for (const row of JUNCTIONS as readonly (readonly unknown[])[]) { const node = row[0] as string; assert.ok(!sides.includes(node), `${node} is a node of the figure, no side arm`); }
  });
});
