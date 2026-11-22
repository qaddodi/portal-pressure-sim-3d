#!/usr/bin/env node
// Node-only renders of the network mesher's output (no browser, no GPU: a z-buffered software rasteriser, flat shading, the junction fillets tinted and the triangle edges drawn), for the owner's rule that geometry is judged from node renders.
//   node scripts/net-render.mjs --out <dir> [--only Y,T,...] [--skeleton]   (--skeleton: the real skeleton of net/skeleton.ts when it exists, every junction listed in --nodes CONF,IVCI,... or all)
// One PNG per fixture or node: the rest pose (body) on the left, the map pose on the right, each from an oblique view, with a tinted fillet and its wire. Keep the output outside the repo.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { encodePng } from './png-lite.mjs';
const { buildNetMesh } = await import('../src/scene/vessels/net/mesh.ts');
const { fixtures, deform } = await import('../tests/net-lib.ts');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const out = arg('out', null);
if (!out) { console.error('usage: node scripts/net-render.mjs --out <dir> [--only Y,T] [--skeleton] [--nodes CONF,IVCI]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const only = arg('only', '') ? String(arg('only', '')).split(',') : null;

/** Rasterise `index` over `pos` (xyz floats) at the view (azimuth, elevation in degrees) into a w x h RGBA buffer. `tint[t]` 1: a fillet triangle. */
function raster(pos, index, tint, w, h, az, el, centre, radius, wire) {
  const img = new Uint8ClampedArray(w * h * 4), zb = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) { img[4 * i] = 245; img[4 * i + 1] = 243; img[4 * i + 2] = 238; img[4 * i + 3] = 255; }
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
  const V = pos.length / 3, sx = new Float32Array(V), sy = new Float32Array(V), sz = new Float32Array(V), scale = Math.min(w, h) / (2.1 * radius);
  for (let v = 0; v < V; v++) {
    const x = pos[3 * v] - centre[0], y = pos[3 * v + 1] - centre[1], z = pos[3 * v + 2] - centre[2];
    const x1 = x * ca + y * sa, y1 = -x * sa + y * ca, y2 = y1 * ce + z * se, z2 = -y1 * se + z * ce;   // (z2 toward the viewer)
    sx[v] = w / 2 + x1 * scale; sy[v] = h / 2 - z2 * scale; sz[v] = -y2;
  }
  const L = [0.35, -0.5, 0.8], ll = Math.hypot(...L);
  const edge = (x0, y0, x1, y1, col) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))); for (let s = 0; s <= n; s++) { const px = Math.round(x0 + ((x1 - x0) * s) / (n || 1)), py = Math.round(y0 + ((y1 - y0) * s) / (n || 1)); if (px >= 0 && py >= 0 && px < w && py < h) { const o = 4 * (px + py * w); img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; } } };
  const fill = [];
  for (let t = 0; t < index.length; t += 3) {
    const A = index[t], B = index[t + 1], C = index[t + 2];
    const ux = pos[3 * B] - pos[3 * A], uy = pos[3 * B + 1] - pos[3 * A + 1], uz = pos[3 * B + 2] - pos[3 * A + 2], vx = pos[3 * C] - pos[3 * A], vy = pos[3 * C + 1] - pos[3 * A + 1], vz = pos[3 * C + 2] - pos[3 * A + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // the light is fixed to the camera
    const lx = L[0] * ca - L[1] * sa, ly = L[0] * sa + L[1] * ca;
    const lam = Math.max(0, (nx * lx + ny * ly + nz * L[2]) / ll), band = Math.floor(lam * 4) / 4;   // (a few flat bands, as the cel look has)
    const f = 0.42 + 0.58 * band, col = tint[t / 3] ? [214 * f + 30, 96 * f + 20, 70 * f + 10] : [88 * f + 60, 118 * f + 50, 196 * f + 20];
    const minx = Math.max(0, Math.floor(Math.min(sx[A], sx[B], sx[C]))), maxx = Math.min(w - 1, Math.ceil(Math.max(sx[A], sx[B], sx[C]))), miny = Math.max(0, Math.floor(Math.min(sy[A], sy[B], sy[C]))), maxy = Math.min(h - 1, Math.ceil(Math.max(sy[A], sy[B], sy[C])));
    const den = (sy[B] - sy[C]) * (sx[A] - sx[C]) + (sx[C] - sx[B]) * (sy[A] - sy[C]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const l1 = ((sy[B] - sy[C]) * (x + 0.5 - sx[C]) + (sx[C] - sx[B]) * (y + 0.5 - sy[C])) / den, l2 = ((sy[C] - sy[A]) * (x + 0.5 - sx[C]) + (sx[A] - sx[C]) * (y + 0.5 - sy[C])) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * sz[A] + l2 * sz[B] + l3 * sz[C], o = x + y * w;
      if (z < zb[o]) { zb[o] = z; img[4 * o] = col[0]; img[4 * o + 1] = col[1]; img[4 * o + 2] = col[2]; }
    }
    if (wire && tint[t / 3]) fill.push(t);
  }
  // the fillet's wire, over the shaded picture, only where it is the nearest surface (depth test with a small bias)
  for (const t of fill) for (let s = 0; s < 3; s++) { const p = index[t + s], q = index[t + (s + 1) % 3]; edge(sx[p], sy[p], sx[q], sy[q], [40, 20, 20]); }
  return img;
}

function sheet(name, mesh, skel, report, focus) {
  const T = mesh.index.length / 3, tint = new Uint8Array(T);
  for (const n of report.nodes) if (n.kind === 'junction') for (let t = n.triStart; t < n.triStart + n.triCount; t++) tint[t] = 1;
  const W = 520, H = 520, views = [[0, 0, deform(mesh, skel, 0)], [1, 0, deform(mesh, skel, 1)]];
  const img = new Uint8ClampedArray(W * 2 * H * 4);
  views.forEach(([pose, , p], k) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < p.length / 3; v++) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p[3 * v + d]); hi[d] = Math.max(hi[d], p[3 * v + d]); }
    const c = focus ? focus.pos[pose] : lo.map((x, d) => (x + hi[d]) / 2), r = focus ? focus.radius[pose] : Math.hypot(...hi.map((x, d) => x - lo[d])) / 2;
    const tile = raster(p, mesh.index, tint, W, H, 20, 50, c, r, !process.argv.includes('--nowire'));
    for (let y = 0; y < H; y++) img.set(tile.subarray(y * W * 4, (y + 1) * W * 4), (y * W * 2 + k * W) * 4);
  });
  const file = `${out}/net-${name}.png`;
  writeFileSync(file, encodePng(W * 2, H, img));
  console.log(`${file}: ${mesh.position.length / 3} vertices, ${T} triangles (rest | map pose)`);
}

if (process.argv.includes('--skeleton')) {
  // WP0's skeleton, when it has landed: net/skeleton.ts exports `skeleton()`. One image per junction node of the figure (the whole figure is too small to judge a joint).
  const f = '../src/scene/vessels/net/skeleton.ts';
  if (!existsSync(new URL(f, import.meta.url))) { console.error('net/skeleton.ts is not in this checkout yet (WP0)'); process.exit(1); }
  const { skeleton } = await import(f);
  const skel = skeleton(), want = arg('nodes', '') ? String(arg('nodes', '')).split(',') : null;
  const t0 = Date.now(), r = buildNetMesh(skel);
  console.log(`figure: ${r.report.vertices} vertices, ${r.report.triangles} triangles, ${Date.now() - t0} ms`);
  for (const nd of skel.nodes) if (!want || want.includes(nd.id)) {
    // the whole figure's mesh, the camera on the node: the joint at eight times its widest arm's radius
    const rad = Math.max(...nd.edges.map((x) => { const e = skel.edges[x.edge]; return skel.bones[x.end === 0 ? e.bones[0] : e.bones[0] + e.bones[1] - 1].r; }).flatMap((r) => r)) * 8;
    sheet(nd.id, r.mesh, skel, r, { pos: nd.pos, radius: [rad, rad] });
  }
} else {
  for (const fx of fixtures()) if (!only || only.includes(fx.name)) {
    const r = buildNetMesh(fx.skel);
    sheet(fx.name, r.mesh, fx.skel, r);
    for (const id of fx.junctions) { const nd = fx.skel.nodes.find((n) => n.id === id), rad = 7 * Math.max(...nd.edges.map((x) => { const e = fx.skel.edges[x.edge]; return fx.skel.bones[x.end === 0 ? e.bones[0] : e.bones[0] + e.bones[1] - 1].r[0]; })); sheet(`${fx.name}-${id}`, r.mesh, fx.skel, r, { pos: nd.pos, radius: [rad, rad * 1.2] }); }
  }
}
