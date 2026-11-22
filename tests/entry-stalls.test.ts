// Mohammad's iPhone audit (21 Nov, 20x): the entries of the sinusoid, the lobule and the Circuit stalled (389, 91 and 180 ms frames). What ran inside the first shown frame, and what keeps it out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { GeometryUploader, hiddenGeometries } from '../src/scene/materials/warm.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';

const geo = () => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); return g; };

test('hiddenGeometries lists each undrawn geometry once: under a hidden object, never a drawn one', () => {
  const root = new Group(), shown = new Mesh(geo(), new MeshBasicMaterial()), hid = new Group(), a = new Mesh(geo(), new MeshBasicMaterial()), shared = geo(), b = new Mesh(shared, new MeshBasicMaterial()), c = new Mesh(shared, new MeshBasicMaterial());
  hid.visible = false; hid.add(a, b); root.add(shown, hid, c);
  const list = hiddenGeometries(root);
  assert.equal(list.length, 2);
  assert.ok(list.includes(a.geometry) && list.includes(shared) && !list.includes(shown.geometry));
});

test('the uploader draws one geometry per step into its own target and puts the target back', () => {
  const calls: string[] = [];
  let target: unknown = 'screen';
  const gl = { render: (s: Group) => { calls.push(`draw:${(s.children[0] as Mesh).geometry.uuid}@${String(target)}`); }, getRenderTarget: () => target, setRenderTarget: (t: unknown) => { target = t; } };
  const root = new Group(); root.visible = false; const m1 = new Mesh(geo(), new MeshBasicMaterial()), m2 = new Mesh(geo(), new MeshBasicMaterial()); root.add(m1, m2);
  const up = new GeometryUploader(gl, new PerspectiveCamera(), 'tiny');
  up.add(root); up.add(root);   // (a second add finds nothing new)
  assert.equal(up.pending, 2);
  assert.equal(up.step(), true); assert.equal(up.step(), false);
  assert.deepEqual(calls, [`draw:${m1.geometry.uuid}@tiny`, `draw:${m2.geometry.uuid}@tiny`]);
  assert.equal(target, 'screen');
});

test('the page uploads the hidden geometries once the micro views are primed, at the patient\'s state', () => {
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8'), scene = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(stage, /cel\.onMicroPrimed = /); assert.match(stage, /new GeometryUploader\(/);
  assert.match(scene, /this\.onMicroPrimed\?\.\(\)/);
  // (the lobule is snapped to the patient's state once, before its cells are primed, and its first frame is then built hidden)
  assert.match(scene, /this\.primeSnapped = true; this\.snapMicroToModel\(\);[^\n]*\n\s*if \(this\.micro\.lobule\.primeCells\(\)\) \{ this\.microPrimed = true; this\.micro\.lobule\.update\(true, 0, 0, 1, true\); \}/);
});

test('the sinusoid: a stellate activation different from the primed one repaints no wall colours', () => {
  const shared = createShared(), flat: any = new SinusoidView(shared, { look: 'light' }), s3: any = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  while (!s3.shapeReady) s3.prepareShapeStep();
  s3.update(true, 1, true);
  flat.setVisible(true); flat.update(1000);
  s3.update(true, 1);
  let wall = 0, hsc = 0;
  const pw = s3.paintWall.bind(s3), ch = s3.colourHsc.bind(s3);
  s3.paintWall = () => { wall++; pw(); }; s3.colourHsc = (...a: unknown[]) => { hsc++; ch(...a); };
  flat.snapTargets({ ...flat.cur, act: 0.9 });
  flat.update(1016); s3.update(true, 1);
  assert.equal(wall, 0, 'the activation does not repaint the wall');
  assert.equal(hsc, 1, 'only the stellate cell is recoloured');
});
