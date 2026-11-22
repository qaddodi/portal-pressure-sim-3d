// Renders the stomach's pool of blood without a GPU or a browser: the real stomach mesh (public/anatomy/organs.bin), rasterised front-on with a z-buffer, and the organ fragment shader's
// own arithmetic in JS (organ-shader.ts: the gradient, the volume, the inner shade, and the pool through poolShade in pool-level.ts, which mirrors the GLSL line for line). The uniforms are
// the layer's own, written by OrganLayer for a real bleed. A node picture of the arithmetic, NOT a GPU frame: say "node raster, not the GPU" when reporting it.
//   node scripts/pool-render.mjs --out /mnt/project-files/variceal-bleed/pool/pool-sheet.png [--totals 20,400,1500] [--looks light,dark] [--scale 1.6]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
(globalThis).location = { search: '', pathname: '/', hostname: 'localhost' };
const { organsReady, setOrganData, ORGAN_MESHES } = await import('../src/scene/organs/meshes.ts');
const { OrganLayer } = await import('../src/scene/organs/layer.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');
const { paletteFor } = await import('../src/scene/palette.ts');
const { bodyTargets } = await import('../src/scene/disease/targets.ts');
const { presetState } = await import('../tests/b4-presets.ts');
const { poolShade } = await import('../src/scene/organs/pool-level.ts');
const { x2d, y2d } = await import('../src/scene/frame2d.ts');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'pool-sheet.png'), totals = arg('totals', '20,400,1500').split(',').map(Number), looks = arg('looks', 'light,dark').split(','), S = Number(arg('scale', '1.6'));
const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
await organsReady;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, c, x) => { const t = clamp01((x - a) / (c - a)); return t * t * (3 - 2 * t); };
const mix = (a, c, t) => a.map((v, i) => v + (c[i] - v) * t);
const Y0 = 170, Y1 = 600, X0 = 690, X1 = 1010, W = Math.round((X1 - X0) * S), H = Math.round((Y1 - Y0) * S);

async function shot(look, total) {
  const palette = paletteFor(look);
  const layer = new OrganLayer(createShared(), { stomach: ORGAN_MESHES.stomach });
  layer.applyLook(palette);
  const t = bodyTargets((await presetState('cirr-decomp')).frame, {}, null);
  layer.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total } }, true);
  for (let i = 0; i < 150; i++) layer.update(1000 + i * 33);
  const o = layer.byId.get('stomach'), u = o.toon.uniforms, g = o.toonMesh.geometry;
  const v3 = (x) => [x.x, x.y, x.z], v4 = (x) => [x.x, x.y, x.z, x.w];
  const col = (x) => [x.r, x.g, x.b];
  const o1 = col(u.o1.value), o2 = col(u.o2.value), page = col(u.page.value), layerA = u.layer.value;
  const ogLight = v4(u.ogLight.value), ogDark = v4(u.ogDark.value), volLight = v4(u.volLight.value), volShade = v4(u.volShade.value), volGeo = v4(u.volGeo.value), steps = v3(u.shadeSteps.value);
  const box = v4(u.box.value), pa = v4(u.poolA.value), pl = v3(u.poolLand.value), pd = v3(u.poolDelta.value);
  const pos = g.getAttribute('position'), nrm = g.getAttribute('shadeN'), idx = g.index.array;
  const img = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { img[i * 3] = page[0]; img[i * 3 + 1] = page[1]; img[i * 3 + 2] = page[2]; }
  const zb = new Float32Array(W * H).fill(-1e9);
  const P = (i) => ({ x: (x2d(pos.getX(i)) - X0) * S, y: (y2d(pos.getY(i)) - Y0) * S, z: pos.getZ(i), n: [nrm.getX(i), nrm.getY(i), nrm.getZ(i)], bx: (pos.getX(i) - box[0]) / box[2], by: (box[1] - pos.getY(i)) / box[3] });
  for (let f = 0; f < idx.length; f += 3) {
    const a = P(idx[f]), c = P(idx[f + 1]), d = P(idx[f + 2]);
    const area = (c.x - a.x) * (d.y - a.y) - (d.x - a.x) * (c.y - a.y);
    if (Math.abs(area) < 1e-9) continue;
    const xs = [a.x, c.x, d.x], ys = [a.y, c.y, d.y];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((c.x - px) * (d.y - py) - (d.x - px) * (c.y - py)) / area, w1 = ((d.x - px) * (a.y - py) - (a.x - px) * (d.y - py)) / area, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a.z + w1 * c.z + w2 * d.z;
        if (z <= zb[y * W + x]) continue;
        const mixv = (k) => w0 * a[k] + w1 * c[k] + w2 * d[k];
        const n = [0, 1, 2].map((k) => w0 * a.n[k] + w1 * c.n[k] + w2 * d.n[k]);
        const nl = Math.hypot(...n) || 1, nz = n[2] / nl, turn = 1 - clamp01(nz);
        const bx = mixv('bx'), by = mixv('by');
        // --- organ-shader.ts main(), in order ---
        const tg = clamp01(((bx - 0.15) * 0.7 + by) / (0.7 * 0.7 + 1));
        let fill = mix(o1, o2, tg);
        let lay = layerA;
        if (pa[2] > 0.004) {
          const lobe = Math.exp(-Math.pow((bx - pl[0]) / Math.max(pl[1], 1e-4), 2));
          const r = poolShade(fill, layerA, { dU: (by - pa[0]) * pa[1], lobe, amount: pa[2], flow: pa[3], delta: pd, light: ogLight.slice(0, 3), aa: 1.5 });
          fill = r.fill; lay = r.layer;
        }
        const r = Math.hypot(bx - volGeo[0], by - volGeo[1]) / volGeo[2];
        fill = mix(fill, volLight.slice(0, 3), volLight[3] * (1 - clamp01(r / volGeo[3])));
        fill = mix(fill, volShade.slice(0, 3), volShade[3] * clamp01((r - u.volShadeAt.value) / (1 - u.volShadeAt.value)));
        const sl = Math.hypot(n[0], n[1]) / nl > 1e-4 ? [n[0] / Math.hypot(n[0], n[1]), n[1] / Math.hypot(n[0], n[1])] : [0, 0];
        const lowerRight = smoothstep(-0.35, 0.65, sl[0] * 0.57 + sl[1] * -0.82);
        const k = (1 - (1 - steps[0]) * (1 - steps[1]) * (1 - steps[2])) * smoothstep(0.35, 1.0, turn);
        fill = mix(fill, ogDark.slice(0, 3), ogDark[3] * k * lowerRight);
        zb[y * W + x] = z;
        const o3 = mix(page, fill, lay);
        for (let ch = 0; ch < 3; ch++) img[(y * W + x) * 3 + ch] = o3[ch];
      }
    }
  }
  const lv = (pa[0]), sy = y2d(box[1] - pa[0] * box[3]);
  return { img, level: sy, total, fill: pa[2], surfaceBox: lv };
}

const cells = [];
for (const look of looks) for (const total of totals) cells.push({ look, ...(await shot(look, total)) });
const cols = totals.length, rows = looks.length, SW = W * cols, SH = H * rows;
const sheet = Buffer.alloc(SW * SH * 3);
cells.forEach((c, n) => {
  const cx = (n % cols) * W, cy = Math.floor(n / cols) * H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) sheet[((cy + y) * SW + cx + x) * 3 + ch] = Math.round(clamp01(c.img[(y * W + x) * 3 + ch]) * 255);
});
// PNG (RGB, no filter)
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) { raw[y * (SW * 3 + 1)] = 0; sheet.copy(raw, y * (SW * 3 + 1) + 1, y * SW * 3, (y + 1) * SW * 3); }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out} (${SW}x${SH}); surfaces (2D y): ${cells.map((c) => `${c.look}/${c.total}: ${c.level.toFixed(1)}`).join(', ')}`);
