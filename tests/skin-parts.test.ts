// Plan 16 (Mohammad, 22 Nov: "the esophageal varix into the azygos junction is fucked", Schistosomiasis). ROOT CAUSE: a skin draws whatever triangles its mesh has; the fragment stage can recolour a pixel or drop it, but it cannot move the surface the pixel
// lies on. The skin set built two meshes for a junction with growing arms, the welded skin (every grower whole) and the plain trunk (none), so a skin with TWO growers (the azygos wall: C9 and C1b; the cava wall: S_PC and C9) with one open and the other collapsed drew
// the welded skin, which carries the collapsed one's whole stub beside the open one's landing: 33 px off the live union at the azygos (Schistosomiasis), 35 px at the lower cava (Budd-Chiari). Every per-pixel rule since f414b520 hid that stub one pixel at a time and none could.
// Now the skin has a mesh for each set of growers that are there (plain.ts partOf), and sync draws the one for the set that is. Node only: the real network, the engine's live frames, the baked skins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { partKey, partOf, partSets, plainOf } from '../src/scene/vessels/skin/plain.ts';
import { gateSkins } from './skin-gate-lib.ts';
import { closeCamera, rasterLive } from './skin-live-lib.ts';
import { drawnSkins, offUnion } from './skin-parts-lib.ts';

async function frameOf(preset: string): Promise<{ D: ArrayLike<number>; Q: ArrayLike<number>; Qf: ArrayLike<number> }> {
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'preset', id: preset, reqId: 1 });
  core.dispose();
  return out.filter((m) => m.type === 'frame').at(-1) as never;
}
const AZY = 'wall:AZY_SVC:C1b1', CAVA = 'wall:IVC_IS_1:S_PC1,C90';   // (the azygos wall skin has one grower since Plan 16D: the lumbar vein runs on into the arch's start, tests/azygos-origin.test.ts)

test('partOf: the plain trunk is the part with no grower, the welded skin the part with every one, and a skin with two growers has one part for each', () => {
  const arm = (id: string, grow: boolean) => ({ vesselId: id, end: 1, grow });
  const plan = { junction: { node: 'N', arms: [arm('A', false), arm('B', false), arm('G1', true), arm('G2', true)] }, cuts: [0, 1, 2, 3].map((i) => ({ i })) } as never as Parameters<typeof partOf>[0];
  assert.deepEqual(partSets(plan), [[2], [3]]);
  assert.equal(partOf(plan, [2, 3]), null, 'every grower: the welded skin itself');
  assert.equal(plainOf(plan), null, 'two permanent arms are no junction of their own (PLAIN_MIN_ARMS)');
  const p = partOf(plan, [3])!;
  assert.deepEqual(p.keep, [0, 1, 3]);
  assert.equal(p.junction.node, 'N~with3');
  assert.deepEqual(p.cuts, [{ i: 0 }, { i: 1 }, { i: 3 }], 'the welded skin\'s own cuts, so the seam rings are the same');
  assert.equal(partKey([2, 3]), '2.3');
  const three = { junction: { node: 'M', arms: [arm('A', false), arm('B', false), arm('C', false), arm('G1', true), arm('G2', true)] }, cuts: [] } as never as Parameters<typeof partOf>[0];
  assert.deepEqual(plainOf(three)!.keep, [0, 1, 2]);
  assert.deepEqual(partSets(three), [[3], [4]]);
});

test('G1: the mesh drawn at a patient is the union of the arms that are there: every part stands within a pixel (p95) and two (max, three at the cava until the unequal swells are projected) of the live union, at 700 px a unit', async () => {
  const g = gateSkins();
  try {
    assert.deepEqual(g.set.partFailed, [], 'every part built');
    assert.deepEqual(g.set.bulgeOver, [], 'no part bulges past BULGE_MAX');
    const twoGrowers = g.skins.filter((s) => s.mesh.junction.arms.filter((a) => a.grow).length === 2).map((s) => s.node);
    // (the Rex bypass and the umbilical vein both weld on the left portal vein's wall since they were spread apart, anatomy/placed-network.ts PAIR_GAP_R: that skin's parts are judged too)
    assert.deepEqual(twoGrowers.sort(), ['SMV', 'SVD', 'LRV_S', CAVA, 'wall:PVH_L_1:REX1,C30'].sort().filter((n) => twoGrowers.includes(n)), 'the skins with two growers');
    assert.equal(g.partsOf(CAVA).length, 2, `${CAVA}: a part for each grower`);
    assert.equal(g.partsOf(AZY).length, 0, `${AZY}: one grower, no parts`);
    let parts = 0; const seen: string[] = []; let bite = 0;
    for (const preset of ['schisto', 'csph', 'budd-chiari', 'cirr-decomp', 'cirr-comp', 'ncph']) {
      const fr = await frameOf(preset);
      for (const d of drawnSkins(g, fr)) {
        if (d.kind !== 'part') continue;
        parts++; seen.push(`${preset}:${d.node}`);
        const o = offUnion(d.skin!, d.swell, d.keep);
        assert.ok(o.p95 <= 1, `${preset} ${d.node} (${d.here}): p95 ${o.p95.toFixed(2)} px off the live union`);
        assert.ok(o.max <= (d.node === CAVA ? 3.2 : 2), `${preset} ${d.node} (${d.here}): max ${o.max.toFixed(2)} px off the live union`);
        // the same patient on the welded skin (what was drawn): the whole absent stub stands out of the union
        const was = offUnion(d.full.skin, d.full.swell, d.full.keep);
        // (the test bites: every part's welded skin stands its absent stub out of the union 5 px or more past the part, and some by more than 10 px at p95; the Rex bypass's stub on the left portal vein's wall is a short one, 9.5 to 9.8 px)
        assert.ok(was.p95 > o.p95 + 5, `${preset} ${d.node}: the welded skin was ${was.p95.toFixed(1)} px off at p95 against the part's ${o.p95.toFixed(2)} (the test bites)`);
        bite = Math.max(bite, was.p95);
      }
    }
    assert.ok(bite > 10, `the welded skins were at most ${bite.toFixed(1)} px off at p95 (the test bites)`);
    assert.ok(seen.includes(`budd-chiari:${CAVA}`), seen.join(' '));
    assert.ok(parts >= 1, `${parts} part cases judged`);
  } finally { g.done(); }
});

/** The body with every shunt and collaterals as `open` leaves them, skins built and handed over once (tests/skin-wall-weld-keep.test.ts). */
function body(open: readonly string[], fade: Record<string, number> = {}) {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group(), draws: SkinObject[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { const d = new SkinObject(mesh, arms[0]!, axes, arms); draws.push(d); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  const presence = (scene as unknown as { presence: { set(id: string, goal: 'shown' | 'hidden', instant: boolean): void } }).presence;
  for (const id of ['S_PC', 'S_MC', 'C9', 'C1b', 'REX', 'TIPS', 'S_DSR', 'DIPS']) presence.set(id, open.includes(id) ? 'shown' : 'hidden', true);
  for (const [id, r] of Object.entries(fade)) (scene.vesselObject(id)!.toon.uniforms.fade as { value: number }).value = r;   // (its presence at the seam, armPresenceAt: a growth between WELD_FROM and 1 is a weld between 0 and 1)
  set.sync();
  return { scene, set, draws, done: () => { scene.dispose(); setSmoothJoins(was); } };
}
/** The share of its pixels each skin of a node draws (the weld state [mode, share] of skin-object.ts setWeld: +1 keeps the pixels under the share, -1 the rest): the welded skin, each part ('2', '3'), the plain trunk. */
function drawn(b: ReturnType<typeof body>, node: string): Record<string, number> {
  const share = ([mode, w]: readonly number[]): number => (mode! > 0 ? w! : 1 - w!);
  const o: Record<string, number> = { welded: share((b.set.liveDraws()[b.set.nodes.indexOf(node)] as SkinObject).weldOf()) };
  for (const [k, p] of b.set.partsOf(node)) o[k] = share((p.draw as SkinObject).weldOf());
  return o;
}

test('G6: the pair that stands for the weld is the skin of the growers that are there and the skin without the one coming; every other skin of the node is not drawn', () => {
  const cases: { open: string[]; want: Record<string, number> }[] = [
    { open: ['S_PC', 'C9'], want: { welded: 1, '2': 0, '3': 0 } },
    { open: ['C9'], want: { welded: 0, '2': 0, '3': 1 } },   // the part with the lumbar vein only
    { open: ['S_PC'], want: { welded: 0, '2': 1, '3': 0 } },
    { open: [], want: { welded: 0, '2': 0, '3': 0 } },
  ];
  for (const c of cases) {
    const b = body(c.open);
    try { assert.deepEqual(drawn(b, CAVA), c.want, `open ${c.open}`); } finally { b.done(); }
  }
  // C9 still coming (growth between WELD_FROM and 1) with S_PC whole: the welded skin takes its share of one screen pattern and the part WITHOUT C9 (S_PC only) the rest, so a pixel is exactly one of them
  const half = body(['S_PC', 'C9'], { C9: 0.95 });
  try {
    const st = drawn(half, CAVA), w = st.welded!;
    assert.ok(w > 0 && w < 1, `the welded share ${w}`);
    assert.ok(Math.abs(st['2']! - (1 - w)) < 1e-12, 'the part with S_PC only draws the other pixels of the same screen pattern');
    assert.equal(st['3'], 0, 'the part with C9 only is not drawn');
  } finally { half.done(); }
});

test('G3: the part drawn at a patient leaves no unpainted vessel at the landing (the twin of the fragment stage, at the shot\'s zoom, two yaws)', async () => {
  const g = gateSkins();
  try {
    let judged = 0;
    for (const preset of ['schisto', 'csph', 'cirr-decomp', 'budd-chiari']) {
      const fr = await frameOf(preset);
      for (const d of drawnSkins(g, fr)) {
        if (d.kind !== 'part' || !d.skin) continue;
        for (const yaw of [0, 0.3]) {
          const cam = closeCamera(g.scene, 393, 852, d.skin.mesh.junction.J, 700, { yaw });
          const r = rasterLive(d.skin, cam, 393, 852, 3, { swell: d.swell, keep: d.keep });
          assert.equal(r.hole, 0, `${preset} ${d.node} (${d.here}) yaw ${yaw}: ${r.hole} vessel pixels no fragment is kept at`);
          judged++;
        }
      }
    }
    assert.ok(judged >= 2, `${judged} cases`);
  } finally { g.done(); }
});
