import test from 'node:test';
import assert from 'node:assert/strict';
import { type Mesh, type Object3D } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { SEED, nucAt } from '../src/scene/sinusoid/layout.ts';
import { ENDO, REACH, Sinusoid3D, Z, endoSwell, wallPoint } from '../src/scene/micro3d/sinusoid3d.ts';

// Mohammad, 20 Nov 2026: the endothelial cells "clip through their own body, which is the wall". Root cause: each cell was a separate solid (a lens, 2.9 µm thick across and 2.1 µm high) set into a
// wall strip only 0.8 µm wide and 0.5 µm high, so it stood out of the strip on both sides. The cell is now the wall: the lining's own surface swells at the nucleus, and the cell's outline and
// the nucleus are patches that ride on that surface. These tests pin that no part of a cell can stand outside or under the wall again.

function meshes(root: Object3D): Mesh[] { const out: Mesh[] = []; root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); }); return out; }
function scene() {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true);
  flat.update(1000); flat.update(1016);
  s3.update(true);
  return { flat, s3 };
}
const part = (s3: Sinusoid3D, name: string) => meshes(s3.group).find((m) => m.name === `sinusoid3d/${name}`)!;

test('the swell is a raised cosine: whole at the nucleus, nothing past ENDO.half, never a step', () => {
  for (const nsd of [SEED.nucUp, SEED.nucDn]) {
    for (let n = -3; n <= 3; n++) {
      const x = nucAt(n, nsd);
      assert.ok(Math.abs(endoSwell(x, nsd) - 1) < 1e-12, 'whole at the nucleus');
      assert.ok(endoSwell(x + ENDO.half, nsd) < 1e-12 && endoSwell(x - ENDO.half - 0.01, nsd) === 0, 'none at its ends');
      let prev = endoSwell(x, nsd);
      for (let d = 0.05; d <= ENDO.half; d += 0.05) {
        const v = endoSwell(x + d, nsd);
        assert.ok(v <= prev + 1e-12, 'falls away monotonically');
        assert.ok(prev - v < 0.06, `no step (${(prev - v).toFixed(3)} in 0.05 µm)`);
        prev = v;
      }
    }
  }
});

test('the wall is one surface: at the nucleus it is continuous with the bare wall either side, its Disse edge unmoved', () => {
  const { flat } = scene();
  const g = (flat as unknown as { g: Parameters<typeof wallPoint>[0] }).g;
  for (const th of [0, 0.4, Math.PI / 2, 2.5, Math.PI]) {
    let prev = wallPoint(g, -8, th, 0);
    for (let x = -8; x <= 8; x += 0.1) {
      const sw = Math.max(0, 1 - Math.abs(x) / ENDO.half) ** 2;
      const P = wallPoint(g, x, th, sw);
      assert.ok(Math.hypot(P[1] - prev[1], P[2] - prev[2]) < 0.2, 'no jump along the wall');
      prev = P;
    }
  }
  // the Disse side stays where it was (the wall thickens toward the lumen only), the crest rises by ENDO.dz and the lumen edge moves in by ENDO.dy
  assert.equal(wallPoint(g, 0, Math.PI, 1)[1], wallPoint(g, 0, Math.PI, 0)[1]);
  assert.ok(Math.abs(wallPoint(g, 0, Math.PI / 2, 1)[2] - wallPoint(g, 0, Math.PI / 2, 0)[2] - ENDO.dz) < 1e-9);
  assert.ok(Math.abs(wallPoint(g, 0, 0, 0)[1] - wallPoint(g, 0, 0, 1)[1] - ENDO.dy) < 1e-9);
});

test('no vertex of any endothelial cell or nucleus lies outside the wall\'s own footprint or under its surface', () => {
  const { flat, s3 } = scene();
  const g = (flat as unknown as { g: Parameters<typeof wallPoint>[0] }).g;
  for (const name of ['endothelial-cells', 'endothelial-nuclei']) {
    const m = part(s3, name), pos = m.geometry.getAttribute('position')!;
    assert.ok(pos.count > 500, `${name} is built`);
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const side = y > 0 ? -1 : 1, yd = -y * side;   // (the plane's y is up, 2D's is down; the upper lining is side -1)
      const nsd = side < 0 ? SEED.nucUp : SEED.nucDn, sw = endoSwell(x, nsd);
      // across: between the swollen lumen edge and Disse's side, whatever the cell, never beyond (the lens stood 0.3 µm past Disse's side and 1.8 µm into the lumen)
      const y0 = g.halfW(x) - ENDO.dy * sw, y1 = g.wallIn(x);
      assert.ok(yd >= y0 - 1e-4 && yd <= y1 + 1e-4, `${name}: across the wall at x ${x.toFixed(1)}: ${yd.toFixed(3)} not in ${y0.toFixed(3)}..${y1.toFixed(3)}`);
      // up: on the surface or above it, by no more than the patch's own lift (never under it, which is a solid clipping through the wall)
      const th = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * (yd - y0)) / (y1 - y0))));
      const surf = (Z.bead + ENDO.dz * sw) * Math.sin(th);
      assert.ok(z >= surf - 3e-3, `${name}: not under the wall (${z.toFixed(3)} vs ${surf.toFixed(3)})`);
      assert.ok(z <= surf + ENDO.cellLift + ENDO.nucLift + 0.02, `${name}: rides on the wall (${z.toFixed(3)} vs ${surf.toFixed(3)})`);
      n++;
    }
    assert.equal(n, pos.count);
  }
});

test('a cell and its nucleus end ON the wall (lift 0 at the edge), so they meet it with no step', () => {
  const { s3 } = scene();
  const cell = part(s3, 'endothelial-cells'), aux = cell.geometry.getAttribute('aux')!, aux2 = cell.geometry.getAttribute('aux2')!, pos = cell.geometry.getAttribute('position')!;
  let edge = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(aux.getX(i), aux2.getX(i));
    if (r < 0.999) continue;
    edge++;
    const x = pos.getX(i), y = pos.getY(i), side = y > 0 ? -1 : 1, sw = endoSwell(x, side < 0 ? SEED.nucUp : SEED.nucDn);
    const g = (s3 as unknown as { flat: { g: Parameters<typeof wallPoint>[0] } }).flat.g;
    const yd = -y * side, y0 = g.halfW(x) - ENDO.dy * sw, th = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * (yd - y0)) / (g.wallIn(x) - y0))));
    assert.ok(Math.abs(pos.getZ(i) - wallPoint(g, x, th, sw)[2]) < 3e-3, 'the cell\'s outline lies in the wall');
  }
  assert.ok(edge > 100, 'there is an outline');
});

test('the lining is built from the swell, and no endothelial cell is a separate solid (root cause: ellipsoid lenses set into the strip)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('// the endothelial cells:'), src.indexOf('// the Kupffer cell (its arms move'));
  assert.ok(block.includes('surfacePatch('), 'the cells ride on the wall');
  assert.ok(!block.includes('ellipsoid('), 'no solid ellipsoid for a cell or its nucleus');
  assert.match(src, /wallPoint\(g, x, th, sw\)/, 'the bead itself is the swollen wall');
  assert.ok(REACH > 0);
});
