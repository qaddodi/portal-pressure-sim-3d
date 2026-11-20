// Junction skins, WP1 (spec 4.1, 4.2, 4.4): the inventory of nodes that get a skin, their arms, their centre, and where each arm's tube is cut. Computed from the real network, never from a list of ids,
// so a change to the network that adds, drops or re-kinds a junction fails here by name. Node only: no scene, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK, NETWORK_BY_ID, cutEnd } from '../src/scene/vessels/network.ts';
import { BACK_EDGES, IVC_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes, TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { ATTACH_REACH } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { PERMANENT_KINDS, armReach, armsShareTier, findSkinJunctions, isPermanent, skinNodesForPhase, tierSpread } from '../src/scene/vessels/skin/inventory.ts';
import { CAPSULE_R, CUT_SKIN_K, MAX_TRIES, SEAM_MIN_R, chooseCuts, type ArmTube } from '../src/scene/vessels/skin/cuts.ts';
import { SkinBuildError, type SkinCut, type SkinJunction } from '../src/scene/vessels/skin/types.ts';
import { indexOf } from '../src/engine/vessel-data.ts';

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

/** The table of spec 4.1, as the network's own rule computes it on 20 Nov 2026 (the arms by id and end). The test pins it exactly. */
const TABLE: Record<string, readonly string[]> = {
  CONF: ['SMV_CONF:1', 'SV_CONF:1', 'PV_TRUNK_1:0'],
  PVT_L: ['PV_TRUNK_1:1', 'PV_TRUNK:0', 'LGV_CONF:1'],
  SV: ['V_IMV:1', 'SV_MID:1', 'SV_CONF:0'],
  PVH: ['PV_TRUNK:1', 'PVH_R:0', 'PVH_L:0'],
  HA: ['A_HEP:1', 'A_HR:0', 'A_HL:0'],
  CV_R: ['SIN_RR:1', 'POST_R_RHV:0', 'POST_R_MHV:0'],
  SIN_R: ['A_HR:1', 'PRE_R:1', 'SIN_RR:0'],
  SIN_L: ['A_HL:1', 'PRE_L:1', 'SIN_LL:0'],
};
const PHASE_2 = ['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R'];
const armKeys = (j: SkinJunction): string[] => j.arms.map((a) => `${a.vesselId}:${a.end}`).sort();

test('the inventory is the table of the spec exactly: eight nodes, their arms and ends, nothing else (SVC_E, in the spec table, is out: its arms are BACK_EDGES, spec 4.8)', () => {
  const js = on(() => findSkinJunctions());
  assert.deepEqual(js.map((j) => j.node).sort(), Object.keys(TABLE).sort());
  for (const j of js) assert.deepEqual(armKeys(j), [...TABLE[j.node]!].sort(), j.node);
});

test('phase 1 is the confluence alone and phase 2 every node the table marks 2; the liver beds are in neither', () => {
  assert.deepEqual([...skinNodesForPhase(1)], ['CONF']);
  assert.deepEqual([...skinNodesForPhase(2)].sort(), [...PHASE_2].sort());
  const nodes = new Set(on(() => findSkinJunctions()).map((j) => j.node));
  for (const p of [1, 2] as const) for (const n of skinNodesForPhase(p)) assert.ok(nodes.has(n), `${n} is in the inventory`);
  for (const n of ['SIN_R', 'SIN_L']) for (const p of [1, 2] as const) assert.ok(!skinNodesForPhase(p).has(n));
});

test('every arm is a permanent tube: no collateral, shunt, feeder or strand is ever an arm; 3 or 4 arms, widest first, with the vessel\'s own numbers', () => {
  for (const j of on(() => findSkinJunctions())) {
    assert.ok(j.arms.length === 3 || j.arms.length === 4, j.node);
    for (let i = 0; i < j.arms.length; i++) {
      const a = j.arms[i]!, v = NETWORK_BY_ID.get(a.vesselId)!;
      assert.ok(v, a.vesselId);
      assert.ok(PERMANENT_KINDS.has(v.kind) && !['collateral', 'shunt', 'feeder'].includes(v.kind), `${a.vesselId} is ${v.kind}`);
      assert.ok(!v.feeder && !a.vesselId.includes('~F') && !/^(C\d|S_|TIPS$|DIPS$|REX$)/.test(a.vesselId), a.vesselId);
      assert.equal(a.courseIndex, 0);
      assert.equal(a.dataIndex, indexOf(v.lensId)); assert.equal(a.lensIndex, a.dataIndex);
      assert.equal(a.baseD, v.baseD); assert.equal(a.widthKind, v.widthKind); assert.equal(a.restR, v.radius);
      assert.equal(a.end === 0 ? v.from : v.to, j.node, `${a.vesselId} end ${a.end} is at ${j.node}`);
      if (i > 0) assert.ok(j.arms[i - 1]!.restR >= a.restR, `${j.node}: widest first`);
    }
  }
  for (const v of NETWORK) if (v.kind === 'collateral' || v.kind === 'shunt' || v.feeder) assert.ok(!isPermanent(v), v.id);
});

test('the node where a faded cava or a vessel behind the organs meets is out, and so is the end of a vein that branches into a through-tube', () => {
  const nodes = new Set(on(() => findSkinJunctions()).map((j) => j.node));
  for (const n of ['IVCS', 'IVCI', 'SVC_E']) assert.ok(!nodes.has(n), n);
  for (const j of on(() => findSkinJunctions())) for (const a of j.arms) { assert.ok(!IVC_EDGES.has(a.vesselId), a.vesselId); assert.notEqual(cutEnd(a.vesselId), a.end, a.vesselId); }
});

test('no arm is drawn behind the organs (BACK_EDGES): a skin is drawn on the vessel layer only', () => {
  for (const j of on(() => findSkinJunctions())) for (const a of j.arms) assert.ok(!BACK_EDGES.has(a.vesselId), `${j.node}: ${a.vesselId}`);
});

test('J is the end point of the widest arm\'s course; with smooth joins on every arm of a phase node ends within ATTACH_REACH of it (the liver bed\'s CV_R, whose art leaves the gap, within two)', () => {
  on(() => {
    for (const j of findSkinJunctions()) {
      const w = NETWORK_BY_ID.get(j.arms[0]!.vesselId)!, pts = coursesOf(w, REST)[0]!.pts, e = pts[j.arms[0]!.end ? pts.length - 1 : 0]!;
      assert.deepEqual([...j.J], [...e], `${j.node}: J`);
      if (!PHASE_2.includes(j.node)) continue;
      const reach = armReach(j);
      assert.equal(reach[0], 0, j.node);
      // (CV_R: the 2D art leaves its two hepatic-vein beds 1.7 radii of a thin bed from the sinusoid's end, shape.ts fitEnds does not move beds; the skin's capsules start at J, so the gap is filled by the fillet)
      const cap = j.node === 'CV_R' ? 2 : ATTACH_REACH;
      reach.forEach((r, i) => assert.ok(r <= cap, `${j.node}: ${j.arms[i]!.vesselId} ends ${r.toFixed(2)} radii from J`));
    }
  });
});

test('the arms of every phase node meet it at one depth on the 2D rule\'s courses (the skin\'s screen-space ink needs one tier)', () => {
  on(() => { for (const j of findSkinJunctions()) if (PHASE_2.includes(j.node)) { assert.ok(armsShareTier(j), `${j.node}: spread ${tierSpread(j)}`); } });
  assert.equal(smoothJoinsOn(), false, 'tierSpread leaves the mode as it found it');
});

// ---- the cuts, on the real tubes as the scene builds them ----
const tubesOf = (j: SkinJunction): Map<string, ArmTube> => new Map(j.arms.map((a) => {
  const v = NETWORK_BY_ID.get(a.vesselId)!, b = buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius);
  return [a.vesselId, { geometry: b.geometry, tubular: b.runs[0]!.tubular }] as const;
}));
const ringVerts = (t: ArmTube, k: number): number[][] => {
  const pos = t.geometry.getAttribute('position');
  return Array.from({ length: TUBE_RADIAL }, (_, j) => { const i = k * (TUBE_RADIAL + 1) + j; return [pos.getX(i), pos.getY(i), pos.getZ(i)]; });
};
const accept = () => true;

/** Where the cut rules succeed on the real tubes today. PVH (the portal bifurcation: its right branch is a stub of 4 radii, shorter than the clearance 2k + 2R asks) and the two liver beds' junctions have no ring that clears the blend, so the scene keeps today's method at them (a named SkinBuildError). Pinned so a change either way is seen. */
const CUTTABLE = ['CONF', 'PVT_L', 'SV', 'HA', 'CV_R'], UNCUTTABLE = ['PVH', 'SIN_R', 'SIN_L'];

test('a cut is one of the tube\'s own rings, at the right end, with u = ring / tubular, at least 1.5 radii from J, and clear of the blend', () => {
  on(() => {
    for (const j of findSkinJunctions()) {
      if (!CUTTABLE.includes(j.node)) continue;
      const tubes = tubesOf(j), cuts = chooseCuts(j, tubes, accept);
      assert.equal(cuts.length, j.arms.length);
      cuts.forEach((c, i) => {
        const a = j.arms[i]!, t = tubes.get(a.vesselId)!;
        assert.equal(c.vesselId, a.vesselId); assert.equal(c.end, a.end);
        assert.ok(Number.isInteger(c.ring) && c.ring >= 0 && c.ring <= t.tubular, `${j.node}/${a.vesselId} ring ${c.ring}`);
        assert.equal(c.u, c.ring / t.tubular);
        const centre = [0, 1, 2].map((d) => ringVerts(t, c.ring).reduce((s, p) => s + p[d]!, 0) / TUBE_RADIAL);
        assert.ok(Math.hypot(centre[0]! - j.J[0], centre[1]! - j.J[1], centre[2]! - j.J[2]) >= SEAM_MIN_R * a.restR - 1e-9, `${j.node}/${a.vesselId} too near J`);
        // counted from the node: end 1 ring k is `tubular - k` rings out, end 0 ring k is `k` out
        assert.ok((a.end ? t.tubular - c.ring : c.ring) > 0, `${j.node}/${a.vesselId} is cut at the node's own end ring`);
      });
    }
  });
});

test('where no ring clears the blend, chooseCuts throws a SkinBuildError for the node (the scene then keeps today\'s method there), and nowhere else', () => {
  on(() => {
    for (const j of findSkinJunctions()) {
      if (UNCUTTABLE.includes(j.node)) assert.throws(() => chooseCuts(j, tubesOf(j), accept), (e: unknown) => e instanceof SkinBuildError && e.node === j.node, j.node);
      else if (CUTTABLE.includes(j.node)) assert.doesNotThrow(() => chooseCuts(j, tubesOf(j), accept), j.node);
      else assert.fail(`${j.node} is in neither list`);
    }
  });
});

test('chooseCuts moves the arms out when the hull refuses, one ring at a time, and every ring it hands back is still a clear one', () => {
  on(() => {
    const j = findSkinJunctions().find((x) => x.node === 'CONF')!, tubes = tubesOf(j);
    const first = chooseCuts(j, tubes, accept);
    let calls = 0;
    const moved = chooseCuts(j, tubes, () => ++calls > 3);
    assert.equal(calls, 4);
    const steps = moved.reduce((s, c, i) => s + Math.abs(c.ring - first[i]!.ring), 0);
    assert.ok(steps >= 3, 'three refusals moved at least three rings');
    moved.forEach((c, i) => assert.ok(j.arms[i]!.end ? c.ring <= first[i]!.ring : c.ring >= first[i]!.ring, 'only outward'));
  });
});

test('a hull that never agrees ends in a named SkinBuildError carrying the node, after at most 40 tries; the scene then keeps today\'s method there', () => {
  on(() => {
    const j = findSkinJunctions().find((x) => x.node === 'PVT_L')!, tubes = tubesOf(j);
    let calls = 0;
    assert.throws(() => chooseCuts(j, tubes, () => { calls++; return false; }), (e: unknown) => e instanceof SkinBuildError && e.name === 'SkinBuildError' && e.node === 'PVT_L' && e.message.includes('PVT_L'));
    assert.ok(calls <= MAX_TRIES, `${calls} tries`);
    assert.throws(() => chooseCuts(j, new Map(), accept), SkinBuildError);
  });
});

test('the cut constants are the spec\'s: blend 0.8 of the narrowest radius, a seam 1.5 radii out, a capsule 6 radii long, 40 tries', () => {
  assert.equal(CUT_SKIN_K, 0.8); assert.equal(SEAM_MIN_R, 1.5); assert.equal(CAPSULE_R, 6); assert.equal(MAX_TRIES, 40);
});

test('the inventory leaves the figure as it found it: the smooth-joins switch is where the test left it, and nothing here reads the scene', () => {
  const was = smoothJoinsOn();
  findSkinJunctions();
  assert.equal(smoothJoinsOn(), was);
});
