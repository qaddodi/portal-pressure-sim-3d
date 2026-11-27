// The body's junction skins and the Circuit's change (Mohammad, 27 Nov, iPhone: going from the Circuit back to the Anatomy "a segment in the splenic vein just appears in place").
// ROOT CAUSE: the tubes peel by flow rank (circuit/peel.ts: the gut and the spleen first, the heart last), but a skin has no course and waited on the WHOLE change's clock (circT):
// it stood whole at its final place while its tubes, the gut's and the spleen's, were still a third of the way home. Now a skin leaves and returns by its OWN share of the change,
// the rank of its vertex (skin-rank.ts: its arms' ranks at their seams, by weight), as its tubes' cut part does (vessels/shaders.ts vCircShare), and a seam's thread by its seam's.
// Node only. Run: node --test tests/skin-rank.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { bakedSkins } from '../src/scene/vessels/skin/baked.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { rankAt, skinRankOf } from '../src/scene/vessels/skin/skin-rank.ts';
import { SKIN_CIRC_SPAN } from '../src/scene/vessels/skin/types.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SUTURE_FS } from '../src/scene/vessels/suture.ts';
import { peelAt } from '../src/scene/circuit/peel.ts';

const squash = (s: string) => s.replace(/\s+/g, ' ');

/** How far (share of the change) the tubes at a skin's seams may be from home while the skin shows at all. Under the whole change's clock the splenic area's were 0.64 at circT 0.35, where the skin was still half there. */
const HOME = 0.4;

function skins(): { meshes: ReturnType<SkinSet['skinOf']>[]; done: () => void } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group(), draws: SkinObject[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => { const d = new SkinObject(mesh, arms[0]!, ax, arms); draws.push(d); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {}, baked: bakedSkins,
  });
  set.build(2);
  const names = new Set(set.liveDraws().map((d) => (d as SkinObject).mesh.name.replace('skin:', '')));
  return { meshes: [...names].map((n) => set.skinOf(n)), done: () => { scene.dispose(); setSmoothJoins(was); } };
}

test('a skin vertex\'s rank lies among its arms\' ranks, and a spleen-area skin is earlier in the flow than a liver one', () => {
  const b = skins();
  try {
    assert.ok(b.meshes.length > 20, 'the figure has its skins');
    for (const m of b.meshes) {
      const arms = m!.cuts.map((c) => rankAt(c.vesselId, c.u)).filter((a) => !Number.isNaN(a)), lo = Math.min(...arms) - 1e-5, hi = Math.max(...arms) + 1e-5, r = skinRankOf(m!);
      for (let v = 0; v < r.length; v++) assert.ok(r[v]! >= lo && r[v]! <= hi, `${m!.junction.node}: vertex ${v} rank ${r[v]} outside ${lo}..${hi}`);
    }
    assert.ok(rankAt('SV_MID', 0.5) < 0.3, 'the splenic vein is early in the flow');
    assert.ok(rankAt('SV_MID', 0.5) < rankAt('IVC_IS', 0.5), 'the splenic vein leaves before the cava');
  } finally { b.done(); }
});

test('a skin shows only while the tubes at its seams are home (the whole change\'s clock showed the splenic skin with its tubes half way)', () => {
  const b = skins();
  try {
    let worst = 0, where = '';
    for (const m of b.meshes) {
      const arms = m!.cuts.map((c) => rankAt(c.vesselId, c.u)), r = skinRankOf(m!);   // (an arm with no map course is NaN: it does not travel, it fades by the whole change)
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        for (let v = 0; v < r.length; v += 7) {
          const shown = 1 - Math.min(1, Math.max(0, peelAt(t, r[v]!) / SKIN_CIRC_SPAN));   // (smoothstep's own foot: shown at all only while the share is under the span)
          if (shown <= 0) continue;
          for (let i = 0; i < arms.length; i++) {
            const w = i < 4 ? m!.weight[4 * v + i]! : m!.weight2[2 * v + i - 4]!;
            if (w < 0.05 || !COURSES.has(m!.cuts[i]!.vesselId)) continue;
            const away = peelAt(t, arms[i]!);
            if (away > worst) { worst = away; where = `${m!.junction.node} arm ${m!.cuts[i]!.vesselId} at circT ${t}`; }
          }
        }
      }
    }
    assert.ok(worst < HOME, `a skin shows with a tube of its own ${worst.toFixed(2)} of the way off (${where})`);
  } finally { b.done(); }
});

test('the programs read the vertex\'s own share: the skin by its rank, the tube\'s cut part by its vertex, the thread by its seam', () => {
  assert.match(SKIN_VS, /attribute float skinRank;/);
  assert.match(squash(SKIN_FS), /smoothstep\(0\.0, 0\.05, ownShare\)/);
  assert.ok(!/smoothstep\(0\.0, 0\.35, circT\)/.test(squash(SKIN_FS)), 'no part of the skin waits on the whole change (the clot paint too)');
  assert.ok(squash(VESSEL_FS).includes('smoothstep(0.0, 0.05, circStay < 0.999 ? circT : vCircShare)'), 'the tube\'s cut part comes back by its vertex\'s share');
  assert.match(SUTURE_FS, /uniform float sRank;/);
  assert.match(squash(SUTURE_FS), /smoothstep\(0\.0, 0\.05, own\)/);
  assert.equal(SKIN_CIRC_SPAN, 0.05);
});
