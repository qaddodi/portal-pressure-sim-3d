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
  for (const id of ['S_PC', 'S_MC', 'C9', 'C1b', 'REX', 'TIPS', 'S_DSR', 'DIPS']) presence.set(id, open.includes(id) ? 'shown' : closed, true);
  set.sync();
  return { scene, set, draws, done: () => { scene.dispose(); setSmoothJoins(was); } };
}
const weldOf = (scene: CelScene, id: string): number[] => ((scene.vesselObject(id) as VesselObject).toon.uniforms.skinWeld!.value as { toArray(): number[] }).toArray();
const WALL = 'wall:IVC_IS_1:S_PC1,C90';

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

test('Healthy: the cava wall skin (S_PC and C9 closed) never writes the weld of the IVC tube\'s ends: the IVCI skin\'s seam stays whole, so the tube is not drawn again under the skin', () => {
  const b = body([]);
  try {
    assert.ok(b.set.plainOf('IVCI'), 'IVCI has a plain trunk (the IVC both ways and the left renal vein)');
    const w = weldOf(b.scene, 'IVC_IS_1');
    assert.equal(w[0], 1, 'IVC_IS_1 start: the seam the IVCI skin leaves it at is whole (0 drew the cut part again under the skin, 0.70 where the veil should be 0.45)');
    assert.equal(weldOf(b.scene, 'ILI_IVC_1')[1], 1, 'the same at ILI_IVC_1, the other side of the node');
    assert.equal(weldOf(b.scene, 'LRV_IVC')[1], 1, 'and at the renal vein');
    // the wall skin is not drawn (no growing arm is there) and its hole is dithered back to the tube whole
    assert.equal(w[2], 0, 'the hole\'s weld is the wall skin\'s own: 0, the tube shows through');
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

test('Budd-Chiari (C9 open, S_PC closed): the wall skin is welded and its closed arm hands its weight to the arms that stay; open both, or neither, nothing is handed over', () => {
  const keepOf = (b: ReturnType<typeof body>) => { const live = new Set<unknown>(b.set.liveDraws()), d = b.draws.find((x) => live.has(x) && x.mesh.name === `skin:${WALL}`); assert.ok(d, 'the cava wall skin'); return { keep: d!.keepOf(), arms: b.set.armIdsOf(d!), weld: d!.weldOf() }; };
  const bc = body(['C9']);
  try {
    const k = keepOf(bc), at = (id: string) => k.arms.indexOf(id);
    assert.equal(k.weld[1], 1, 'welded: C9 is there');
    assert.equal(k.keep[at('S_PC')], 0, 'S_PC is not there: its weight goes to the arms that stay');
    assert.equal(k.keep[at('C9')], 1);
    assert.ok(k.arms.filter((id) => id === 'IVC_IS_1').length === 2 && k.keep.slice(0, 4).filter((v, i) => k.arms[i] === 'IVC_IS_1' && v === 1).length === 2, 'both sides of the cava stay');
  } finally { bc.done(); }
  const both = body(['C9', 'S_PC']);
  try { const k = keepOf(both); assert.ok(k.keep.slice(0, k.arms.length).every((v) => v === 1), 'every arm there: nothing is handed over'); } finally { both.done(); }
  const none = body([]);
  try { const k = keepOf(none); assert.equal(k.keep[k.arms.indexOf('S_PC')], 0); assert.equal(k.keep[k.arms.indexOf('C9')], 0); assert.equal(k.weld[1], 0, 'and the skin is not drawn at all (the tube whole)'); } finally { none.done(); }
});
