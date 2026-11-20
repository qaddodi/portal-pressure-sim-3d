// The 2D figure draws the vessels behind the organs (BACK_EDGES) behind them; here the cava is drawn only as its copy over the organs, the others with the organs (an organ in front hides them) and again over them.
// Every copy is OPAQUE (Mohammad, 20 Nov: "Why is the venacava glassy"): two flat tones and the ink, no alpha at rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { BACK_EDGES, IVC_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const s = new CelScene();
const matsOf = (c: unknown): { defines?: Record<string, unknown>; transparent: boolean; depthWrite: boolean; polygonOffset: boolean; stencilWrite: boolean }[] => { const m = (c as { material?: unknown }).material; return (Array.isArray(m) ? m : m ? [m] : []) as never; };
const veilAll = (id: string) => s.vesselObject(id)!.group.children.filter((c) => matsOf(c).some((m) => m.defines?.VEIL));
/** The copy over the organs: one mesh, the body then the ink. */
const veilMeshes = (id: string) => veilAll(id);

test('every vessel the 2D figure puts behind the organs has its faint copy over them', () => {
  for (const id of BACK_EDGES) {
    const o = s.vesselObject(id);
    if (!o) continue;
    const v = veilMeshes(id);
    assert.equal(v.length, 1, `${id} has one veil mesh`);
    assert.ok(v[0]!.layers.isEnabled(1), `${id}'s veil is drawn in the pass over the organs`);
    const fades = (s.vesselObject(id)!.toon.uniforms.fadeMode!.value as number) > 0;
    assert.ok(matsOf(v[0]).every((m) => m.transparent === fades), 'opaque, not a veil, except through a fade zone');
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

test('the cava behind the organs is whole, not a veil: the fragment shader writes alpha 1 everywhere', () => {
  assert.doesNotMatch(VESSEL_FS, /veilA|VEIL_A/, 'no veil alpha');
  assert.equal((VESSEL_FS.match(/gl_FragColor = vec4\(c, vFade \* \(1\.0 - cavaCut \* nbrK\)\);/g) ?? []).length, 1, 'the body writes only its fade zone\'s alpha');
});

test('a faint-only vessel can still be picked', () => {
  // a ray along the cava would hit it: the mesh is on the layer the raycaster enables
  const o = s.vesselObject('IVC_IS')!;
  assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER));
});

test('the copy over the organs is the vessel\'s own one draw: an opaque (outside a fade zone) body that writes depth, the outline part of the tube', () => {
  for (const id of ['IVC_IS', 'IVCS_RA', 'ILI_IVC']) {
    const ms = matsOf(veilAll(id)[0]);
    assert.equal(ms.length, 1, `${id}: one material`);
    assert.equal(ms[0]!.transparent, (s.vesselObject(id)!.toon.uniforms.fadeMode!.value as number) > 0); assert.equal(ms[0]!.depthWrite, true);
    assert.equal(ms[0]!.stencilWrite, false, 'no stencil bit to share');
  }
});
