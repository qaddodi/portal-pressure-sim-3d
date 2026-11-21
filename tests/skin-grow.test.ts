// Junction skins, growing arms (docs/junction-skin-spec.md 10.2, 10.6, 10.7; FINAL-WELD-PLAN.md option A, "Grow, then weld"). A collateral or a shunt comes and goes. It is an arm of the skin at its node like any other, and the skin is ONE STATIC SHAPE with it at full size:
// nothing is morphed (the growth morph, a linear lerp between a closed and an open shape along a curved path, was the cause of the folds at growth 0.2 to 0.4). While the arm grows its end is the tube's own (flared) end and a plain static skin of the arms that stay
// draws the junction; from growth 0.9 to 1 the welded skin comes in over the tube's cut end by the tubes' own screen dither (plain.ts weldOf, skin-set.ts sync), the plain trunk goes out on the complementary pixels.
// Node only: the real network, the real scene's tubes, no browser. Run: node --test tests/skin-grow.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { JOINT_REACH_R } from '../src/scene/vessels/network.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { GROW_REACH, GROWER_KINDS, dropFarGrowers, findSkinJunctions, isGrower, isPermanent, isLiverBranch, withoutGrowers } from '../src/scene/vessels/skin/inventory.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { armPresenceAt } from '../src/scene/vessels/skin/arm-twins.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import { weldOf } from '../src/scene/vessels/skin/plain.ts';
import { SKIN_GROWERS, type SkinMesh } from '../src/scene/vessels/skin/types.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

/** The growing arms of each node as the network's own rule gives them on 20 Nov 2026 (node -> `vessel:end`, widest first): every single-tube collateral and shunt that lands on a node with a permanent run-on pair or junction. Pinned, so a vessel added to or taken from the network is seen here. */
const GROWERS: Record<string, readonly string[]> = {
  SMV: ['S_MC:0', 'REX:0'], SVD: ['C6:0', 'S_DSR:0'], CONF: ['S_PC:0'], PVH: ['DIPS:0'], RPV_T: ['TIPS:0'], RHV_T: ['TIPS:1'],
  IVCI: ['S_PC:1', 'C9:0'], IVC_D: ['DIPS:1'], LRV_S: ['C6:1', 'S_DSR:1'], LRV: ['C5:1'], EPI: ['C3:1'],
  // (the braids' roots where the strands leave the node as one bundle: ONE stand-in arm, braid-arm.ts, tests/skin-strands.test.ts)
  SV: ['C2:0'], IMV: ['C4:0'], SMV_R: ['C7:0'],
};
/** The collaterals drawn as BRAIDS of strands (plan.strands): no tube of their own, three or six strands that part from the node and each end at the trunk's width, so at the node they are a bundle of identical overlapping tubes, not a branch. The ends where the strands leave the node as ONE bundle are arms of its skin (braid-arm.ts); the others keep today's fork method (tests/skin-strands.test.ts names both). */
const BRAIDS = ['C1a', 'C2', 'C4', 'C7', 'C8'];
/** The growing arms a skin could not take on the real network (`node:vessel`), each for a reason a person can read: a landing on a host's wall (GROW_REACH), or an arm that runs along another (the surface cannot clear the blend: PVH's DIPS lies 12 degrees from PVH_R, SVD's S_DSR and LRV_S's S_DSR run along C6). */
// (21 Nov 2026: SVD:S_DSR and LRV_S:S_DSR now build as static full-size arms (RHV_T:TIPS: after the wall nodes the cava's IVC_IS has no ring that clears the blend, 'too far (1b) 3': still named). The skin set tries a failed growing arm from the surface before it drops it (skin-set.ts produce), a small hole of the sheet at no seam is fanned shut (sheet-caps.ts),
//  and a plain trunk whose seams were placed with no hull falls to the surface rung when its hull misses (mesh.ts buildSkinSteady): the cava's merged skin RHV_T+IVCS had no plain trunk for that reason. tests/skin-shunts.test.ts pins the three.)
// (21 Nov: RPV_T keeps its TIPS arm beside the right portal vein's second branch: the planner no longer asks the hull rule of a junction with a liver branch.)
// (PVH:DIPS stays flared: PVH_R is 4 radii long and the DIPS lies over all of it (12 degrees, then bends away past its end), so no ring of PVH_R clears the DIPS's blend even with the whole length allowed, rule 1; tests/skin-shunts.test.ts)
// (IMV:C4 the varices' strands leave the inferior mesenteric vein's end 25 degrees from its run-on V_COL, a grower along a permanent arm: the closed footprint folds, as PVH's DIPS, braid-arm.ts, tests/skin-strands.test.ts)
// (the `wall:` entries are the landings on a host's wall that keep the fork method, wall.ts, tests/skin-wall.test.ts: each is named, none is silent)
const DROPPED = ['IVCI:C9', 'IVCI:S_PC', 'IVC_D:DIPS', 'LRV_S:S_DSR', 'PVH:DIPS', 'RHV_T:TIPS',
  'wall:IVC_IS:DIPS1:DIPS', 'wall:IVC_IS_1:S_PC1,C90:C9', 'wall:IVC_IS_1:S_PC1,C90:S_PC', 'wall:PVH_L_1:REX1:REX'];
// (the landings on a host's wall: wall.ts builds a virtual node for each (static full-size arms); those named `wall:` here fail (a host stub too short for a seam ring, or the node crowds a skin beside it) and keep the tube's own sunk and flared end, shunt-ends.ts; none is silent)

/** Nodes with three or more arms that stay whose plain trunk (plain.ts) does not build: the welded skin then comes in over the tubes' own cut ends alone, all of them dithered (named, none silent). */
const PLAIN_FAILED = ['LPV_A'];
const armKey = (a: { vesselId: string; end: number }) => `${a.vesselId}:${a.end}`;

test('the growing arms are the single-tube collaterals and shunts, pinned by node; the braided collaterals are not arms; at most two per skin, after the permanent arms, widest first', () => {
  on(() => {
    const js = findSkinJunctions().filter((j) => j.arms.some((a) => a.grow)), by = Object.fromEntries(js.map((j) => [j.node, j.arms.filter((a) => a.grow).map(armKey)]));
    assert.deepEqual(by, GROWERS);
    for (const j of findSkinJunctions()) {
      const g = j.arms.filter((a) => a.grow);
      assert.ok(g.length <= SKIN_GROWERS, `${j.node}: ${g.length} growing arms`);
      assert.ok(j.arms.length <= 6, `${j.node}: ${j.arms.length} arms`);
      const firstGrow = j.arms.findIndex((a) => a.grow);
      if (firstGrow >= 0) assert.ok(j.arms.slice(firstGrow).every((a) => a.grow), `${j.node}: the growing arms come after the permanent ones`);
      for (let i = 1; i < g.length; i++) assert.ok(g[i - 1]!.restR >= g[i]!.restR, `${j.node}: growing arms widest first`);
      for (const a of j.arms) {
        const v = NETWORK_BY_ID.get(a.vesselId)!;
        if (a.grow) assert.ok((isGrower(v) || BRAIDS.includes(v.id)) && GROWER_KINDS.has(v.kind) && !isPermanent(v), `${a.vesselId} is a growing arm (a one-tube grower)`);
        else assert.ok(isPermanent(v) || isLiverBranch(v), `${a.vesselId} is a permanent arm (or a liver branch that leaves its host at the node)`);
      }
      // J is the widest PERMANENT arm's end, whatever the growing arms are
      assert.ok(!j.arms[0]!.grow, j.node);
    }
    for (const id of BRAIDS) { const v = NETWORK_BY_ID.get(id)!; assert.ok(v.kind === 'collateral' && !isGrower(v), `${id} is no one-tube grower (a braid's bundle root is an arm by braid-arm.ts, tests/skin-strands.test.ts)`); assert.ok(v.plan?.kind === 'coil' && v.plan.strands, `${id} is a braid`); }
    // every single-tube collateral and shunt of the network that ends on a node of permanent vessels is accounted for: an arm, or one of the named braids, or a node with no permanent pair at all (LGV, VAR, GV: collateral meets collateral)
    const seen = new Set(js.flatMap((j) => j.arms.filter((a) => a.grow).map((a) => a.vesselId)));
    for (const v of NETWORK) if (!v.feeder && (v.kind === 'collateral' || v.kind === 'shunt') && !BRAIDS.includes(v.id)) assert.ok(seen.has(v.id) || ['C1b', 'C3'].includes(v.id), `${v.id} is a growing arm somewhere`);
  });
});

test('a collateral that lands on the wall (more than GROW_REACH radii from the node) is not an arm of it, and the node keeps its permanent skin; a run-on pair with no collateral left is no junction', () => {
  on(() => {
    const ivci = findSkinJunctions().find((j) => j.node === 'IVCI')!, d = dropFarGrowers(ivci);
    assert.deepEqual(d.far.sort(), ['C9', 'S_PC'], 'the shunt that ends 5.9 radii down the cava and the azygos collateral (8.9)');
    assert.deepEqual(d.junction.arms.map((a) => a.vesselId), ['IVC_IS_1', 'ILI_IVC_1', 'LRV_IVC']);
    assert.equal(dropFarGrowers(d.junction).junction, d.junction, 'nothing more to drop');
    assert.equal(withoutGrowers(findSkinJunctions().find((j) => j.node === 'SMV')!), null, 'SMV is a run-on pair with two shunts on it: without them it is no junction');
    assert.ok(GROW_REACH < 6, 'a growing arm has to be nearer than a permanent one may be');
  });
});

/** The real scene's phase-2 skins, with the real draw objects and the real vessels. */
function built(): { scene: CelScene; set: SkinSet; draws: SkinObject[]; axes: Map<SkinObject, readonly ArmAxis[]>; warnings: string[]; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [], warnings: string[] = [], axes = new Map<SkinObject, readonly ArmAxis[]>(), parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => { const d = new SkinObject(mesh, arms[0]!, ax, arms); draws.push(d); axes.set(d, ax); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: (m) => warnings.push(m),
  });
  set.build(2);
  { const live = new Set<unknown>(set.liveDraws()); for (let i = draws.length - 1; i >= 0; i--) if (!live.has(draws[i])) draws.splice(i, 1); }   // (a skin the planner took back to plan with its neighbours is not one of them)
  return { scene, set, draws, axes, warnings, was };
}
const done = (b: { scene: CelScene; was: boolean }) => { b.scene.dispose(); setSmoothJoins(b.was); };
const nodeOf = (d: SkinObject) => d.mesh.name.replace('skin:', '');
const meshOf = (b: { set: SkinSet }, d: SkinObject): SkinMesh => b.set.skinOf(nodeOf(d))!;


// ---- static full-size skins ----
const drawOf = (b: ReturnType<typeof built>, node: string): SkinObject => b.draws.findLast((d) => nodeOf(d) === node)!;
const nodeOfMesh = (m: SkinMesh): string => m.junction.node;

test('the real network builds the growing arms it can as STATIC full-size arms, names the ones it cannot (they keep the tube\'s own flared end), loses no skin it had before, and warns of nothing', () => {
  const b = built();
  try {
    assert.deepEqual(b.warnings, [], 'no skin falls back');
    assert.deepEqual([...b.set.fellBack].sort(), [], 'no node keeps the old join');
    assert.deepEqual([...b.set.dropped].sort(), DROPPED);
    for (const d of DROPPED) assert.ok(b.set.why[d] === undefined || /^skin: junction /.test(b.set.why[d]!), `${d}: named with its SkinBuildError message`);
    assert.match(b.set.why['LRV_S:S_DSR'] ?? '', /seam loops/, 'LRV_S:S_DSR stays flared, named with the reason');
    const grown = new Map(b.draws.map((d) => [nodeOf(d), meshOf(b, d).junction.arms.filter((a) => a.grow).map(armKey)]));
    for (const d of b.draws) assert.equal(meshOf(b, d).grow.length, 0, `${nodeOf(d)}: no growth morph, the skin is one static shape`);
    const want: Record<string, string[]> = {};
    for (const [n, gs] of Object.entries(GROWERS)) { const kept = gs.filter((g) => !DROPPED.includes(`${n}:${g.split(':')[0]}`)); if (kept.length) want[n] = kept; }
    // (the landings on a host's wall that build as static full-size arms, wall.ts: C3 within 2.6 R of the left portal vein's node, S_MC on the iliac beside IVCI, the azygos pair on their own virtual node)
    want.LPV_A = ['C3:0']; want.IVCI = ['S_MC:1']; want['wall:AZY_SVC:C91,C1b1'] = ['C9:1', 'C1b:1'];
    const got = Object.fromEntries([...grown].filter(([, g]) => g.length));
    assert.deepEqual(got, want);
    for (const n of ['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R', 'IVCI', 'SVC_E+SVC']) assert.ok(grown.has(n), `${n} still has its skin`);
  } finally { done(b); }
});

test('the welded skin is the arms\' union at full size and the plain trunk is the arms that stay: same seam rings, three or more arms, meshed from the surface, no growing arm in it', () => {
  const b = built();
  try {
    let n = 0;
    for (const d of b.draws) {
      const m = meshOf(b, d), node = nodeOf(d), grow = m.junction.arms.filter((a) => a.grow).length, stay = m.junction.arms.length - grow, plain = b.set.plainOf(node);
      if (!grow) { assert.equal(plain, undefined, `${node}: no growing arm, no plain trunk`); continue; }
      if (stay < 3) { assert.equal(plain, undefined, `${node}: a run-on pair has no junction of its own: the tubes' cut ends carry the weld`); continue; }
      if (PLAIN_FAILED.includes(node)) { assert.equal(plain, undefined, `${node}: its plain trunk does not build, the welded skin comes in over the tubes' cut ends alone`); continue; }
      assert.ok(plain, `${node}: a plain trunk of the ${stay} arms that stay`); n++;
      assert.equal(plain!.junction.arms.length, stay);
      assert.ok(plain!.junction.arms.every((a) => !a.grow));
      for (const a of plain!.junction.arms) {
        const i = m.junction.arms.findIndex((x) => x.vesselId === a.vesselId && x.end === a.end), k = plain!.junction.arms.indexOf(a);
        assert.ok(i >= 0);
        assert.deepEqual(plain!.cuts[k], m.cuts[i], `${node}: ${a.vesselId} is cut at the same seam in both skins`);
      }
    }
    assert.ok(n >= 3, `${n} nodes have a plain trunk`);
  } finally { done(b); }
});

test('IMV builds with the varices\' bundle C4 as a growing arm 25 degrees from V_COL: no fold, watertight (every edge on two faces that run opposite ways), seamed to all three tubes', () => {
  const b = built();
  try {
    assert.ok(!b.set.dropped.includes('IMV:C4'), 'C4 is not dropped at IMV');
    const m = b.set.skinOf('IMV')!;
    assert.deepEqual(m.junction.arms.map(armKey), ['V_IMV:0', 'V_COL:1', 'C4:0'].map((k) => k), 'IMV: its two permanent arms, then the bundle');
    assert.ok(m.junction.arms[2]!.grow);
    assert.equal(foldedTriangles(m.position, m.normal, m.index).length, 0, 'no fold');
    const dir = new Map<number, number>();
    for (let i = 0; i < m.index.length; i += 3) for (let s = 0; s < 3; s++) {
      const a = m.index[i + s]!, c = m.index[i + (s + 1) % 3]!;
      dir.set(a * 1e7 + c, (dir.get(a * 1e7 + c) ?? 0) + 1);
    }
    const seam = new Set<number>(m.seamVerts.flatMap((ids) => [...new Set(ids)]));   // (the open skin ends at the seam rings: a ring edge is on one face, every other edge on two)
    let open = 0;
    for (const [k, v] of dir) { const a = Math.floor(k / 1e7), c = k % 1e7; assert.equal(v, 1, `edge ${a}-${c} on one face this way`); if (seam.has(a) && seam.has(c) && !dir.has(c * 1e7 + a)) open++; else assert.equal(dir.get(c * 1e7 + a), 1, `edge ${a}-${c} has its mate`); }
    assert.equal(open, 3 * 14, 'the three seam rings are the only open edges');
    for (const ids of m.seamVerts) assert.ok(ids.length >= 14);
  } finally { done(b); }
});

test('every static full-size skin has 0 folds: no triangle that counts is turned against its own vertex normals, the welded skins with their growing arms whole and the plain trunks', () => {
  const b = built();
  try {
    let n = 0;
    for (const d of b.draws) {
      for (const m of [meshOf(b, d), b.set.plainOf(nodeOf(d))]) {
        if (!m) continue;
        const folds = foldedTriangles(m.position, m.normal, m.index);
        assert.equal(folds.length, 0, `${nodeOfMesh(m)}: ${folds.length} folded triangles`);
        n++;
      }
    }
    assert.ok(n >= 20, `${n} skins checked`);
  } finally { done(b); }
});

test('the weld follows the growing arm\'s own draw-on: 0 while it grows (the flared tube alone), the skin comes in from growth 0.9 to 1 by smoothstep, and never jumps; the trunk\'s presence is untouched', () => {
  const b = built();
  try {
    const spc = b.scene.vesselObject('S_PC') as VesselObject, u = b.set.skinOf('CONF')!.cuts[b.set.skinOf('CONF')!.junction.arms.findIndex((a) => a.vesselId === 'S_PC')]!.u;
    spc.group.visible = false; b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 0, 'hidden: the tubes alone, the plain trunk');
    spc.group.visible = true; spc.setReveal(0); b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 0);
    let last = 0, biggest = 0, firstOn = -1;
    for (let s = 1; s <= 400; s++) {
      spc.setReveal(s / 400); b.set.sync();
      const w = b.set.weldOf('CONF'), g = armPresenceAt(true, s / 400, 1, u);
      assert.ok(Math.abs(w - weldOf(g)) < 1e-12, 'the weld is the smoothstep of the arm\'s presence');
      if (g < 0.9) assert.equal(w, 0, 'under 0.9 the skin is not drawn');
      if (w > 0 && firstOn < 0) firstOn = g;
      assert.ok(w >= last - 1e-12); biggest = Math.max(biggest, w - last); last = w;
    }
    assert.equal(last, 1, 'whole: the welded skin, the tube\'s cut whole');
    assert.ok(biggest < 0.5, `the biggest step of 400 is ${biggest.toFixed(3)}`);   // (the arm's presence itself steps by up to a fifth a frame at the seam, and the weld is steeper than it: 1.5 per unit)
    assert.ok(firstOn >= 0.9, `the skin starts at growth ${firstOn.toFixed(3)}`);
    assert.equal(weldOf(0.9), 0); assert.equal(weldOf(1), 1); assert.equal(weldOf(0), 0);
    // the draws: the welded skin keeps the pixels under the weld, the plain trunk the rest, the tube's cut end the pixels neither draws
    const [bm, bw] = b.draws.findLast((d) => nodeOf(d) === 'CONF')!.weldOf();
    assert.equal(bm, 1); assert.equal(bw, 1);
    const plain = b.set.plainDraws().filter((p) => (p as SkinObject).mesh.name === 'skin:CONF~plain')[0] as SkinObject | undefined;
    assert.ok(plain, 'CONF has a plain trunk'); assert.deepEqual(plain!.weldOf(), [-1, 1]);
    spc.setReveal(1); spc.setFade(0.5); b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 0, 'a vessel the dive fades takes its weld with it');
    assert.equal(spc.skinWeld(0) + spc.skinWeld(1) >= 0, true);
  } finally { done(b); }
});

test('a dotted thread (a closed potential collateral) is never welded: weld 0 however far it is drawn, and its tube is never cut by the skin', () => {
  const b = built();
  try {
    const o = b.scene.vesselObject('S_PC') as VesselObject;
    o.group.visible = true; o.setReveal(1); b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 1);
    o.setDotted(true); b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 0, 'dotted');
    assert.match(VESSEL_FS, /bool skinCutOn\(\) \{ return dotted < 0\.5 && /, 'and the tube is not cut: the thread runs on into the trunk\'s wall');
    o.setDotted(false); b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 1);
    o.group.visible = false; b.set.sync();
    assert.equal(b.set.weldOf('CONF'), 0);
  } finally { done(b); }
});

test('the tube\'s cut end at a growing arm is dithered with the weld, and whole once the skin is whole; a run-on pair\'s growing arm has no plain trunk, so the permanent arms\' cut ends are dithered too', () => {
  const b = built();
  try {
    const o = b.scene.vesselObject('S_PC') as VesselObject;
    o.group.visible = true; o.setReveal(1); b.set.sync();
    assert.equal(o.skinWeld(0), 1, 'S_PC starts at CONF: whole once welded');
    o.setReveal(0); b.set.sync();
    assert.equal(o.skinWeld(0), 0, 'growing: the cut part of the tube is drawn');
    // SMV is a run-on pair with two shunts on it: no plain trunk, so the trunk's own cut ends take the weld too
    assert.equal(b.set.plainOf('SMV'), undefined);
    assert.match(VESSEL_FS, /float skinWeldAt\(\)/);
    assert.match(VESSEL_FS, /weldW > 0\.9999 \|\| cutH < weldW/);
  } finally { done(b); }
});

test('copies: a growing arm is a plain arm\'s front copy, and a skin with no arm there at all is not drawn (a trunk hidden, a collateral grown or not)', () => {
  const b = built();
  try {
    const d = drawOf(b, 'CONF'), ids = b.set.armIdsOf(d);
    b.set.sync();
    assert.ok(d.copyShown(0) || b.set.plainDraws().some((p) => (p as SkinObject).copyShown(0)), 'the trunk is there: the front copy');
    for (const id of ids) (b.scene.vesselObject(id) as VesselObject).group.visible = false;
    b.set.sync();
    assert.ok(!d.copyShown(0), 'nothing there, nothing drawn');
    (b.scene.vesselObject('S_PC') as VesselObject).group.visible = true; (b.scene.vesselObject('S_PC') as VesselObject).setReveal(1);
    b.set.sync();
    assert.ok(d.copyShown(0));
  } finally { done(b); }
});

test('a rebuild keeps the growing arms: marking the growing vessel rebuilds the skin it stands on, once a frame, static again, with its plain trunk', () => {
  const b = built();
  try {
    const was = meshOf(b, drawOf(b, 'CONF')), wasPlain = b.set.plainOf('CONF');
    assert.deepEqual(was.junction.arms.filter((a) => a.grow).map((a) => a.vesselId), ['S_PC']);
    assert.ok(wasPlain);
    b.set.markDirty('S_PC');
    assert.ok(b.set.pending);
    b.set.step();
    assert.ok(!b.set.pending, 'one rebuild, one frame');
    const now = b.set.skinOf('CONF')!;
    assert.notEqual(now, was, 'rebuilt');
    assert.deepEqual(now.junction.arms.filter((a) => a.grow).map((a) => a.vesselId), ['S_PC']);
    assert.equal(now.grow.length, 0);
    assert.ok(b.set.plainOf('CONF') && b.set.plainOf('CONF') !== wasPlain);
    assert.equal(now.position.length, was.position.length, 'the same shape, built again on the same tubes');
    assert.equal(b.set.stats.rebuilds, 1);
  } finally { done(b); }
});

test('the fragment outline of a static skin has no growth: no SKIN_GROW define, and the weld discard is the tubes\' own dither', async () => {
  const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
  assert.match(SKIN_FS, /uniform vec3 skinKW;/);
  assert.match(SKIN_FS, /skinKW\.y > 0\.0 \? wh >= skinKW\.z : wh < skinKW\.z/);
});

test('a collateral that ends off the joint of the trunks at its node (the epigastric pair\'s fillet moves the V\'s joint 12 px off the umbilicus) ends ON the joint: the umbilical vein is an arm of the epigastric skin, welded, not flared', () => {
  on(() => {
    assert.equal(JOINT_REACH_R, GROW_REACH, 'network.ts cannot import the inventory (it imports the network): the two numbers are one');
    const epi = findSkinJunctions().find((j) => j.node === 'EPI')!, c3 = epi.arms.findIndex((a) => a.vesselId === 'C3');
    assert.ok(c3 >= 0, 'C3 is an arm of EPI');
    const d = dropFarGrowers(epi);
    assert.deepEqual(d.far, [], 'C3 ends within reach of the joint (was 4.97 radii: dropped)');
  });
});
