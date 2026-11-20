import test from 'node:test';
import assert from 'node:assert/strict';
import { type Mesh, type Object3D } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { SEED, nucAt } from '../src/scene/sinusoid/layout.ts';
import { Sinusoid3D, REACH, Z } from '../src/scene/micro3d/sinusoid3d.ts';
import { MeshBuilder, MICRO_FS } from '../src/scene/micro3d/cel3d.ts';
import {
  TROUGH_K, WALL, arcOf, buildBore, buildCut, buildNucleusSection, buildShell, cellShare, endoSwell, hangAt, innerPoint, nHat, newWeights, outerPoint, phiAt, wallColumns, type WallGeo,
} from '../src/scene/micro3d/sinusoid-wall.ts';

// Mohammad, 20 Nov 2026. (1) The endothelial cells "clip through their own body, which is the wall": each was a separate solid (a lens 2.9 µm across, 2.1 µm high) set into a strip 0.8 µm wide and 0.5 µm high.
// (2) The fenestrae are "directed upwards", not at the viewer: cylinders through the wall's thickness, cut through the middle ("kinda cut middle cylinder"), the cell's surface extended into the vessel wall
// and curved (design A1). (3) "Here also there should not be a line separating the cell from its body." These tests pin the geometry that follows: the wall is ONE shell, the cell is part of it, the
// bores run through its thickness, and nothing stands outside it or above its cut.

const G: WallGeo = { halfW: () => 5, wallIn: () => 5.8 };
const nsd = SEED.nucUp;
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

test('the lumen and the wall agree on the curve (one constant), and the arc table inverts', () => {
  assert.equal(TROUGH_K, Z.trough);
  for (const phi of [0, 0.1, 0.3, 0.62, 1.2]) assert.ok(Math.abs(phiAt(arcOf(phi)) - phi) < 2e-3, `phi ${phi}`);
  assert.ok(Math.abs(arcOf(0.001) * 5 - 5 * TROUGH_K * 0.001) < 1e-4, 'arc starts at the cut running down the depth, D per radian');
});

test('the cell swells as a raised cosine and melts into the wall: whole at the nucleus, nothing past cellHalf, never a step', () => {
  for (const sd of [SEED.nucUp, SEED.nucDn]) for (let n = -3; n <= 3; n++) {
    const x = nucAt(n, sd);
    assert.ok(Math.abs(endoSwell(x, sd) - 1) < 1e-12);
    assert.ok(endoSwell(x + WALL.cellHalf + 0.01, sd) < 1e-9 && endoSwell(x - WALL.cellHalf - 0.01, sd) < 1e-9, 'none past its footprint');
    let prev = endoSwell(x, sd), prevC = cellShare(x, WALL.cellS, sd);
    for (let d = 0.05; d <= WALL.cellHalf + 0.5; d += 0.05) {
      const v = endoSwell(x + d, sd), c = cellShare(x + d, WALL.cellS, sd);
      assert.ok(v <= prev + 1e-12 && prev - v < 0.06, `the swell eases (${(prev - v).toFixed(3)})`);
      assert.ok(prevC - c < 0.12, `the cell's colour melts into the wall's, no line (${(prevC - c).toFixed(3)} in 0.05 µm)`);
      prev = v; prevC = c;
    }
    assert.ok(cellShare(x + WALL.cellHalf * 1.01, WALL.cellS, sd) < 1e-9, 'none past its footprint');
  }
});

test('the wall is one shell: its inner surface is the lumen\'s curve, hanging in at the nucleus only; the outer face is the wall\'s thickness out along the normal', () => {
  for (const x of [20, 25.5, 31]) {   // (bare wall: no cell near)
    for (const phi of [0, 0.2, 0.5]) {
      const a = innerPoint(G, x, phi, nsd), b = outerPoint(G, x, phi);
      assert.ok(Math.abs(a[0] - 5 * Math.cos(phi)) < 1e-9 && Math.abs(a[1] + TROUGH_K * 5 * Math.sin(phi)) < 1e-9, 'inner on the ellipse');
      assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 0.8) < 1e-9, 'outer 0.8 µm out');
    }
  }
  const xn = nucAt(0, nsd), n = nHat(0, 5);
  assert.ok(Math.abs(hangAt(xn, 0, nsd) - WALL.hang) < 1e-12 && hangAt(xn, 3.3, nsd) < 1e-12);
  const hung = innerPoint(G, xn, 0, nsd);
  assert.ok(Math.abs(5 - hung[0] - WALL.hang * n[0]) < 1e-9, 'the cell hangs into the lumen along the normal');
});

test('the shell, its cut and the nucleus\'s section stay inside the wall\'s footprint, the cut at z = 0, every normal the right way', () => {
  const xs = wallColumns(-30, 30);
  const b = new MeshBuilder(), w = newWeights(); buildShell(b, w, G, xs, -1, 'in', Z.disse); buildShell(b, w, G, xs, -1, 'out', Z.disse);
  assert.equal(w.cell.length, b.count); assert.equal(b.aux.length, b.count);
  for (let i = 0; i < b.count; i++) {
    const yd = b.p[i * 3 + 1]!, z = b.p[i * 3 + 2]!;   // (side -1, the upper lining: scene y = the 2D's depth, up)
    assert.ok(yd <= 5.8 + 1e-6 && yd >= 0, 'not past the wall\'s far face, not across the axis');
    assert.ok(z <= 1e-9, 'never above the cut');
    assert.ok(Number.isFinite(b.aux[i]!) && b.aux[i]! >= 0, 'the place down the wall');
  }
  // inner vertices face the lumen (against the outward normal), outer ones away
  const nh = (y: number, z: number) => { const a = y / 25, c = z / (TROUGH_K * 5) ** 2, l = Math.hypot(a, c); return [a / l, c / l]; };
  let inN = 0, outN = 0;
  for (let i = 0; i < b.count; i += 7) {
    const y = b.p[i * 3 + 1]!, z = b.p[i * 3 + 2]!, ny = b.n[i * 3 + 1]!, nz = b.n[i * 3 + 2]!, h = nh(y, z), d = ny * h[0]! + nz * h[1]!;
    if (Math.hypot(y / 5, z / (TROUGH_K * 5)) > 1.02) { assert.ok(d > 0, 'the outer face looks away'); outN++; } else { assert.ok(d < 0.2, 'the inner face looks into the lumen'); inN++; }
  }
  assert.ok(inN > 20 && outN > 20);
  const c = new MeshBuilder(), cw = newWeights(); buildCut(c, cw, G, xs, -1);
  for (let i = 0; i < c.count; i++) { assert.equal(c.p[i * 3 + 2], 0, 'the cut lies at z = 0'); assert.ok(Math.abs(c.aux[i]!) === 1 && c.aux2[i] === 0, 'the line along its two edges'); }
  const xn = nucAt(0, nsd), nu = new MeshBuilder(); buildNucleusSection(nu, G, -1, xn);
  for (let i = 0; i < nu.count; i++) {
    const x = nu.p[i * 3]!, yd = nu.p[i * 3 + 1]!, yi = 5 - hangAt(x, 0, nsd);
    assert.ok(yd >= yi - 1e-9 && yd <= 5.8 + 1e-9, 'the nucleus\'s section lies on the cut, inside the band');
    assert.ok(Math.hypot(nu.aux[i]!, nu.aux2[i]!) <= 1 + 1e-9);
  }
});

test('a bore is a cylinder through the wall: the cut passes through the first one\'s middle (nothing above it), and every part of both lies in the wall\'s thickness', () => {
  const b = new MeshBuilder(); buildBore(b, G, -1, 20.5, 0.3);
  assert.ok(b.count > 40);
  const H = 5, TW = 0.8, phi = phiAt(WALL.s2 / H), lo = 5 * Math.cos(phi) - 0.3 - 1e-6;
  for (let i = 0; i < b.count; i++) {
    const x = b.p[i * 3]!, yd = b.p[i * 3 + 1]!, z = b.p[i * 3 + 2]!;
    assert.ok(z <= 1e-9, 'the cut\'s gutter is the lower half: nothing above z = 0');
    assert.ok(yd >= lo && yd <= H + TW + 0.3 + 1e-6, `in the wall's thickness (${yd.toFixed(2)})`);
    assert.ok(x >= 20.5 - 0.3 - 1e-9 && x <= 20.5 + WALL.dx2 + 0.3 + 1e-9);
    const len = Math.hypot(b.n[i * 3]!, b.n[i * 3 + 1]!, b.n[i * 3 + 2]!); assert.ok(Math.abs(len - 1) < 1e-6);
  }
  // (the colour runs from 1 at the lumen's end to 0.5 at Disse's: it darkens as it goes in)
  const c = b.c; assert.ok(Math.max(...c) <= 1 && Math.min(...c) >= 0.5 - 1e-9);
});

test('in the scene: the wall, its cut, the bores and the nucleus\'s section are built, finite; the old separate cell lens and dome are gone', async () => {
  const { flat, s3 } = scene();
  void flat;
  for (const n of ['endothelium', 'endothelium-cut', 'endothelium-bores', 'endothelial-nuclei']) {
    const m = part(s3, n);
    assert.ok(m, `${n} exists`);
    const pos = m.geometry.getAttribute('position')!;
    assert.ok(pos.count > 100, `${n} is built (${pos.count})`);
    for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]!));
  }
  assert.ok(!meshes(s3.group).some((m) => m.name === 'sinusoid3d/endothelial-cells'), 'no separate cell solid');
  for (const n of ['endothelium', 'endothelium-cut']) assert.equal(part(s3, n).geometry.getAttribute('color')!.count, part(s3, n).geometry.getAttribute('position')!.count, `${n} is painted per vertex`);
  // no bore pokes above the cut, and none past the scene's reach
  const bores = part(s3, 'endothelium-bores').geometry.getAttribute('position')!;
  for (let i = 0; i < bores.count; i++) { assert.ok(bores.getZ(i) <= 1e-6); assert.ok(Math.abs(bores.getX(i)) <= REACH + 1); }
  // the wall's materials: the shell's second bore is a round hole (HOLES), the cut's gaps full-width slots (GAPS)
  assert.ok((part(s3, 'endothelium').material as { defines: Record<string, string> }).defines.HOLES !== undefined);
  assert.ok((part(s3, 'endothelium-cut').material as { defines: Record<string, string> }).defines.GAPS !== undefined);
  assert.match(MICRO_FS, /float holeCut\(\)/);
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  assert.ok(!/mk\('endothelial-cells'/.test(src) && !/surfacePatch/.test(src), 'the cell is not a separate solid');
});
