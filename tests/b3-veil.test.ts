// The 2D figure draws the vessels behind the organs (BACK_EDGES) behind them, the organ's veil over them at 0.4 (stage VEIL_K), and the cava faint along its whole course (F_VEIL).
// With every vessel drawn over the organs in the second pass the cava stood solid across the liver; this keeps the 2D look: the cava is drawn only as its faint copy, the others
// are drawn with the organs (an organ in front hides them) and again, faint, over them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { BACK_EDGES, IVC_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const s = new CelScene();
const veilAll = (id: string) => s.vesselObject(id)!.group.children.filter((c) => (c as { material?: { defines?: Record<string, unknown> } }).material?.defines?.VEIL);
/** The colour pass of the veil (its depth-only pass, drawn first, has colorWrite off). */
const veilMeshes = (id: string) => veilAll(id).filter((c) => (c as unknown as { material: { colorWrite: boolean } }).material.colorWrite);

test('every vessel the 2D figure puts behind the organs has its faint copy over them', () => {
  for (const id of BACK_EDGES) {
    const o = s.vesselObject(id);
    if (!o) continue;
    const v = veilMeshes(id);
    assert.equal(v.length, 1, `${id} has one veil mesh`);
    assert.ok(v[0]!.layers.isEnabled(1), `${id}'s veil is drawn in the pass over the organs`);
    assert.ok((v[0] as unknown as { material: { transparent: boolean; depthWrite: boolean } }).material.transparent);
  }
});

test('the cava is drawn only faint; the other back vessels are also drawn with the organs, which can hide them', () => {
  for (const id of BACK_EDGES) {
    const o = s.vesselObject(id);
    if (!o) continue;
    if (IVC_EDGES.has(id)) assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER) && !o.toonMesh.layers.isEnabled(0) && !o.toonMesh.layers.isEnabled(1), `${id} has no solid draw`);
    else assert.ok(o.toonMesh.layers.isEnabled(0), `${id} is drawn with the organs`);
  }
});

test('a vessel in front of the organs is drawn over them, solid, and has no veil', () => {
  const o = s.vesselObject('PV_TRUNK')!;
  assert.ok(o.toonMesh.layers.isEnabled(1) && !o.toonMesh.layers.isEnabled(0));
  assert.equal(veilMeshes('PV_TRUNK').length, 0);
});

test('the veil is the fragment shader at 0.4 (a uniform, so the cava can ease to whole), opaque otherwise', () => {
  assert.match(VESSEL_FS, /#ifdef VEIL\s+uniform float veilA;[^\n]*\n#define VEIL_A max\(veilA, [0-9.]+\)\s+#else\s+const float VEIL_A = 1\.0;/);
  assert.equal((VESSEL_FS.match(/gl_FragColor = vec4\([^;]*VEIL_A \* vFade\);/g) ?? []).length, 2, 'the ink and the body both carry it');
  assert.ok(!/gl_FragColor = vec4\([^;]*, 1\.0\);/.test(VESSEL_FS), 'no opaque write is left');
});

test('a faint-only vessel can still be picked', () => {
  // a ray along the cava would hit it: the mesh is on the layer the raycaster enables
  const o = s.vesselObject('IVC_IS')!;
  assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER));
});

test('the veil has a depth-only pass first, so the colour pass blends one layer where tubes, ink and caps overlap (no dark ball joints)', () => {
  for (const id of ['IVC_IS', 'IVCS_RA', 'ILI_IVC']) {
    const all = veilAll(id) as unknown as { renderOrder: number; material: { colorWrite: boolean; depthWrite: boolean; polygonOffset: boolean } }[];
    const pre = all.find((c) => !c.material.colorWrite)!, col = all.find((c) => c.material.colorWrite)!;
    assert.ok(pre && col, `${id} has both passes`);
    assert.equal(pre.material.depthWrite, true); assert.equal(pre.material.polygonOffset, true);
    assert.equal(col.material.depthWrite, false);
    assert.ok(pre.renderOrder < col.renderOrder, 'the depth pass is drawn first');
  }
});
