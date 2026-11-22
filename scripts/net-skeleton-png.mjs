#!/usr/bin/env node
// Renders the vessel skeleton (src/scene/vessels/net/skeleton.ts) to PNGs in node: no browser, no GPU. Each picture overlays the course as the old path reads it (grey, thick: COURSES) with the skeleton's bones (coloured by edge, drawn
// at their rest radius) and its nodes (red rings), in the 2D figure's coordinates, so a move or a bend of an end is something you can see. Usage: node scripts/net-skeleton-png.mjs <outDir>
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { COURSES } from '../src/scene/circuit/course.ts';
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { UNITS_PER_SCENE, x2d, y2d } from '../src/scene/frame2d.ts';
import { sceneToMap } from '../src/scene/circuit/map.ts';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const S = skeleton();
const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const palette = [[31, 119, 180], [214, 39, 40], [44, 160, 44], [148, 103, 189], [255, 127, 14], [23, 190, 207], [140, 86, 75], [227, 119, 194], [188, 189, 34]];
function canvas(w, h) {
  const px = Buffer.alloc(w * 3 * h, 255);
  const dot = (x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (Math.floor(y) * w + Math.floor(x)) * 3; for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a); };
  const seg = (a, b, r, c, al = 1) => {
    const x0 = Math.min(a[0], b[0]) - r - 1, x1 = Math.max(a[0], b[0]) + r + 1, y0 = Math.min(a[1], b[1]) - r - 1, y1 = Math.max(a[1], b[1]) + r + 1, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, x1); x++) {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
      if (d <= r) dot(x, y, c, al);
    }
  };
  const ring = (p, r, c) => { for (let a = 0; a < 360; a += 3) dot(p[0] + r * Math.cos(a * Math.PI / 180), p[1] + r * Math.sin(a * Math.PI / 180), c); };
  return { w, h, px, seg, ring, dot };
}
// the body pose in 2D figure units (x right, y down)
const body = (p) => [x2d(p[0]), y2d(p[1])];
const bodyOld = (p) => [x2d(p.x), y2d(p.y)];
const mapPt = (p) => { const m = sceneToMap(p[0], p[1]); return m; };
const mapOld = (p) => sceneToMap(p.x, p.y);
function view(name, box, pose, ids) {
  const sc = Math.min(900 / (box[2] - box[0]), 700 / (box[3] - box[1])), W = Math.round((box[2] - box[0]) * sc), H = Math.round((box[3] - box[1]) * sc), c = canvas(W, H);
  const T = (q) => [(q[0] - box[0]) * sc, (q[1] - box[1]) * sc];
  const rScale = pose ? 1 / 0.0065 : UNITS_PER_SCENE;
  for (const [id, g] of COURSES) { if (ids && !ids.some((s) => id === s || id.startsWith(s))) continue; const P = pose ? g.C.map(mapOld) : g.A.map(bodyOld); for (let i = 1; i < P.length; i++) c.seg(T(P[i - 1]), T(P[i]), 1.5 * sc * 0 + 6, [215, 215, 215]); }
  S.edges.forEach((e, k) => {
    if (ids && !ids.some((s) => e.id === s || e.id.startsWith(s))) return;
    const col = palette[k % palette.length], bs = S.bones.slice(e.bones[0], e.bones[0] + e.bones[1]);
    for (let i = 1; i < bs.length; i++) { const a = pose ? mapPt(bs[i - 1].pos[1]) : body(bs[i - 1].pos[0]), b = pose ? mapPt(bs[i].pos[1]) : body(bs[i].pos[0]); c.seg(T(a), T(b), Math.max(1.2, bs[i].r[pose] * rScale * sc * 0.5), col, 0.45); c.seg(T(a), T(b), 0.8, col); }
  });
  for (const n of S.nodes) { if (n.edges.length < 2) continue; const p = pose ? mapPt(n.pos[1]) : body(n.pos[0]); if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3]) continue; c.ring(T(p), 5, [220, 0, 0]); c.ring(T(p), 6, [220, 0, 0]); }
  writeFileSync(`${out}/${name}.png`, png(W, H, c.px));
  console.log(name, W, H);
}
// ids: the vessels each picture is about. Grey: the course as the old path reads it; colour: the skeleton; red rings: nodes (two or more edges).
view('wp0-cava-hepatic-veins-body', [500, 150, 780, 340], 0, ['RHV', 'MHV', 'LHV', 'IVC_IS', 'IVCS_RA', 'POST_R_RHV', 'POST_L_LHV', 'POST_R_MHV', 'POST_L_MHV', 'SIN_RR', 'SIN_LL']);
view('wp0-epi-ili-body', [440, 760, 800, 1040], 0, ['EPI_ILI', 'EPI_SVC', 'ILI_IVC', 'C4', 'C3']);
view('wp0-cava-hepatic-veins-map', [940, 250, 1280, 470], 1, ['RHV', 'MHV', 'LHV', 'IVC_IS', 'IVCS_RA', 'SVC_RA']);
view('wp0-epi-ili-map', [900, 560, 1180, 760], 1, ['EPI_ILI', 'EPI_SVC', 'ILI_IVC', 'C4']);
