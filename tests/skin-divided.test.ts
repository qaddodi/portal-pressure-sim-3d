// A divided vein leaves the junction skin while its shunt is in (23 Nov, Mohammad: the Warren shunt "sucks, look at the splenic vein", the portocaval "sucks"). ROOT CAUSE: the skin of the shunt kept the DIVIDED vein as one of its arms, drawn at alpha 0 (arm-twins.ts liveFadeAt: a divided
// vein's start has no fade there): the skin's alpha is the arms' fades blended by weight, so a translucent band lay over the top of the shunt where the vein's capsule ran 9 degrees beside it, ending abruptly at the shunt's seam ring (the fade cut), and the vein's capsule was a lump in the
// run beside the shunt. Now the vein's start is an arm that `leaves` (types.ts) and the skin of that state is the part built without it (plain.ts partOf `leave`), through-paired with the shunt that stands for the rest of the vein. Node only: the real network, the baked skins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';
import { bakedSkins } from '../src/scene/vessels/skin/baked.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject, type ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { leavingOf, partOf, partSpecs } from '../src/scene/vessels/skin/plain.ts';
import { THROUGH_DEG } from '../src/scene/vessels/skin/through.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { DIVIDED, divideOf, stumpOf } from '../src/scene/vessels/divide.ts';
import { PINCH_W } from '../src/scene/vessels/glsl-shared.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

function built(divided: (s: string) => boolean): { scene: CelScene; set: SkinSet; draws: SkinObject[]; axes: Map<SkinObject, readonly ArmAxis[]>; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [], axes = new Map<SkinObject, readonly ArmAxis[]>(), parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => { const d = new SkinObject(mesh, arms[0]!, ax, arms); draws.push(d); axes.set(d, ax); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
    baked: bakedSkins, divided,
  });
  set.build(2);
  return { scene, set, draws, axes, was };
}
const done = (b: { scene: CelScene; was: boolean }) => { b.scene.dispose(); setSmoothJoins(b.was); };
const show = (b: { scene: CelScene; set: SkinSet }, id: string, reveal = 1): void => { const o = b.scene.vesselObject(id) as VesselObject; o.group.visible = true; o.setReveal(reveal); o.setDotted(false); };

test('the divided vein\'s start is an arm that LEAVES: SV_MID at SVD for S_DSR, PV_TRUNK_1 at CONF for S_PC, and no other arm of the figure does', () => {
  on(() => {
    const out: string[] = [];
    for (const j of findSkinJunctions()) for (const a of j.arms) if (a.leaves) out.push(`${j.node}:${a.vesselId}@${a.end}->${a.leaves}`);
    assert.deepEqual(out.sort(), ['CONF:PV_TRUNK_1@0->S_PC', 'SVD:SV_MID@0->S_DSR']);
    for (const [shunt, vein] of DIVIDED) assert.ok(out.some((o) => o.includes(`:${vein}@0->${shunt}`)), `${vein} leaves for ${shunt}`);
    // one leaver a junction: a part with the leaving arms out is then the same for any set of growers that holds the shunt
    for (const j of findSkinJunctions()) assert.ok(j.arms.filter((a) => a.leaves).length <= 1, j.node);
  });
});

test('SVD with the shunt: the skin is {V_SPL, S_DSR} (or {V_SPL, S_DSR, C2}), through-paired, one even taper from the vein\'s calibre to the shunt\'s; CONF end-to-side: {SMV_CONF, SV_CONF, S_PC}, no divided arm at all', () => {
  const b = built(() => false);
  try {
    assert.deepEqual(b.set.partFailed, [], 'every part built');
    assert.deepEqual(b.set.bulgeOver, [], 'no part bulges past BULGE_MAX');
    const svd = b.set.partsOf('SVD'), conf = b.set.partsOf('CONF');
    // (placed anatomy: SVD's growing arms are S_DSR (arm 2) and the short gastric collateral C2 (arm 3); C6 lands far from it, on the renal vein's wall. The 2D figure had C6 at arm 2 and S_DSR at arm 3, so its parts were 3L and 2.3L with C6)
    assert.deepEqual([...svd.keys()].sort(), ['2', '2.3L', '2L', '3']);
    assert.deepEqual([...conf.keys()], ['3L']);
    const idsOf = (n: string, k: string): readonly string[] => b.set.armIdsOf(b.set.partsOf(n).get(k)!.draw);
    let svdStraight = false;
    assert.deepEqual(idsOf('SVD', '2L'), ['V_SPL', 'S_DSR']);
    assert.deepEqual(idsOf('SVD', '2.3L'), ['V_SPL', 'S_DSR', 'C2']);
    assert.deepEqual(idsOf('CONF', '3L'), ['SV_CONF', 'SMV_CONF', 'S_PC']);   // (in the placed junction's arm order: PV_TRUNK_1, SV_CONF, SMV_CONF, S_PC)
    for (const [n, k] of [['SVD', '2L'], ['SVD', '2.3L'], ['CONF', '3L']] as const) {
      const p = b.set.partsOf(n).get(k)!, ax = b.axes.get(p.draw as SkinObject)!;
      assert.ok(!idsOf(n, k).some((id) => id === 'SV_MID' || id === 'PV_TRUNK_1'), `${n} ${k}: the divided vein is not an arm`);
      assert.equal(foldedTriangles(p.mesh.position, p.mesh.normal, p.mesh.index).length, 0, `${n} ${k}: no folded triangle`);
      // the shunt is half of the run it stands for, whatever the growing rule says of a branch
      // (placed anatomy: a shunt carries the run on when it leaves along the vein's line (within THROUGH_DEG of straight); the placed Warren shunt leaves the splenic vein 49 degrees off its line, toward the renal vein below, and the end-to-side
      //  portocaval the splenic vein 39 degrees off. A straight capsule from seam to seam would cut that corner, so those parts are a BEND of the two (each its own capsule, blended): unpaired, and no fold or bulge (above). The 2D shunts ran on the line)
      const sh = idsOf(n, k).indexOf(n === 'SVD' ? 'S_DSR' : 'S_PC'), vi = idsOf(n, k).indexOf(n === 'SVD' ? 'V_SPL' : 'SV_CONF');
      const od = (a: ArmAxis): number[] => { const d = [0, 1, 2].map((i) => a.pts[3][i]! - a.pts[2][i]!), l = Math.hypot(d[0]!, d[1]!, d[2]!); return d.map((x) => x / l); };
      const straight = od(ax[sh]!).reduce((t, x, i) => t + x * od(ax[vi]!)[i]!, 0) < -Math.cos((THROUGH_DEG * Math.PI) / 180);
      if (straight) assert.ok(ax[sh]!.mate !== undefined, `${n} ${k}: the shunt is through-paired`);
      else assert.ok(ax[sh]!.mate === undefined && ax[vi]!.mate === undefined, `${n} ${k}: a bend, not a run`);
      if (n === 'SVD' && k === '2L') svdStraight = straight;
    }
    // SVD {V_SPL, S_DSR}: outward directions within the through rule (35 degrees of straight), and ONE even taper between the seams (no step): V_SPL's seam radius to the shunt's at its own seam (when the placed shunt runs on the line: above)
    if (!svdStraight) return;
    const p3 = svd.get('2L')!, ax = b.axes.get(p3.draw as SkinObject)!;
    const [v, s] = [ax[0]!, ax[1]!];
    assert.equal(v.mate, 1); assert.equal(s.mate, 0);
    const dir = (a: ArmAxis): number[] => { const d = [0, 1, 2].map((i) => a.pts[3][i]! - a.pts[2][i]!), l = Math.hypot(d[0]!, d[1]!, d[2]!); return d.map((x) => x / l); };
    const dot = dir(v)[0]! * dir(s)[0]! + dir(v)[1]! * dir(s)[1]! + dir(v)[2]! * dir(s)[2]!;
    assert.ok(dot < -Math.cos((THROUGH_DEG * Math.PI) / 180), `a through run: outward dot ${dot.toFixed(3)} (within ${THROUGH_DEG} degrees of straight is under ${(-Math.cos((THROUGH_DEG * Math.PI) / 180)).toFixed(3)})`);
    const rv = v.radii[2]!, rs = s.radii[2]!;
    assert.ok(Math.abs(rv - 0.0194) < 2e-4 && Math.abs(rs - 0.0209) < 2e-4, `seam radii ${rv.toFixed(4)} -> ${rs.toFixed(4)}`);
    assert.ok(rs / rv - 1 < 0.09, `an even ${(100 * (rs / rv - 1)).toFixed(1)} % taper`);
    // the run's radius along the straight capsule from V_SPL's seam to the shunt's: monotone from the vein's to the shunt's, never over either (v.radii[0] is the shunt's seam radius, the run's far end)
    let last = rv;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const rad = v.radii[2]! + (v.radii[0]! - v.radii[2]!) * t;
      assert.ok(rad >= last - 1e-9 && rad <= Math.max(rv, rs) + 1e-9, `taper monotone at ${t.toFixed(2)}`); last = rad;
    }
  } finally { done(b); }
});

test('the skin that is DRAWN follows the vein: with the shunt in and the vein divided it is the part without the vein\'s start, its tube end is left to the stump; a side-to-side portocaval keeps the welded skin and the trunk', () => {
  const flags: Record<string, boolean> = { S_DSR: true, S_PC: true };
  const b = built((s) => !!flags[s]);
  try {
    const modeOf = (n: string, k?: string) => (k ? (b.set.partsOf(n).get(k)!.draw as SkinObject) : (b.set.liveDraws().find((d) => (d as SkinObject).mesh.name === `skin:${n}`) as SkinObject)).weldOf!();
    (b.scene.vesselObject('C2') as VesselObject).group.visible = false;   // (at rest every collateral is drawn: only the shunt is in here; C2 is SVD's collateral in the placed anatomy)
    show(b, 'S_DSR'); b.set.sync();
    assert.deepEqual(modeOf('SVD', '2L'), [1, 1], 'Warren: the part without SV_MID is the skin in');
    assert.equal((b.scene.vesselObject('SV_MID') as VesselObject).skinWeld(0), 0, 'the divided vein\'s own start is left to its stump (the cut end is not given to a skin)');
    assert.equal((b.scene.vesselObject('V_SPL') as VesselObject).skinWeld(1), 1, 'the splenic vein\'s other half is welded');
    flags.S_DSR = false; b.set.sync();
    assert.deepEqual(modeOf('SVD', '2'), [1, 1], 'the vein not divided (the shunt\'s drawing under a hair): the skin that carries it');
    assert.equal((b.scene.vesselObject('SV_MID') as VesselObject).skinWeld(0), 1);
    flags.S_DSR = true; show(b, 'C2'); b.set.sync();
    assert.deepEqual(modeOf('SVD', '2.3L'), [1, 1], 'with the collateral too: {V_SPL, S_DSR, C2}');
    // the portocaval: end-to-side divides the trunk, side-to-side keeps it
    show(b, 'S_PC'); b.set.sync();
    assert.deepEqual(modeOf('CONF', '3L'), [1, 1], 'end-to-side: SMV_CONF, SV_CONF and S_PC');
    flags.S_PC = false; b.set.sync();
    const w = modeOf('CONF');
    assert.deepEqual(w, [1, 1], 'side-to-side: the welded skin with all four arms');
  } finally { done(b); }
});

test('no arm of the skin that is drawn has a seam alpha of 0 while its tube is drawn: every shunt state, at SVD and CONF', () => {
  const flags: Record<string, boolean> = { S_DSR: true, S_PC: true };
  const b = built((s) => !!flags[s]);
  try {
    for (const dsr of [false, true]) for (const pc of [false, true]) for (const div of [false, true]) {
      flags.S_DSR = div; flags.S_PC = div;
      (b.scene.vesselObject('C2') as VesselObject).group.visible = false;
      for (const [id, on] of [['S_DSR', dsr], ['S_PC', pc]] as const) { const o = b.scene.vesselObject(id) as VesselObject; o.group.visible = on; o.setReveal(1); o.setDotted(false); }
      // the stump is cut where the divide says: the tube's own fade at the divided vein's start is 0 (arm-twins liveFadeAt), which the skin must never carry
      for (const [shunt, vein] of DIVIDED) { const o = b.scene.vesselObject(vein) as VesselObject, on = shunt === 'S_DSR' ? dsr : pc; const [cut, tie, k] = stumpOf(shunt, vein, on && div ? 1 : 0, false); o.setStump(cut, tie, k); }
      b.set.sync();
      for (const node of ['SVD', 'CONF']) {
        const ids = new Set(b.set.liveDraws().filter((d) => (d as SkinObject).mesh.name === `skin:${node}`).flatMap((d) => b.set.armIdsOf(d)));
        const seams = b.set.seamsOf(ids);
        const parts = [...b.set.partsOf(node).values()].map((p) => p.draw as SkinObject), welded = b.set.liveDraws().find((d) => (d as SkinObject).mesh.name === `skin:${node}`) as SkinObject;
        const inDraw = [welded, ...parts].find((d) => d.weldOf!()[0] === 1 && d.weldOf!()[1] > 0);
        if (!inDraw) continue;
        for (const a of seams) if (a.node === node && b.set.armIdsOf(inDraw).includes(a.vesselId)) assert.ok(a.fade > 0 || a.presence === 0, `${node} dsr ${dsr} pc ${pc} divided ${div}: ${a.vesselId} is an arm of the skin drawn and its seam alpha is ${a.fade}`);
      }
    }
  } finally { done(b); }
});

test('the stump\'s tie sits on its straight wall: at least the cap and the pinch\'s two widths past the cut, and inside the vein', () => {
  for (const [shunt, vein] of DIVIDED) {
    const d = divideOf(shunt, vein)!, R = NETWORK_BY_ID.get(vein)!.radius * UNITS_PER_SCENE;
    assert.ok(d.tie - d.cut >= R + 2 * PINCH_W - 1e-9, `${vein}: the tie is ${(d.tie - d.cut).toFixed(1)} past the cut, the cap ${R.toFixed(1)} and two pinch widths ${(2 * PINCH_W).toFixed(1)}`);
    assert.ok(d.tie <= (stumpOf(shunt, vein, 1, false)[1]) + 1e-9);
  }
  const pv = divideOf('S_PC', DIVIDED[1]![1])!, sv = divideOf('S_DSR', 'SV_MID')!;
  assert.ok(Math.abs(pv.tie - 50.4) < 0.2, `PV_TRUNK_1 tie ${pv.tie.toFixed(1)}`);
  assert.ok(Math.abs(sv.tie - 57.5) < 0.2, `SV_MID tie ${sv.tie.toFixed(1)}`);
});

test('partOf / partSpecs: the leave part takes the leaving arms out and nothing else; a plan with no leaver has none', () => {
  const arm = (id: string, grow: boolean, leaves?: string) => ({ vesselId: id, end: 1, grow, ...(leaves ? { leaves } : {}) });
  const plan = { junction: { node: 'N', arms: [arm('A', false), arm('V', false, 'S'), arm('S', true), arm('G', true)] }, cuts: [0, 1, 2, 3].map((i) => ({ i })) } as never as Parameters<typeof partOf>[0];
  assert.deepEqual(leavingOf(plan.junction, [2]), [1]);
  assert.deepEqual(leavingOf(plan.junction, [3]), []);
  assert.deepEqual(partSpecs(plan).map((p) => p.key), ['2', '3', '2L', '2.3L']);
  assert.deepEqual(partOf(plan, [2], true)!.keep, [0, 2]);
  assert.deepEqual(partOf(plan, [2, 3], true)!.keep, [0, 2, 3]);
  assert.equal(partOf(plan, [3], true), null, 'no leaver there: no leave part');
  assert.equal(partOf(plan, [2], true)!.junction.node, 'N~with2~leave');
  const flat = { junction: { node: 'M', arms: [arm('A', false), arm('B', false), arm('G', true)] }, cuts: [] } as never as Parameters<typeof partOf>[0];
  assert.deepEqual(partSpecs(flat), []);
});
