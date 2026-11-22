// "Still broken: a black hole at the azygos where the arch meets the SVC" (Mohammad, 22 Nov, Schistosomiasis / NCPH). ROOT CAUSE: the skin mesh is one static shape with every arm whole and the host's tube is cut away under it. A growing arm that is not there (the ascending lumbar C9
// at this patient) is left out of the outline (f07a2725), and every arm that IS there held the pixels of its stub out by depth (skin/shaders.ts skinArmPx), so the band dropped them: nothing drew the host's wall behind the stub, a hole of a tenth of the skin's pixels. Measured in node
// by tests/skin-live-lib.ts (the fragment stage's outline rule at the engine's live swells, each pixel's nearest kept fragment): the hold-out is now taken relative to the least-held arm that is there (skinSdPx), so such a pixel is judged by the host's lumen.
// The same cause held at every skin with a growing arm (SVD, CONF, LRV_S, S_PC1/C90, the azygos). Never reverts b9154a0c (the rest capsule), which is right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { collateralOpen } from '../src/scene/vessels/network.ts';
import { gateSkins } from './skin-gate-lib.ts';
import { closeCamera, rasterLive, swellOf } from './skin-live-lib.ts';

const SCREEN = { w: 393, h: 852, dpr: 2, pxPerUnit: 500 } as const;
/** The hold-out ramp these twin tests were written against (0.25 k to k): the patches they pin (heldMin, the lumen rescue, the shade union) are for the whole welded skin as it stands when a part could not be built; with the later ramp (16C, 1 k to 2 k) the stub is held in
 *  sooner and these bites are fewer, so they ask for the ramp they bite on. */
const OLD_RAMP = [0.25, 1] as const;
/** The skin's pixels the live union calls vessel and no fragment is kept at, past what the skin has with every arm there (a sliver of the mesh's outer edge, by design). */
const EXTRA_HOLE_MAX = 0.02;

async function frameOf(preset: string): Promise<{ D: ArrayLike<number>; Q: ArrayLike<number>; Qf: ArrayLike<number> }> {
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'preset', id: preset, reqId: 1 });
  core.dispose();
  return out.filter((m) => m.type === 'frame').at(-1) as never;
}

test('a growing arm that is not there leaves no hole in its host: every skin, at the live swells of the presets, has no more unpainted vessel than with every arm there', async () => {
  const g = gateSkins();
  try {
    const growing = g.skins.filter((s) => s.mesh.junction.arms.some((a) => a.grow));
    assert.ok(growing.length >= 5, `${growing.length} skins with a growing arm`);
    let judged = 0;
    for (const preset of ['schisto', 'csph', 'budd-chiari', 'cirr-decomp']) {
      const fr = await frameOf(preset);
      for (const s of growing) {
        const arms = s.mesh.junction.arms;
        const swell = arms.map((a) => swellOf(fr.D[a.dataIndex]!, a.baseD, a.widthKind));
        const keep = arms.map((a) => (a.grow ? collateralOpen(a.vesselId, fr) : true));
        if (keep.every(Boolean) || !keep.some((k, i) => k && arms[i]!.grow)) continue;   // (none out: nothing to prove; none of the growers there: the plain trunk draws, not this skin)
        const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw: 0.3 });
        const now = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep });
        const all = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep: keep.map(() => true) });
        judged++;
        assert.ok((now.hole - all.hole) / now.covered <= EXTRA_HOLE_MAX, `${preset} ${s.node}: ${(100 * now.hole / now.covered).toFixed(1)} % of the skin is unpainted vessel (${(100 * all.hole / all.covered).toFixed(1)} % with every arm there)`);
      }
    }
    assert.ok(judged >= 4, `${judged} skin x preset cases judged`);
  } finally { g.done(); }
});

test('the test bites: with each arm held out on its own (the rule until 22 Nov) the azygos skin of the Schistosomiasis patient has pixels unpainted (2 percent at this zoom, none with the rule)', async () => {
  const g = gateSkins();
  try {
    const s = g.skins.find((k) => k.node.startsWith('wall:AZY_SVC'))!, arms = s.mesh.junction.arms, fr = await frameOf('schisto');
    const swell = arms.map((a) => swellOf(fr.D[a.dataIndex]!, a.baseD, a.widthKind));
    const keep = arms.map((a) => (a.grow ? collateralOpen(a.vesselId, fr) : true));
    assert.deepEqual(keep, [true, true, false, true], 'C9 collapsed, the varices open');
    const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw: 0.3 });
    const old = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep }, { absoluteHold: true, noRescue: true, ramp: OLD_RAMP }), now = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep });
    assert.ok(old.hole / old.covered > 0.015, `${(100 * old.hole / old.covered).toFixed(1)} % without the fix`);
    assert.ok(now.hole / now.covered < 0.005, `${(100 * now.hole / now.covered).toFixed(1)} % with it`);
  } finally { g.done(); }
});

test('the outline\'s hold-out is relative to the least-held arm that is there', async () => {
  const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
  assert.match(SKIN_FS, /heldMin = min\(heldMin, heldOf\[i\]\)/);
  assert.match(SKIN_FS, /\(heldOf\[i\] - heldMin\)/);
});

test('the shade follows the outline: at the Schistosomiasis azygos, the stub pixels the host now draws are shaded from the union of the arms that are there (the all-arm union would flip a cel band at two thirds of them: the ragged pale patch)', async () => {
  const g = gateSkins();
  try {
    const s = g.skins.find((k) => k.node.startsWith('wall:AZY_SVC'))!, arms = s.mesh.junction.arms, fr = await frameOf('schisto');
    const swell = arms.map((a) => swellOf(fr.D[a.dataIndex]!, a.baseD, a.widthKind));
    const keep = arms.map((a) => (a.grow ? collateralOpen(a.vesselId, fr) : true));
    const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw: 0 });
    const r = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep }, { ramp: OLD_RAMP }, { normals: true });
    assert.ok(r.newlyDrawn > 200, `${r.newlyDrawn} stub pixels are drawn in the host's lumen`);
    assert.ok(r.newlyDrawnBandFlip / r.newlyDrawn > 0.4, `${r.newlyDrawnBandFlip} of ${r.newlyDrawn} would change cel band if shaded as a stub`);
    const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
    assert.match(SKIN_FS, /\* keepOf\(i\)\);/, 'and the shader leaves the arms that are not there out of the shade union');
  } finally { g.done(); }
});

test('a pixel the arms\' screen union calls lumen is never dropped: the narrow varices\' stub at the Schistosomiasis azygos leaves no pixel of the skin unpainted (the black crescent under the purple\'s landing)', async () => {
  const g = gateSkins();
  try {
    const s = g.skins.find((k) => k.node.startsWith('wall:AZY_SVC'))!, arms = s.mesh.junction.arms, fr = await frameOf('schisto');
    const swell = arms.map((a) => swellOf(fr.D[a.dataIndex]!, a.baseD, a.widthKind));
    const keep = arms.map((a) => (a.grow ? collateralOpen(a.vesselId, fr) : true));
    assert.ok(swell[3]! < 0.5, `C1b is at swell ${swell[3]!.toFixed(2)} of its built width`);
    const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw: 0.3 });
    const before = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep }, { noRescue: true, ramp: OLD_RAMP }), now = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep });
    assert.ok(before.hole >= 20, `${before.hole} pixels are dropped inside the union without the rule`);
    assert.equal(now.hole, 0, 'none with it');
    const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
    assert.match(SKIN_FS, /if \(sdFlat <= -0\.5\) sdPx = sdFlat;/);
    assert.doesNotMatch(SKIN_FS, /\bbool flat\b/, '(flat is a reserved word in GLSL ES 3.00)');
  } finally { g.done(); }
});

test('a pixel of an absent arm\'s stub is not taken for a seam ring: the normal mix reads the raw weights of the arms that are there (wTop), so the shade is the union\'s there, not the stub mesh\'s', async () => {
  const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
  assert.match(SKIN_FS, /wTop = max\(wTop, rawW\(i\) \* keepOf\(i\)\)/);
  assert.doesNotMatch(SKIN_FS, /wTop = max\(wTop, wAt\(i\)\)/);
  const g = gateSkins();
  try {
    const s = g.skins.find((k) => k.node.startsWith('wall:AZY_SVC'))!, arms = s.mesh.junction.arms, fr = await frameOf('schisto');
    const swell = arms.map((a) => swellOf(fr.D[a.dataIndex]!, a.baseD, a.widthKind));
    const keep = arms.map((a) => (a.grow ? collateralOpen(a.vesselId, fr) : true));
    const cam = closeCamera(g.scene, SCREEN.w, SCREEN.h, s.mesh.junction.J, SCREEN.pxPerUnit, { yaw: 0 });
    const r = rasterLive(s, cam, SCREEN.w, SCREEN.h, SCREEN.dpr, { swell, keep }, { ramp: OLD_RAMP }, { normals: true });
    assert.ok(r.vertexNormalWrongly > 20, `${r.vertexNormalWrongly} pixels of the stub took the mesh's normal as a seam ring before`);
  } finally { g.done(); }
});
