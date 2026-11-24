// The braids' roots are welded (Mohammad, 20 Nov: "weld the collaterals ... as one mesh"). C1a (the varices), C2, C4, C7 and C8 (the cavernoma) are drawn as strands, their own course has radius 0 and they were left to the fork method (`nbr`,
// `bury`): strands overlapping the trunk with no surface joining them. Where the strands LEAVE a node as one bundle (the same axis and width, braid-arm.ts) the bundle is ONE growing arm of that node's skin: the skin's arm tube is the widest
// strand, its seam ring is the strands' start, every strand is cut at that ring (never short of it), and the skin eases the mouth open with the vessel's growth like any collateral's (spec 10.2).
// Pinned here: which roots are welded (named), that the closed skin is the plain trunk (nothing pops), and that no strand starts outside the skin. The ends that stay on the fork method are named, never silent.
// Node only: the real network and the real scene's tubes. Run: node --test tests/skin-strands.test.ts
import { test } from 'node:test';
import { PLACED } from '../src/scene/anatomy/source.ts';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes, TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { findSkinJunctions, growerEndsByNode, isGrower } from '../src/scene/vessels/skin/inventory.ts';
import { braidRootEnds, isBraid, strandCutU } from '../src/scene/vessels/skin/braid-arm.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { sdUnion, skinKOf, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

/** The braid roots that are welded: the end of the braid, the node whose skin it is an arm of. Pinned (a braid or a node added to the network is seen here). */
// placed only: C2 leaves the splenic vein near the hilum where the approved placement draws it (the V_SPL|SV_MID cut, node SVD), not at its engine node SV, so SVD's skin welds it
const WELDED: Record<string, readonly string[]> = { 'C2:0': [PLACED ? 'SVD' : 'SV'], 'C4:0': ['IMV'], 'C7:0': ['SMV_R'] };
/** A bundle root that is an arm of its node in the inventory but that the retry ladder drops: the strands leave IMV 25 degrees from the run-on V_COL, a growing arm along a permanent one, whose closed footprint folds (the mesher's limit as PVH's DIPS and the S_DSR pair: tests/skin-closed-footprint.test.ts). Named, not hidden. */
// placed only: the SV skin, its engine node, lets C2 go for SVD's (above)
const DROPPED_ROOT: Record<string, string> = PLACED ? { 'C2:0': 'SV' } : {};
/** The braid ends that keep the fork method, each for a reason a person can read. */
const FORK: Record<string, string> = {
  'C1a:0': 'LGV is the free start of the left gastric vein: one permanent arm, a run-on of two, no junction',
  'C1a:1': 'VAR: no vessel there, the varices end free',
  'C2:1': 'GV: no vessel there, the gastric varix ends free',
  'C4:1': 'ILI: the strands part at once (about one radius apart one radius from the node): no single ring holds them',
  'C7:1': 'ILI_R: the strands part at once',
  'C8:0': 'CONF: six channels that fan out of the node as separate tubes',
  'C8:1': 'PVH: six channels that fan out of the node as separate tubes',
};
const BRAIDS = ['C1a', 'C2', 'C4', 'C7', 'C8'];

const on = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

test('the braid roots are named: the ends where the strands leave a node as one bundle are arms of that node, the rest are the fork method\'s, each with its reason', () => {
  on(() => {
    const roots = BRAIDS.flatMap((id) => braidRootEnds(NETWORK_BY_ID.get(id)!).map((e) => `${id}:${e}`));
    const ends = BRAIDS.flatMap((id) => [0, 1].map((e) => `${id}:${e}`));
    assert.deepEqual(ends.filter((e) => !(e in WELDED)).sort(), Object.keys(FORK).sort(), 'every braid end is welded or named');
    assert.deepEqual(roots.filter((e) => !(e in WELDED)).sort(), ['C1a:0'], 'the bundle roots that are not welded: C1a\'s node has a single permanent arm');
    for (const e of Object.keys(WELDED)) assert.ok(roots.includes(e), `${e} is a bundle root`);
    for (const [key, node] of Object.entries(DROPPED_ROOT)) { const v = NETWORK_BY_ID.get(key.split(':')[0]!)!; assert.equal(node, key.endsWith(':0') ? v.from : v.to); assert.ok(findSkinJunctions().find((x) => x.node === node)!.arms.some((a) => a.vesselId === v.id && a.grow)); }
    const js = findSkinJunctions();
    for (const [key, nodes] of Object.entries(WELDED)) {
      const [id, end] = key.split(':') as [string, string], v = NETWORK_BY_ID.get(id)!;
      assert.ok(isBraid(v) && !isGrower(v), `${id} is a braid, not a one-tube grower`);
      const node = end === '0' ? v.from : v.to;
      assert.deepEqual([node], key in DROPPED_ROOT ? [DROPPED_ROOT[key]!] : nodes, 'its engine node (placed C2: SV, welded by SVD)');
      const j = js.find((x) => x.node === node)!;
      assert.ok(j, `${node} has a skin`);
      assert.ok(j.arms.some((a) => a.vesselId === id && a.end === Number(end) && a.grow), `${key} is a growing arm of ${node}`);
    }
    // the Circuit's inventory is the one-tube growers' only: its map draws a braid as its own course
    for (const [, es] of growerEndsByNode(Array.from(NETWORK_BY_ID.values()))) for (const e of es) assert.ok(!isBraid(e.v), `${e.v.id} is no arm of the Circuit's skins`);
  });
});

/** The real scene's phase-2 skins. */
function built() {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [], axes = new Map<SkinObject, readonly ArmAxis[]>(), parent = new Group(), warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => { const d = new SkinObject(mesh, arms[0]!, ax, arms); draws.push(d); axes.set(d, ax); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: (m) => warnings.push(m),
  });
  set.build(2);
  const live = new Set<unknown>(set.liveDraws());
  for (let i = draws.length - 1; i >= 0; i--) if (!live.has(draws[i])) draws.splice(i, 1);
  return { scene, set, draws, axes, warnings, was };
}
/** The nodes a skin stands for (a merged skin is named `A+B`). */
const skinOf = (d: SkinObject): string[] => d.mesh.name.replace('skin:', '').split('+');
const capsOf = (ax: readonly ArmAxis[]): Capsule[] => ax.map((a) => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate }));

test('every welded braid root is a growing arm of a built skin, none is dropped, nothing falls back; its skin is static with the arm whole', () => {
  const b = built();
  try {
    assert.deepEqual(b.warnings, []);
    const dropped = [...b.set.dropped].filter((d) => BRAIDS.some((id) => d.endsWith(`:${id}`)));
    assert.deepEqual(dropped, Object.entries(DROPPED_ROOT).map(([k, n]) => `${n}:${k.split(':')[0]}`), 'only the named root is dropped by the retry ladder');
    let n = 0;
    for (const [key, nodes] of Object.entries(WELDED)) {
      const [id, end] = key.split(':') as [string, string];
      const d = b.draws.find((x) => skinOf(x).includes(nodes[0]!));
      assert.ok(d, `${nodes[0]} has a skin`);
      const m: SkinMesh = b.set.skinOf(d.mesh.name.replace('skin:', ''))!;
      const ai = m.junction.arms.findIndex((a) => a.vesselId === id && a.end === Number(end));
      assert.ok(ai >= 0, `${key} is an arm of ${nodes[0]}`);
      assert.ok(m.junction.arms[ai]!.grow, `${key} is a growing arm of its skin: whole in the static skin, the tube's flared end grows and the weld hands over at growth 0.9 to 1`);
      n++;
    }
    assert.equal(n, Object.keys(WELDED).length);
  } finally { b.scene.dispose(); setSmoothJoins(b.was); }
});

test('no strand starts outside the skin: each strand is cut at the seam\'s distance on the longest strand, and its first drawn ring lies inside the skin at full growth', () => {
  const b = built();
  try {
    for (const [key, nodes] of Object.entries(WELDED)) {
      const [id, end] = key.split(':') as [string, string], v = NETWORK_BY_ID.get(id)!, e = Number(end) as 0 | 1;
      const d = b.draws.find((x) => skinOf(x).includes(nodes[0]!))!, name = d.mesh.name.replace('skin:', '');
      const m = b.set.skinOf(name)!, ai = m.junction.arms.findIndex((a) => a.vesselId === id && a.end === e);
      const caps = capsOf(b.axes.get(d)!), k = skinKOf(m.junction.arms), obj = b.scene.vesselObject(id)!;
      const cut = obj.skinCut(), u = e ? cut[1] : cut[0];
      assert.ok(e ? u < 1 : u > 0, `${key} is cut`);
      // the cut is the arm's seam u moved to the longest strand's share: never later than the seam on any strand
      const cs = coursesOf(v, REST), tubular = tubularOf(v, slicesFor(id)), tb = buildTubes(cs, tubular, v.radius), R = v.radius;
      assert.equal(cs[0]!.radius, 0, `${id}'s own course has no tube: the strands are the vessel`);
      for (let s = 1; s < cs.length; s++) {
        const run = tb.runs[s]!, ring = e ? Math.floor(u * run.tubular) : Math.ceil(u * run.tubular);   // (the first ring that is drawn)
        for (let q = 0; q < TUBE_RADIAL; q++) {
          const i = run.tubeStart + ring * (TUBE_RADIAL + 1) + q, p = tb.geometry.getAttribute('position');
          assert.ok(sdUnion(caps, k, p.getX(i), p.getY(i), p.getZ(i)) <= 0.12 * R, `${key} strand ${s}: its first drawn ring is inside the skin (${(sdUnion(caps, k, p.getX(i), p.getY(i), p.getZ(i)) / R).toFixed(3)} R)`);
        }
      }
    }
  } finally { b.scene.dispose(); setSmoothJoins(b.was); }
});

test('strandCutU: the seam\'s distance over the longest strand; anything but a braid keeps u', () => {
  on(() => {
    const v = NETWORK_BY_ID.get('C2')!, cs = coursesOf(v, REST);
    assert.ok(cs.length > 1);
    assert.equal(strandCutU(NETWORK_BY_ID.get('SV_MID')!, REST, 0, 0.3), 0.3);
    const u0 = strandCutU(v, REST, 0, 0.1), u1 = strandCutU(v, REST, 1, 0.9);
    assert.ok(u0 <= 0.1 && u0 > 0.05, `end 0: ${u0}`);
    assert.ok(u1 >= 0.9 && u1 < 0.95, `end 1: ${u1}`);
  });
});
