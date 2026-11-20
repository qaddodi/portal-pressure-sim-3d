import test from 'node:test';
import assert from 'node:assert/strict';
import { type BufferGeometry, type Mesh, type Object3D } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { cellOutline } from '../src/scene/micro3d/sinusoid3d.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';

function meshes(root: Object3D): Mesh[] { const out: Mesh[] = []; root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); }); return out; }
const finite = (g: BufferGeometry) => { const a = g.getAttribute('position')?.array ?? []; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false; return true; };

function scene() {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true);
  flat.update(1000); flat.update(1016);
  return { flat, s3 };
}

test('the 3D sinusoid builds every part, finite, and stands in for the flat drawing while on', () => {
  const { flat, s3 } = scene();
  assert.equal(s3.update(true), true);
  assert.equal(s3.group.visible, true);
  assert.equal(flat.tissue.visible, false); assert.equal(flat.cells.visible, false); assert.equal(flat.sprites.visible, false);
  const ms = meshes(s3.group);
  let verts = 0;
  for (const m of ms) { assert.ok(finite(m.geometry), `${m.name} has no NaN`); verts += m.geometry.getAttribute('position')?.count ?? 0; }
  for (const n of ['sinusoid3d/lumen', 'sinusoid3d/endothelium', 'sinusoid3d/hepatocytes', 'sinusoid3d/nuclei', 'sinusoid3d/kupffer', 'sinusoid3d/stellate', 'sinusoid3d/disse']) {
    const m = ms.find((x) => x.name === n);
    assert.ok(m && (m.geometry.getAttribute('position')?.count ?? 0) > 50, `${n} is built`);
  }
  assert.ok(verts < 300_000, `a phone draws it: ${verts} vertices`);
});

test('off: the flat view draws again and the 3D scene is hidden', () => {
  const { flat, s3 } = scene();
  s3.update(true); s3.update(false);
  assert.equal(s3.group.visible, false);
  assert.equal(flat.tissue.visible, true);
});

test('a hepatocyte keeps to 2D\'s plate: between the Disse face and 20 µm in, with its cleft taken off', () => {
  const face = () => 9.2;
  const pts = cellOutline(0, 29, 1, face);
  const ys = pts.map((p) => -p[1]);
  assert.ok(Math.min(...ys) > 9.2 && Math.max(...ys) < 9.2 + UM.hep, 'inside the plate');
  assert.ok(Math.min(...ys) < 9.2 + 1 && Math.max(...ys) > 9.2 + UM.hep - 1, 'and fills it');
});

test('on, the traffic is fixed to the tissue (a camera move never slides it); off, the flat view lays its stretch for the screen again', () => {
  const { flat, s3 } = scene();
  const F = flat as unknown as { VW: { vis: [number, number] }; screen: unknown };
  flat.setScreen(8, 390, 390, 12);
  const before = [...F.VW.vis];
  s3.pinTraffic(true);
  assert.deepEqual(F.VW.vis, [-130, 130]);
  flat.setScreen(8, 390, 390, 30); s3.pinTraffic(true);   // (a pan: the screen's stretch moves, the traffic's does not)
  assert.deepEqual(F.VW.vis, [-130, 130]);
  s3.pinTraffic(false);
  assert.equal(F.screen, null);
  flat.setScreen(8, 390, 390, 12);
  assert.deepEqual(F.VW.vis, before);
});

test('every streaked stream carries its place across (aux) on every vertex', () => {
  const { s3 } = scene();
  s3.update(true);
  for (const n of ['sinusoid3d/lumen', 'sinusoid3d/lumen-beyond', 'sinusoid3d/disse']) {
    const m = meshes(s3.group).find((x) => x.name === n)!;
    const aux = m.geometry.getAttribute('aux'), pos = m.geometry.getAttribute('position');
    assert.ok(aux && aux.count === pos!.count, `${n}: aux on every vertex`);
  }
});
