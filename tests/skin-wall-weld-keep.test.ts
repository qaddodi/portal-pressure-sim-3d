// Mohammad, 21 Nov, iPhone (build c2ed15a3): (Healthy, zoomed in) "this patch still bad, renal vein into IVC": a hard-edged rectangular patch lighter than the cava where the renal vein joins, the cava below it another shade; and (Budd-Chiari, Anatomy)
// "part of the IVC is missing": a gap in the cava below the liver with a hatched edge. Two root causes in the junction skins on the cava's lower stretch, both pinned here (node only, the real network and skin set):
//  1. THE WELD OF A TUBE END HAS ONE OWNER. The cava wall skin (S_PC and C9 land on the IVC's wall) has the IVC tube on both sides of it as arms, cut by a HOLE, and the sync wrote its weld to those arms' ENDS as well: ends that belong to the skins at them (the IVCI skin's seam
//     at the tube's start). With no growing arm there (Healthy) the weld was 0, which draws a cut end whole: the IVC tube drew again under the IVCI skin from its seam to the node, two veil layers of one vessel (alpha 0.45 twice is 0.70): the lighter rectangle, with the tube's outline across it.
//  2. AN ABSENT GROWING ARM HANDS ITS WEIGHT TO THE ARMS THAT STAY. With C9 open and S_PC closed (Budd-Chiari) the wall skin is welded, and S_PC's arm had presence 0 but kept its weight in the blend: the presence dither threw away every pixel it owned, over the stretch of the cava the tube
//     leaves to the skin (the hole), so the cava was missing there with a screen-door edge. The fragment stage now shares the weights among the arms that are there (skin/shaders.ts keepOf: the flags are bits of armFlow[1].w; skin-set.ts sync writes them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { keptWeights, presentAlpha } from '../src/scene/vessels/skin/arm-twins.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { GROWER_KINDS } from '../src/scene/vessels/skin/inventory.ts';
import { partKeyOf, skinKey, skinKeysWithArm } from './skin-names-lib.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

type Presence = 'shown' | 'hidden' | 'ghost';
/** The body with the closed shunts and collaterals as a preset leaves them: `open` shown, every other one `closed`; skins built and handed over once. */
function body(open: readonly string[], closed: Presence = 'hidden') {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group(), draws: SkinObject[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { const d = new SkinObject(mesh, arms[0]!, axes, arms); draws.push(d); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  const presence = (scene as unknown as { presence: { set(id: string, goal: Presence, instant: boolean): void } }).presence;
  // (every collateral and shunt of the network: the ones not in `open` are `closed`)
  for (const id of NETWORK.filter((v) => !v.feeder && !v.id.includes('~F') && GROWER_KINDS.has(v.kind)).map((v) => v.id)) presence.set(id, open.includes(id) ? 'shown' : closed, true);
  set.sync();
  return { scene, set, draws, done: () => { scene.dispose(); setSmoothJoins(was); } };
}
const weldOf = (scene: CelScene, id: string): number[] => ((scene.vesselObject(id) as VesselObject).toon.uniforms.skinWeld!.value as { toArray(): number[] }).toArray();
/** The lower cava's wall skin: the skin the portocaval shunt and the lumbar vein both land on. Since the junction table cut the cava at its take-offs it is the cluster `IVCI+IVC_M+IVC_C+IVC_P` (with the left renal vein's node and the mesocaval shunt's), a skin of the cava below, the iliac vein and the renal vein
 *  that hides the cava's two short pieces between the landings; found by its arms, never typed. */
const wallOf = (b: ReturnType<typeof body>): string => {
  const g = [...b.set.nodes].map((n) => ({ node: n, mesh: b.set.skinOf(n)! })), key = skinKeysWithArm(g, 'S_PC').find((k) => skinKeysWithArm(g, 'C9').includes(k));
  assert.ok(key, 'S_PC and C9 are arms of one skin'); assert.equal(skinKey(b.set.nodes, 'IVCI'), key, 'the renal vein\'s IVCI is a member of it');
  return key;
};

test('the twin: the weights of the arms that are there are the mesh\'s weights shared among them, and every arm kept leaves them as they are', () => {
  assert.deepEqual(keptWeights([0.2, 0.3, 0.5], [1, 1, 1]), [0.2, 0.3, 0.5]);
  const k = keptWeights([0.2, 0.2, 0.6], [1, 1, 0]);
  assert.ok(Math.abs(k[0]! - 0.5) < 1e-12 && Math.abs(k[1]! - 0.5) < 1e-12 && k[2] === 0);
  // the pixel the absent arm owned: before, a presence of 0.4 (a dither that threw 60 % of it away); now it is the arms that stay, whole
  assert.ok(Math.abs(presentAlpha([0.2, 0.2, 0.6], [0.45, 0.45, 1], [1, 1, 0]) - 0.45) < 1e-12);
  assert.ok(Math.abs([0.2, 0.2, 0.6].reduce((t, w, i) => t + w * [1, 1, 0][i]!, 0) - 0.4) < 1e-12, 'the old presence at that pixel');
  assert.ok(Math.abs(keptWeights([0.2, 0.2, 0.6], [1, 1, 0]).reduce((t, w, i) => t + w * [1, 1, 0][i]!, 0) - 1) < 1e-12, 'the new one');
  assert.deepEqual(keptWeights([0, 0, 1], [1, 1, 0]), [0, 0, 0], 'a pixel with only the absent arm in it has nothing to draw');
});

test('the fragment stage shares the weights among the kept arms (one wAt for the whole shader) and the skin takes the flags', () => {
  assert.match(SKIN_FS, /float wAt\(int i\) \{ return rawW\(i\) \* keepOf\(i\) \* gWKeep; \}/);
  assert.match(SKIN_FS, /gWKeep = [^;]*> exp2\(float\(6\)\) - 1\.5 \? 1\.0 : 1\.0 \/ max\(kept, 1\.0e-4\)/, 'every arm kept: the weights as they are');
  assert.doesNotMatch(SKIN_FS, /vWeight\[i\] \* armCopy/, 'no blend reads the raw weights');
});

test('Healthy: the cava wall skin (every growing arm closed) never writes the weld of a permanent tube end: the skin\'s seams stay whole, so the tube is not drawn again under the skin', () => {
  const b = body([]);
  try {
    // (the shunts and the lumbar vein land on one skin of the cava, the iliac vein and the renal vein, so with all of them closed its plain trunk stands in: the permanent arms are the cava below, the iliac vein and the renal vein, the growers are all out)
    const K = wallOf(b), sk = b.set.skinOf(K)!, perm = sk.junction.arms.filter((a) => !a.grow), grow = sk.junction.arms.filter((a) => a.grow);
    assert.ok(b.set.plainOf(K), 'the plain trunk stands in while no growing arm is there');
    assert.deepEqual(perm.map((a) => a.vesselId).sort(), ['ILI_IVC_1', 'IVC_IS_3', 'LRV_IVC']);
    for (const a of perm) assert.equal(weldOf(b.scene, a.vesselId)[a.end], 1, `${a.vesselId} end ${a.end}: the seam the skin leaves it at is whole (0 drew the cut part again under the skin, 0.70 where the veil should be 0.45)`);
    // an absent growing arm's own thread keeps its end: the tube is whole there
    for (const a of grow) assert.equal(weldOf(b.scene, a.vesselId)[a.end], 0, `${a.vesselId} end ${a.end}: a closed thread keeps its own end`);
    // the vessels the skin hides whole are not drawn at all: nothing of them is cut or welded by a hole
    for (const id of b.set.hiddenOf(K)) assert.deepEqual(weldOf(b.scene, id), [1, 1, 1], `${id}: hidden whole by the skin, untouched`);
    assert.deepEqual([...b.set.hiddenOf(K)].sort(), ['ILI_IVC_2', 'IVC_IS_1', 'IVC_IS_2'], 'the pieces between the landings are the skin\'s');
    assert.equal(b.set.weldOf(K), 0, 'no growing arm is there: the welded skin is not drawn');
  } finally { b.done(); }
});

test('every tube end a plain-bearing skin leaves a permanent seam at is whole, in every state of the shunts (no skin\'s weld lands on another skin\'s seam)', () => {
  for (const [open, closed] of [[[], 'hidden'], [[], 'ghost'], [['C9'], 'hidden'], [['C9', 'S_PC'], 'hidden'], [['S_MC', 'REX', 'S_DSR', 'TIPS'], 'hidden']] as const) {
    const b = body(open, closed);
    try {
      let checked = 0;
      const live = new Set<unknown>(b.set.liveDraws());
      for (const d of b.draws) {
        if (!live.has(d)) continue;
        const node = d.mesh.name.replace(/^skin:/, '');
        if (!b.set.plainOf(node.replace(/:.*$/, ''))) continue;
        const sk = b.set.skinOf(node.replace(/:.*$/, ''));
        if (!sk) continue;
        for (const a of sk.junction.arms) {
          if ((a as { grow?: boolean }).grow) continue;
          const w = weldOf(b.scene, a.vesselId)[a.end]!;
          assert.equal(w, 1, `[${open.join('+') || 'closed'} ${closed}] ${node}: ${a.vesselId} end ${a.end} (a permanent arm of a skin with a plain trunk) has weld ${w}`);
          checked++;
        }
      }
      assert.ok(checked >= 3, `${checked} permanent seams judged`);
    } finally { b.done(); }
  }
});

test('Budd-Chiari (C9 open, S_PC closed): the wall skin is welded and its closed arms hand their weight to the arms that stay; open every growing arm, or none, nothing is handed over', () => {
  const keepOf = (b: ReturnType<typeof body>) => {
    const K = wallOf(b), live = new Set<unknown>(b.set.liveDraws()), d = b.draws.find((x) => live.has(x) && x.mesh.name === `skin:${K}`);
    assert.ok(d, 'the cava wall skin'); return { K, keep: d!.keepOf(), arms: b.set.armIdsOf(d!), weld: d!.weldOf(), all: b.set.skinOf(K)!.junction.arms };
  };
  const bc = body(['C9']);
  try {
    const k = keepOf(bc), at = (id: string) => k.arms.indexOf(id);
    // (Plan 16 part A: with C9 open and S_PC closed the skin drawn is the PART with C9 only, welded; the whole welded skin is not drawn and keeps its keep flags for a part that could not be built)
    const only = partKeyOf(k.all, ['C9']), part = bc.set.partsOf(k.K).get(only);
    assert.ok(part, 'the part with C9 only');
    assert.ok(bc.set.armIdsOf(part!.draw).includes('C9') && !bc.set.armIdsOf(part!.draw).includes('S_PC'), 'it holds C9 and not S_PC');
    assert.deepEqual((part!.draw as SkinObject).weldOf(), [1, 1], 'welded: C9 is there');
    assert.equal(k.weld[1], 0, 'the whole welded skin is not drawn');
    assert.equal(k.keep[at('S_PC')], 0, 'S_PC is not there: its weight goes to the arms that stay');
    assert.equal(k.keep[at('C9')], 1);
    for (const a of k.all) if (!a.grow) assert.equal(k.keep[at(a.vesselId)], 1, `${a.vesselId} stays`);
    for (const a of k.all) if (a.grow && a.vesselId !== 'C9') assert.equal(k.keep[at(a.vesselId)], 0, `${a.vesselId} is closed: handed over`);
  } finally { bc.done(); }
  const probe = body([]);
  let growers: string[]; try { growers = keepOf(probe).all.filter((a) => a.grow).map((a) => a.vesselId); } finally { probe.done(); }
  const every = body(growers);
  try { const k = keepOf(every); assert.ok(k.keep.slice(0, k.arms.length).every((v) => v === 1), 'every arm there: nothing is handed over'); assert.deepEqual(k.weld, [1, 1], 'the whole welded skin is drawn'); } finally { every.done(); }
  const none = body([]);
  try { const k = keepOf(none); for (const id of growers) assert.equal(k.keep[k.arms.indexOf(id)], 0, `${id} is out`); assert.equal(k.weld[1], 0, 'and the skin is not drawn at all (the tube whole)'); } finally { none.done(); }
});
