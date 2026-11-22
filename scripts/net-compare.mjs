#!/usr/bin/env node
// WP4's node renders (no browser, no GPU): the body's vessels as TODAY draws them (the tubes and the junction skins, rest pose) beside what ?geom=net draws (the network meshes, deformed at the app's rest state by the CPU twin of the vertex stage, tests/net-oracle.ts
// deformLive + junctionPose), from the same front camera, in the same software rasteriser and the same flat cel bands, each picture labelled. The GLSL itself has never run: this is its oracle, not the screen.
//   node scripts/net-compare.mjs --out <dir> [--only CONF,IVCI,...]      (needs public/anatomy/net-*.bin: node scripts/bake-skins.mjs --net, and for the skins public/anatomy/skins.bin: node scripts/bake-skins.mjs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png-lite.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const out = arg('out', null);
if (!out) { console.error('usage: node scripts/net-compare.mjs --out <dir> [--only CONF,IVCI]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const { loadNetFromDisk } = await import('../src/scene/vessels/net/load.ts');
const { vertexEdges } = await import('../src/scene/vessels/net/network-object.ts');
const { regionsOf } = await import('../src/scene/vessels/net/regions.ts');
const { deformLive, junctionPose, liveStates } = await import('../tests/net-oracle.ts');
const { CelScene } = await import('../src/scene/scene.ts');
const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');

const data = loadNetFromDisk();
if (!data) { console.error('no baked network meshes: node scripts/bake-skins.mjs --net'); process.exit(1); }
const skel = data.skel, live = liveStates(skel)[0][1];
const TONE = { portal: [74, 120, 196], sys: [64, 150, 150], artery: [200, 70, 64] };

// ---- the two figures as triangle lists: { pos, index, colour(tri) } ----
const net = [];
for (const n of data.nets) {
  const d = deformLive(n.mesh, skel, live), regions = n.nodes.length ? regionsOf(skel, n.nodes) : [];
  const pos = regions.length ? junctionPose(n.mesh, skel, regions, live).position : d.position, ve = vertexEdges(skel, n.mesh);
  net.push({ pos, index: n.mesh.index, colour: (t) => TONE[skel.edges[ve[n.mesh.index[3 * t]]].tone] ?? TONE.portal });
}
const scene = new CelScene();
const today = [];
for (const o of scene.vessels) {
  const g = o.toonMesh.geometry, id = o.edge?.id, tone = NETWORK_BY_ID.get(id)?.tone ?? 'portal';
  if (!o.group.visible) continue;
  today.push({ pos: g.getAttribute('position').array, index: g.getIndex().array, colour: () => TONE[tone] });
}
let skins = 0;
scene.body.traverse((c) => { if (c.isMesh && c.material?.name === 'skin' && c.geometry?.getIndex()) { skins++; today.push({ pos: c.geometry.getAttribute('position').array, index: c.geometry.getIndex().array, colour: () => [150, 120, 190] }); } });
console.log(`today: ${scene.vessels.length} tubes and ${skins} skin meshes; net: ${data.nets.length} networks`);

// ---- a z-buffered front view (x right, y up, z toward the viewer: the app's body camera) ----
const FONT = { A: '01110100011000111111100011000110001', B: '11110100011111010001100011000111110', C: '01111100001000010000100001000001111', D: '11110100011000110001100011000111110', E: '11111100001111010000100001000011111', F: '11111100001111010000100001000010000', G: '01111100001000010111100011000101111', H: '10001100011111110001100011000110001', I: '01110001000010000100001000010001110', J: '00111000100001000010000110001001110', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111', M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000', Q: '01110100011000110101100100111101111', R: '11110100011000111110101001001010001', S: '01111100000111000001000001000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011101110001', X: '10001010100010000100010101000110001', Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111', 3: '11110000010000101110000010000111110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000001000111110', 6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100', ' ': '0'.repeat(35), '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100', ',': '00000000000000000000000000110000100', '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '/': '00001000010001000100010001000010000', ':': '00000011000110000000011000110000000', '=': '00000000001111100000111110000000000', '+': '00000001000010011111001000010000000' };
function text(img, w, x0, y0, s, scale = 2, col = [30, 30, 30]) {
  for (const ch of s.toUpperCase()) { const g = FONT[ch] ?? FONT[' ']; for (let i = 0; i < 35; i++) if (g[i] === '1') for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const px = x0 + (i % 5) * scale + dx, py = y0 + Math.floor(i / 5) * scale + dy, o = (px + py * w) * 4; if (px >= 0 && px < w && o + 2 < img.length) { img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; } } x0 += 6 * scale; }
}
function render(lists, w, h, cx, cy, half) {
  const img = new Uint8ClampedArray(w * h * 4), zb = new Float32Array(w * h).fill(-Infinity);
  for (let i = 0; i < w * h; i++) { img[4 * i] = 245; img[4 * i + 1] = 243; img[4 * i + 2] = 238; img[4 * i + 3] = 255; }
  const s = Math.min(w, h) / (2 * half);
  for (const { pos, index, colour } of lists) {
    const V = pos.length / 3, sx = new Float32Array(V), sy = new Float32Array(V);
    for (let v = 0; v < V; v++) { sx[v] = w / 2 + (pos[3 * v] - cx) * s; sy[v] = h / 2 - (pos[3 * v + 1] - cy) * s; }
    for (let t = 0; t < index.length; t += 3) {
      const A = index[t], B = index[t + 1], C = index[t + 2];
      const x0 = Math.min(sx[A], sx[B], sx[C]), x1 = Math.max(sx[A], sx[B], sx[C]), y0 = Math.min(sy[A], sy[B], sy[C]), y1 = Math.max(sy[A], sy[B], sy[C]);
      if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
      const ux = pos[3 * B] - pos[3 * A], uy = pos[3 * B + 1] - pos[3 * A + 1], uz = pos[3 * B + 2] - pos[3 * A + 2], vx = pos[3 * C] - pos[3 * A], vy = pos[3 * C + 1] - pos[3 * A + 1], vz = pos[3 * C + 2] - pos[3 * A + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const lam = Math.max(0, (nx * 0.35 - ny * 0.5 + nz * 0.8) / nl / Math.hypot(0.35, 0.5, 0.8)), f = 0.45 + 0.55 * (Math.floor(lam * 4) / 4), c = colour(t / 3);
      const den = (sy[B] - sy[C]) * (sx[A] - sx[C]) + (sx[C] - sx[B]) * (sy[A] - sy[C]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x++) {
        const l1 = ((sy[B] - sy[C]) * (x + 0.5 - sx[C]) + (sx[C] - sx[B]) * (y + 0.5 - sy[C])) / den, l2 = ((sy[C] - sy[A]) * (x + 0.5 - sx[C]) + (sx[A] - sx[C]) * (y + 0.5 - sy[C])) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * pos[3 * A + 2] + l2 * pos[3 * B + 2] + l3 * pos[3 * C + 2], o = x + y * w;
        if (z > zb[o]) { zb[o] = z; img[4 * o] = c[0] * f; img[4 * o + 1] = c[1] * f; img[4 * o + 2] = c[2] * f; }
      }
    }
  }
  return img;
}
// the figure's box
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
for (const l of net) for (let v = 0; v < l.pos.length; v += 3) { lo = [Math.min(lo[0], l.pos[v]), Math.min(lo[1], l.pos[v + 1])]; hi = [Math.max(hi[0], l.pos[v]), Math.max(hi[1], l.pos[v + 1])]; }
const shots = [{ name: 'FIGURE', cx: (lo[0] + hi[0]) / 2, cy: (lo[1] + hi[1]) / 2, half: Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 2 * 1.05 }];
const only = arg('only', 'CONF,IVC_IS@RHV_IVC,IVCI,IVCS,AZY_SVC,LRV') .split(',');
for (const id of only) { const nd = skel.nodes.find((n) => n.id === id); if (nd) shots.push({ name: id, cx: nd.pos[0][0], cy: nd.pos[0][1], half: 0.09 }); else console.warn(`no node ${id}`); }
const W = 640, H = 640;
for (const s of shots) {
  const a = render(today, W, H, s.cx, s.cy, s.half), b = render(net, W, H, s.cx, s.cy, s.half), sheet = new Uint8ClampedArray((2 * W + 6) * (H + 28) * 4).fill(255);
  for (let y = 0; y < H; y++) { sheet.set(a.subarray(y * W * 4, (y + 1) * W * 4), ((y + 28) * (2 * W + 6)) * 4); sheet.set(b.subarray(y * W * 4, (y + 1) * W * 4), ((y + 28) * (2 * W + 6) + W + 6) * 4); }
  text(sheet, 2 * W + 6, 6, 6, `TODAY: TUBES + SKINS (REST)  ${s.name}`, 2); text(sheet, 2 * W + 6, W + 12, 6, `?GEOM=NET: NETWORK MESH (REST, ORACLE)`, 2);
  const file = `${out}/compare-${s.name.replace(/[^A-Za-z0-9_]/g, '_')}.png`;
  writeFileSync(file, encodePng(2 * W + 6, H + 28, sheet)); console.log(file);
}
process.exit(0);
