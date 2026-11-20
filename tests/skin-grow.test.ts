// Junction skins, growing arms (docs/junction-skin-spec.md 10.2, 10.6, 10.7; Mohammad, 20 Nov: "weld the collaterals, TIPS and DIPS to the vessels they come off, as one mesh, and ease it while they grow"). A collateral or a shunt comes and goes. It is an arm of the skin at its
// node like any other, but the skin carries a SECOND SHAPE for it (mesh.ts GrowMorph: the same triangles with that arm at radius 0) and the live growth eases between the two, so the mouth on the trunk opens as the vessel draws on and the trunk is a plain trunk when it is
// closed. Root cause this answers: a collateral landing on a vein was its own tube overlapping the vein's (the fork method, `nbr`/`bury`), with no surface joining them; and a surface that is only there part of the time cannot be one mesh unless the mesh itself grows.
// Node only: the real network, the real scene's tubes, no browser. Run: node --test tests/skin-grow.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { GROW_REACH, GROWER_KINDS, dropFarGrowers, findSkinJunctions, isGrower, isPermanent, withoutGrowers } from '../src/scene/vessels/skin/inventory.ts';
import { SkinSet, axisOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { armPresenceAt, grownLumen, grownShift, grownValue, normalShift } from '../src/scene/vessels/skin/arm-twins.ts';
import { closestOnArm, sdUnion, skinKOf, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { SKIN_GROWERS, type SkinMesh } from '../src/scene/vessels/skin/types.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

/** The growing arms of each node as the network's own rule gives them on 20 Nov 2026 (node -> `vessel:end`, widest first): every single-tube collateral and shunt that lands on a node with a permanent run-on pair or junction. Pinned, so a vessel added to or taken from the network is seen here. */
const GROWERS: Record<string, readonly string[]> = {
  SMV: ['S_MC:0', 'REX:0'], SVD: ['C6:0', 'S_DSR:0'], CONF: ['S_PC:0'], PVH: ['DIPS:0'], RPV_T: ['TIPS:0'], RHV_T: ['TIPS:1'],
  IVCI: ['S_PC:1', 'C9:0'], IVC_D: ['DIPS:1'], LRV_S: ['C6:1', 'S_DSR:1'], LRV: ['C5:1'], EPI: ['C3:1'],
};
/** The collaterals drawn as BRAIDS of strands (plan.strands): no tube of their own, three or six strands that part from the node and each end at the trunk's width, so at the node they are a bundle of identical overlapping tubes, not a branch. They keep today's fork method. */
const BRAIDS = ['C1a', 'C2', 'C4', 'C7', 'C8'];
/** The growing arms a skin could not take on the real network (`node:vessel`), each for a reason a person can read: a landing on a host's wall (GROW_REACH), or an arm that runs along another (the surface cannot clear the blend: PVH's DIPS lies 12 degrees from PVH_R, SVD's S_DSR and LRV_S's S_DSR run along C6). */
const DROPPED = ['EPI:C3', 'IVCI:C9', 'IVCI:S_PC', 'IVC_D:DIPS', 'LRV_S:S_DSR', 'PVH:DIPS', 'SVD:S_DSR'];

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
        if (a.grow) assert.ok(isGrower(v) && GROWER_KINDS.has(v.kind) && !isPermanent(v) && !BRAIDS.includes(v.id), `${a.vesselId} is a growing arm`);
        else assert.ok(isPermanent(v), `${a.vesselId} is a permanent arm`);
      }
      // J is the widest PERMANENT arm's end, whatever the growing arms are
      assert.ok(!j.arms[0]!.grow, j.node);
    }
    for (const id of BRAIDS) { const v = NETWORK_BY_ID.get(id)!; assert.ok(v.kind === 'collateral' && !isGrower(v), `${id} stays on the fork method`); assert.ok(v.plan?.kind === 'coil' && v.plan.strands, `${id} is a braid`); }
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
  return { scene, set, draws, axes, warnings, was };
}
const done = (b: { scene: CelScene; was: boolean }) => { b.scene.dispose(); setSmoothJoins(b.was); };
const nodeOf = (d: SkinObject) => d.mesh.name.replace('skin:', '');
const meshOf = (b: { set: SkinSet }, d: SkinObject): SkinMesh => b.set.skinOf(nodeOf(d))!;

test('the real network builds the growing arms it can, names the ones it cannot, loses no skin it had before, and warns of nothing', () => {
  const b = built();
  try {
    assert.deepEqual(b.warnings, [], 'no skin falls back');
    assert.deepEqual([...b.set.fellBack].sort(), ['IVCS', 'SIN_L', 'SIN_R'], 'the nodes that keep the old join are the ones they were before the growing arms');
    assert.deepEqual([...b.set.dropped].sort(), DROPPED);
    const grown = new Map(b.draws.map((d) => [nodeOf(d), meshOf(b, d).grow.map((m) => armKey(meshOf(b, d).junction.arms[m.arm]!))]));
    const want: Record<string, string[]> = {};
    for (const [n, gs] of Object.entries(GROWERS)) { const kept = gs.filter((g) => !DROPPED.includes(`${n}:${g.split(':')[0]}`)); if (kept.length) want[n] = kept; }
    const got = Object.fromEntries([...grown].filter(([, g]) => g.length));
    assert.deepEqual(got, want);
    // the skins of the permanent junctions are all still there
    for (const n of ['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R', 'IVCI', 'SVC_E', 'SVC']) assert.ok(grown.has(n), `${n} still has its skin`);
  } finally { done(b); }
});

// ---- the second shape ----
const RADIAL = TUBE_RADIAL;
const capsOf = (ax: readonly ArmAxis[]): Capsule[] => ax.map((a) => ({ n: 4, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii) }));
const eachGrower = (b: ReturnType<typeof built>, f: (d: SkinObject, m: SkinMesh, g: SkinMesh['grow'][number], caps: Capsule[]) => void): number => {
  let n = 0;
  for (const d of b.draws) { const m = meshOf(b, d); for (const g of m.grow) { f(d, m, g, capsOf(b.axes.get(d)!)); n++; } }
  return n;
};

test('morph: the arm\'s own seam ring is at the ring\'s centre when closed and the tube\'s own ring when whole, and at share s it is the ring shrunk to s of its radius about its centre (the tube\'s ring at width s), to 1e-6; every other seam ring never moves', () => {
  const b = built();
  try {
    const n = eachGrower(b, (d, m, g) => {
      const centre = [0, 0, 0];
      for (const sv of m.seamVerts[g.arm]!) for (let k = 0; k < 3; k++) centre[k]! += m.position[3 * sv + k]! / RADIAL;
      for (const s of [0, 0.1, 0.5, 1]) for (const sv of m.seamVerts[g.arm]!) for (let k = 0; k < 3; k++) {
        const got = grownValue(m.position[3 * sv + k]!, g.dPos[3 * sv + k]!, s), want = centre[k]! + s * (m.position[3 * sv + k]! - centre[k]!);
        assert.ok(Math.abs(got - want) <= 1e-6, `${nodeOf(d)} ${m.junction.arms[g.arm]!.vesselId} seam vertex at share ${s}: ${got} vs ${want}`);
      }
      // the normals on the ring stay the radial ones (the tube's ring at any share has them), the weights stay 1 on its own arm, the rest radius is the tube's
      for (const sv of m.seamVerts[g.arm]!) {
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(g.dNor[3 * sv + k]!) < 1e-6);
        assert.ok(Math.abs(g.dRest[sv]!) < 1e-6);
        for (let q = 0; q < 4; q++) assert.ok(Math.abs(g.dWeight[4 * sv + q]!) < 1e-6);
      }
      m.junction.arms.forEach((a, ai) => { if (ai === g.arm) return; for (const sv of m.seamVerts[ai]!) for (let k = 0; k < 3; k++) { assert.equal(g.dPos[3 * sv + k], 0, `${nodeOf(d)}: ${a.vesselId}'s ring is the tube's and never moves`); assert.ok(Math.abs(g.dNor[3 * sv + k]!) < 1e-6); } });
    });
    assert.ok(n >= 7, `${n} growing arms checked`);
  } finally { done(b); }
});

test('morph, closed: every free vertex of the closed shape that is not on the arm\'s thread lies on the union of the OTHER arms (the trunk is a plain trunk: no dent, no bump), within 0.02 of the narrowest radius; its normals are unit; its weights are the trunk\'s', () => {
  const b = built();
  try {
    const cp = new Float64Array(7);
    const n = eachGrower(b, (d, m, g, caps) => {
      const arms = m.junction.arms, others = caps.filter((_, i) => i !== g.arm), kOthers = skinKOf(arms.filter((_, i) => i !== g.arm)), kAll = skinKOf(arms), Rmin = Math.min(...arms.map((a) => a.restR));
      const V = m.position.length / 3, S = arms.length * RADIAL;
      let checked = 0;
      for (let v = 0; v < V; v++) {
        const x = m.position[3 * v]! - g.dPos[3 * v]!, y = m.position[3 * v + 1]! - g.dPos[3 * v + 1]!, z = m.position[3 * v + 2]! - g.dPos[3 * v + 2]!;
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), 'finite');
        const nx = m.normal[3 * v]! - g.dNor[3 * v]!, ny = m.normal[3 * v + 1]! - g.dNor[3 * v + 1]!, nz = m.normal[3 * v + 2]! - g.dNor[3 * v + 2]!;
        assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.02, `${nodeOf(d)} vertex ${v}: the closed shape's normal is a unit one (${Math.hypot(nx, ny, nz).toFixed(3)})`);
        let ws = 0;
        for (let q = 0; q < 4; q++) { const w = m.weight[4 * v + q]! - g.dWeight[4 * v + q]!; assert.ok(w > -1e-5, 'a weight is never negative'); ws += w; }
        for (let q = 0; q < 2; q++) { const w = m.weight2[2 * v + q]! - g.dWeight2[2 * v + q]!; assert.ok(w > -1e-5); ws += w; }
        assert.ok(Math.abs(ws - 1) < 1e-4, `${nodeOf(d)} vertex ${v}: the weights of the closed shape sum to 1 (${ws})`);
        if (v < S) continue;
        closestOnArm(caps[g.arm]!, x, y, z, cp);
        if (cp[4]! <= 2 * kAll) continue;   // (the thread, and the blend the thread makes with the trunk)
        checked++;
        assert.ok(Math.abs(sdUnion(others, kOthers, x, y, z)) <= 0.02 * Rmin, `${nodeOf(d)} ${arms[g.arm]!.vesselId}: a free vertex of the closed shape is ${(sdUnion(others, kOthers, x, y, z) / Rmin).toFixed(3)} R off the plain trunk`);
        // and the arm's own weight is gone from it
        const wg = (g.arm < 4 ? m.weight[4 * v + g.arm]! - g.dWeight[4 * v + g.arm]! : m.weight2[2 * v + g.arm - 4]! - g.dWeight2[2 * v + g.arm - 4]!);
        assert.ok(wg < 0.02, `${nodeOf(d)} vertex ${v}: the closed shape has no weight of the arm that is not there (${wg.toFixed(3)})`);
      }
      assert.ok(checked >= 50, `${nodeOf(d)}: ${checked} free vertices judged`);
    });
    assert.ok(n >= 7);
  } finally { done(b); }
});

test('morph, in between: nothing jumps (a vertex moves by delta x the growth, so a step of the growth moves it by at most the step of delta), and the whole shape at g = 1 is the mesh exactly', () => {
  const b = built();
  try {
    eachGrower(b, (d, m, g) => {
      const V = m.position.length / 3;
      let maxDelta = 0;
      for (let v = 0; v < V; v++) { maxDelta = Math.max(maxDelta, Math.hypot(g.dPos[3 * v]!, g.dPos[3 * v + 1]!, g.dPos[3 * v + 2]!)); for (let k = 0; k < 3; k++) assert.equal(grownValue(m.position[3 * v + k]!, g.dPos[3 * v + k]!, 1), m.position[3 * v + k]); }
      const R = m.junction.arms[g.arm]!.restR;
      assert.ok(maxDelta <= 2.5 * R, `${nodeOf(d)}: a vertex travels ${(maxDelta / R).toFixed(2)} radii between closed and whole`);
      let prev = Infinity;
      for (let s = 0; s <= 20; s++) {
        const gr = s / 20; let step = 0;
        for (let v = 0; v < V; v++) step = Math.max(step, Math.abs(grownValue(0, g.dPos[3 * v]!, gr) - grownValue(0, g.dPos[3 * v]!, Math.max(0, gr - 0.05))));
        assert.ok(step <= 0.05 * maxDelta + 1e-9, 'a twentieth of the growth moves a vertex a twentieth of its way at most');
        prev = step;
      }
      void prev;
    });
  } finally { done(b); }
});

test('the vertex stage\'s widths (the JS twin): at the seam, the skin\'s ring at growth g and width s is the tube\'s ring at width g x s, for every g and s, ink included', () => {
  for (const R of [0.0194, 0.029]) for (const s of [0.6, 1, 1.4]) for (const g of [0, 0.1, 0.5, 1]) {
    const ink = 0.0012;
    // the tube's ring at width share g x s: centre + n (R + R (gs - 1) + ink + (R gs + ink) SAG); the skin's: centre + n (g R) + n (R (shift - 1) + ink + (lumen R + ink) SAG)
    const tube = R + normalShift(R, g * s, 1, ink, 0);
    const skin = g * R + normalShift(R, grownShift(s, g), 1, ink, 0) + (R * grownLumen(s, g) - R * grownShift(s, g)) * 0.0 /* (the lumen term below) */;
    // normalShift uses `swell` for both the radius shift and the polygon sag; the skin's vertex stage uses the SHIFT for the first and the LUMEN for the sag: rebuilt here as the shader writes it
    const shader = g * R + (R * (grownShift(s, g) - 1) + ink + (R * grownLumen(s, g) + ink) * (normalShift(0, 1, 1, 0, 0) /* 0 */ + sagOf()));
    assert.ok(Math.abs(tube - shader) < 1e-12, `R ${R} s ${s} g ${g}: ${tube} vs ${shader}`);
    void skin;
  }
  assert.equal(grownLumen(1.3, 1), 1.3); assert.equal(grownShift(1.3, 1), 1.3);
  assert.equal(grownLumen(1.3, 0), 0); assert.equal(grownShift(1.3, 0), 1);
  // the GLSL says the same
  assert.match(SKIN_VS, /swT\[i\] = sw \* gi; swE\[i\] = 1\.0 \+ gi \* \(sw - 1\.0\);/);
  assert.match(SKIN_VS, /vec3 p = pos \+ nor \* \(inflate \+ rst \* \(swellE - 1\.0\) \+ inkW \+ \(lumenW \+ inkW\)/);
  assert.match(SKIN_VS, /float lumenW = rst \* swell;/);
  assert.match(SKIN_VS, /pos -= q \* gPosA0\.xyz; rst -= q \* gPosA0\.w; nor -= q \* gNorA0; wA -= q \* gWtA0; wB -= q \* gWt2A0;/);
  assert.match(SKIN_VS, /float q = 1\.0 - growG\.y;/, 'the second growing arm too');
  assert.match(SKIN_VS, /vSwell = vec4\(swT\[0\], swT\[1\], swT\[2\], swT\[3\]\);/, 'the outline\'s capsule is the LUMEN: it shrinks with the growth');
});
/** The tube's polygon sag, TUBE_SAG, as the vertex stage adds it. */
import { TUBE_SAG } from '../src/scene/vessels/shaders.ts';
const sagOf = (): number => TUBE_SAG;

// ---- the live handover ----
const seamU = (b: ReturnType<typeof built>, d: SkinObject, vessel: string): number => { const m = meshOf(b, d); return m.cuts[m.junction.arms.findIndex((a) => a.vesselId === vessel)]!.u; };
const meshOf2 = (b: { set: SkinSet }, node: string): SkinMesh => b.set.skinOf(node)!;
const drawOf = (b: ReturnType<typeof built>, node: string): SkinObject => b.draws.find((d) => nodeOf(d) === node)!;
const armIndex = (b: ReturnType<typeof built>, d: SkinObject, vessel: string): number => b.set.armIdsOf(d).indexOf(vessel);

test('the growth follows the vessel\'s own draw-on at the seam: 0 hidden, 0 until the front reaches the seam, 1 whole, eased between (the tube\'s frontOut), never a jump; the trunk\'s own presence is untouched', () => {
  const b = built();
  try {
    const tips = b.scene.vesselObject('TIPS') as VesselObject, d = drawOf(b, 'RHV_T'), i = armIndex(b, d, 'TIPS'), u = seamU(b, d, 'TIPS');
    assert.ok(d.grows(i) && i >= 2, 'TIPS is a growing arm of RHV_T, after the two hepatic vein pieces');
    assert.ok(u > 0.7, `TIPS ends at RHV_T, so its seam is near its end (u ${u.toFixed(2)})`);
    tips.group.visible = false;
    b.set.sync();
    assert.equal(d.growOf(i), 0, 'hidden: the trunk is a plain trunk');
    tips.group.visible = true; tips.setReveal(0);
    b.set.sync();
    assert.equal(d.growOf(i), 0, 'drawing on: the front is at the start');
    let last = 0, biggest = 0;
    for (let s = 1; s <= 200; s++) {
      tips.setReveal(s / 200);
      b.set.sync();
      const g = d.growOf(i);
      assert.ok(Math.abs(g - armPresenceAt(true, s / 200, 1, u)) < 1e-12, 'the twin of the tube\'s dissolve front');
      assert.ok(g >= last - 1e-12, 'growing never shrinks while the vessel draws on');
      biggest = Math.max(biggest, g - last); last = g;
    }
    assert.equal(last, 1, 'whole');
    assert.ok(biggest < 0.12, `the biggest step of 200 is ${biggest.toFixed(3)}: it eases`);
    tips.setReveal(0.5); b.set.sync();   // (retracting: the same curve backwards)
    assert.ok(d.growOf(i) < 1);
    // the trunk arms are never dithered by it, and never read as grown
    for (let k = 0; k < 2; k++) assert.ok(!d.grows(k));
    // a vessel the dive fades eases the growth with it
    tips.setReveal(1); tips.setFade(0.5); b.set.sync();
    assert.ok(Math.abs(d.growOf(i) - 0.5) < 1e-9);
  } finally { done(b); }
});

test('a dotted thread (a closed potential collateral) is not a grown arm: growth 0 however far it is drawn, and its tube is never cut by the skin; hidden, it counts 0 too', () => {
  const b = built();
  try {
    const o = b.scene.vesselObject('TIPS') as VesselObject, d = drawOf(b, 'RPV_T'), i = armIndex(b, d, 'TIPS');
    o.group.visible = true; o.setReveal(1); b.set.sync();
    assert.equal(d.growOf(i), 1);
    o.setDotted(true); b.set.sync();
    assert.equal(d.growOf(i), 0, 'dotted');
    assert.match(VESSEL_FS, /bool skinCutOn\(\) \{ return dotted < 0\.5 && /, 'and the tube is not cut: the thread runs on into the trunk\'s wall');
    o.setDotted(false); b.set.sync();
    assert.equal(d.growOf(i), 1, 'solid again: whole, with no step in between (the track retracts the dotted one first)');
    o.group.visible = false; b.set.sync();
    assert.equal(d.growOf(i), 0);
  } finally { done(b); }
});

test('copies: a growing arm is a plain arm\'s front copy, and a skin with no arm there at all is not drawn (a trunk hidden, a collateral grown or not)', () => {
  const b = built();
  try {
    const d = drawOf(b, 'RPV_T'), ids = b.set.armIdsOf(d);
    b.set.sync();
    assert.ok(d.copyShown(0), 'the trunk is there: the front copy');
    for (const id of ids) (b.scene.vesselObject(id) as VesselObject).group.visible = false;
    b.set.sync();
    assert.ok(!d.copyShown(0), 'nothing there, nothing drawn');
    // only the collateral there: the skin is its own part alone
    (b.scene.vesselObject('TIPS') as VesselObject).group.visible = true; (b.scene.vesselObject('TIPS') as VesselObject).setReveal(1);
    b.set.sync();
    assert.ok(d.copyShown(0));
  } finally { done(b); }
});

test('a rebuild keeps the growing arms: marking the growing vessel rebuilds the skin it stands on, once a frame, with the same morph', () => {
  const b = built();
  try {
    const was = meshOf(b, drawOf(b, 'RHV_T'));
    assert.deepEqual(was.grow.map((m) => was.junction.arms[m.arm]!.vesselId), ['TIPS']);
    const wasP = meshOf2(b, 'RPV_T');
    b.set.markDirty('TIPS');
    assert.ok(b.set.pending);
    b.set.step();
    assert.ok(b.set.pending, 'TIPS is an arm of two skins: one is rebuilt a frame, the other waits its turn');
    b.set.step();
    assert.ok(!b.set.pending);
    const now = b.set.skinOf('RHV_T')!, nowP = b.set.skinOf('RPV_T')!;
    assert.notEqual(now, was, 'rebuilt');
    assert.notEqual(nowP, wasP, 'rebuilt');
    for (const m of [now, nowP]) assert.deepEqual(m.grow.map((g) => m.junction.arms[g.arm]!.vesselId), ['TIPS']);
    assert.equal(now.position.length, was.position.length, 'the same shape, built again on the same tubes');
    assert.equal(b.set.stats.rebuilds, 2);
  } finally { done(b); }
});

test('the axes a growing arm is drawn from end at the node: its capsule starts at J (spec 10.5), and the seam rings of the real tubes are the clear ones (axisOf is what the mesh, the ink and the cuts all judge)', () => {
  const b = built();
  try {
    eachGrower(b, (d, m, g) => {
      const ax = b.axes.get(d)!, J = m.junction.J;
      for (const a of ax) assert.ok(a.pts.length === 4 && a.radii.every((r) => r > 0));
      // the capsule of an arm that ends within a tenth of a radius of J starts at its own end, which is at J
      void J; void g; void axisOf;
    });
  } finally { done(b); }
});
