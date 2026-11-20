// Plan view of the Lobule's real mesh, in node (no browser, no GPU): every part's triangles rasterised top-down in render order with the material's depth write, flat colours, an outline where parts meet.
// node --experimental-strip-types scripts/lobule-plan.ts <cx> <cy> <half-width> <pixels> <out.png>   (centre and half-width in lobule radii)
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import { encodePng } from './png-lite.mjs';
import { writeFileSync } from 'node:fs';
const [cx, cy, half, W, out] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 1.05), Number(process.argv[5] ?? 1600), process.argv[6] ?? 'plan.png'];
const R = 3, l3 = new Lobule3D(new LobuleView(createShared()), createShared()); l3.buildForTest('light');
const names: Record<string, [number, number, number]> = { 'lobule3d/ground': [236, 226, 212], 'lobule3d/cells': [244, 232, 218], 'lobule3d/lymph-channels': [90, 170, 130], 'lobule3d/canaliculi': [188, 160, 40] };
const col = (n: string): [number, number, number] => names[n] ?? (/sinusoid|s0|s1|s2|cross/.test(n) ? [214, 84, 80] : /lymph|lt|lv/.test(n) ? [90, 170, 130] : /bile|bd/.test(n) ? [188, 160, 40] : /nuclei/.test(n) ? [200, 190, 200] : [170, 70, 90]);
const meshes: { name: string; ro: number; ink: boolean; dw: boolean; pos: ArrayLike<number>; idx: ArrayLike<number> | null; id: number }[] = [];
let id = 1;
for (const p of l3.partsForTest) for (const [m, ink] of [[p.toonMesh, false], [p.inkMesh, true]] as const) { if (!m) continue; const g = m.geometry; meshes.push({ name: m.name, ro: m.renderOrder, ink, dw: (m.material as { depthWrite: boolean }).depthWrite, pos: g.getAttribute('position').array, idx: g.index ? g.index.array : null, id: id++ }); }
console.log(meshes.map((m) => `${m.name}${m.ink ? '(ink)' : ''} ro=${m.ro} dw=${m.dw}`).join('\n'));
meshes.sort((a, b) => a.ro - b.ro);
const depth = new Float32Array(W * W).fill(-1e9), pid = new Int32Array(W * W), img = new Uint8Array(W * W * 4);
for (let i = 0; i < W * W; i++) { img[4 * i] = 255; img[4 * i + 1] = 255; img[4 * i + 2] = 255; img[4 * i + 3] = 255; }
const sc = W / (2 * half), sx = (x: number) => (x / R - cx) * sc + W / 2, sy = (y: number) => (-y / R - cy) * sc + W / 2;
for (const m of meshes) {
  if (m.ink) continue;   // (the ink is a hull around the body; the outline below stands in for it)
  const c = col(m.name), n = m.idx ? m.idx.length : m.pos.length / 3;
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => { const q = m.idx ? m.idx[t + k]! : t + k; return [sx(m.pos[3 * q]!), sy(m.pos[3 * q + 1]!), m.pos[3 * q + 2]!]; });
    const x0 = Math.max(0, Math.floor(Math.min(v[0]![0]!, v[1]![0]!, v[2]![0]!))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0]![0]!, v[1]![0]!, v[2]![0]!)));
    const y0 = Math.max(0, Math.floor(Math.min(v[0]![1]!, v[1]![1]!, v[2]![1]!))), y1 = Math.min(W - 1, Math.ceil(Math.max(v[0]![1]!, v[1]![1]!, v[2]![1]!)));
    const [a, b, d] = v as [number[], number[], number[]], den = (b[1]! - d[1]!) * (a[0]! - d[0]!) + (d[0]! - b[0]!) * (a[1]! - d[1]!);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, l1 = ((b[1]! - d[1]!) * (px - d[0]!) + (d[0]! - b[0]!) * (py - d[1]!)) / den, l2 = ((d[1]! - a[1]!) * (px - d[0]!) + (a[0]! - d[0]!) * (py - d[1]!)) / den, l3_ = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3_ < 0) continue;
      const z = l1 * a[2]! + l2 * b[2]! + l3_ * d[2]!, i = y * W + x;
      if (z < depth[i]! - 1e-9) continue;
      if (m.dw) depth[i] = z;
      pid[i] = m.id; img[4 * i] = c[0]; img[4 * i + 1] = c[1]; img[4 * i + 2] = c[2];
    }
  }
}
// an outline where two parts (or a part and the ground) meet, standing in for the ink
for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, p = pid[i]!; if (p && p !== pid[i + 1] && p !== pid[i + W] && meshes.find((m) => m.id === p)!.name !== 'lobule3d/cells' && meshes.find((m) => m.id === p)!.name !== 'lobule3d/ground') { img[4 * i] = 40; img[4 * i + 1] = 30; img[4 * i + 2] = 30; } }
writeFileSync(out, encodePng(W, W, img));
