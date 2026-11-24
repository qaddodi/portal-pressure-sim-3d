// Writes src/scene/anatomy/placed-organs.generated.ts: what the cameras and the organ names need to know about the APPROVED organ placement (docs/approved/anatomy-placement.md,
// frozen round 16), measured once from its own data so the app never ships the 1 MB of vertices: each organ's 3D bounds, its front silhouette (the rings a name keeps on or off, in the
// 2D figure's world units, as organ-screen.ts reads them) and where each organ's name stands (a point inside its silhouette nearest the old anchor, on the organ's front face).
// Inputs: art/anatomy-placement/organsA.json (the re-inflated organ vertices), the gut's centrelines and the caudate (placement.generated.ts), the old names (organ2d/*.copied.js).
// Usage: node scripts/gen-placed-organs.mjs [--check]   (--check writes nothing and fails when the file would change; tests/anatomy-placed-frames.test.ts runs it)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLACED_GUT, PLACED_CAUDATE } from '../src/scene/anatomy/placement.generated.ts';
import { ORGANS, ORGAN_LABELS } from '../src/scene/labels/organ2d/outlines.copied.js';
import { NAME_ORGAN } from '../src/scene/labels/organ2d/organ-names.copied.js';
import { flattenPath } from '../src/scene/labels/organ2d/flatten.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/scene/anatomy/placed-organs.generated.ts`;
const A = JSON.parse(readFileSync(`${root}art/anatomy-placement/organsA.json`, 'utf8'));

/** Where the oesophagus (part of the stomach's mesh in the placement) meets the stomach: its tube is all that stands above this height (measured: x 0.24 to 0.34 above it). */
const CARDIA_Y = 1.05;
/** The plate's top (the 2D figure's y 0): an organ part's box stops there, as the 2D organ boxes do (the oesophagus runs on into the neck above it). */
const PLATE_TOP = 556 / 300;
const ptsOf = (flat, keep = () => true) => { const out = []; for (let i = 0; i < flat.length; i += 3) { const p = [flat[i], flat[i + 1], flat[i + 2]]; if (keep(p)) out.push(p); } return out; };
/** A tube as points on its surface: every centreline step's ring (x, y, z, r), every ~0.01. */
function tubePts(line, grow = 1) {
  const out = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.01));
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u, r = (a[3] + (b[3] - a[3]) * u) * grow;
      for (let j = 0; j < 16; j++) { const t = (j / 16) * Math.PI * 2; out.push([x + r * Math.cos(t), y + r * Math.sin(t), z], [x, y, z + r], [x, y, z - r], [x + r * Math.cos(t) * 0.5, y + r * Math.sin(t) * 0.5, z + r * 0.85]); }
    }
  }
  return out;
}
const pack = [];   // (the packed small bowel: loop centrelines, one list; a jump between two loops is not a tube)
{ let cur = []; for (const p of PLACED_GUT.pack) { const q = cur[cur.length - 1]; if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.08) { pack.push(cur); cur = []; } cur.push(p); } if (cur.length) pack.push(cur); }
const colon = PLACED_GUT.colon, HAUSTRA = 1 + PLACED_GUT.haustra;
/** The rectum: the colon's last stretch, below the sigmoid's turn (y under -1.2). */
const RECTUM_FROM = colon.findIndex((p, i) => i > colon.length / 2 && p[1] < -1.2) - 1;
const cau = PLACED_CAUDATE;
const caudatePts = []; for (let i = 0; i < 24; i++) for (let j = 0; j <= 12; j++) { const t = (i / 24) * Math.PI * 2, f = (j / 12) * Math.PI; caudatePts.push([cau.c[0] + cau.ax[0] * Math.sin(f) * Math.cos(t), cau.c[1] + cau.ax[1] * Math.cos(f), cau.c[2] + cau.ax[2] * Math.sin(f) * Math.sin(t)]); }

/** Every placed part a camera can name, as surface points (scene units). */
const PARTS = {
  liver: ptsOf(A.liver), spleen: ptsOf(A.spleen), 'kidney-l': ptsOf(A['kidney-l']), heart: ptsOf(A.heart), 'heart-ra': ptsOf(A['heart-ra']),
  stomach: ptsOf(A.stomach, (p) => p[1] < CARDIA_Y), esophagus: ptsOf(A.stomach, (p) => p[1] >= CARDIA_Y && p[1] <= PLATE_TOP),
  /** the whole oesophagus, to the neck (its silhouette) */
  'esophagus-all': ptsOf(A.stomach, (p) => p[1] >= CARDIA_Y),
  /** the gastro-oesophageal junction: the cardia and the oesophagus's last few centimetres */
  gej: ptsOf(A.stomach, (p) => p[1] >= CARDIA_Y - 0.2 && p[1] <= CARDIA_Y + 0.3 && p[0] < 0.5),
  duodenum: tubePts(PLACED_GUT.upper), bowel: [...pack.flatMap((l) => tubePts(l)), ...tubePts(PLACED_GUT.ileum)], colon: tubePts(colon, HAUSTRA), rectum: tubePts(colon.slice(RECTUM_FROM), HAUSTRA),
  caudate: caudatePts,
};
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const boxOf = (pts) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return [...lo, ...hi].map(r4); };

// ---- front silhouettes: the points on a grid of H, closed (dilate, fill, erode), traced, simplified ----
const H = 0.01;
function silhouette(pts) {
  const b = boxOf(pts), pad = 6, x0 = b[0] - pad * H, y0 = b[1] - pad * H, W = Math.ceil((b[3] - b[0]) / H) + 2 * pad + 1, Hh = Math.ceil((b[4] - b[1]) / H) + 2 * pad + 1;
  let g = new Uint8Array(W * Hh);
  for (const p of pts) g[Math.round((p[1] - y0) / H) * W + Math.round((p[0] - x0) / H)] = 1;
  const morph = (src, on, R) => { const out = new Uint8Array(W * Hh); for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { let hit = !on; for (let dy = -R; dy <= R && hit !== on; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; const xx = x + dx, yy = y + dy; const v = xx >= 0 && yy >= 0 && xx < W && yy < Hh ? src[yy * W + xx] : 0; if (on ? v : !v) { hit = on; break; } } out[y * W + x] = hit ? 1 : 0; } return out; };
  g = morph(g, true, 2);
  // fill holes: what the outside cannot reach is inside
  const outside = new Uint8Array(W * Hh), st = [0];
  outside[0] = 1;
  while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue; const j = yy * W + xx; if (!outside[j] && !g[j]) { outside[j] = 1; st.push(j); } } }
  for (let i = 0; i < g.length; i++) g[i] = outside[i] ? 0 : 1;
  g = morph(g, false, 2);
  // trace each blob's outer boundary (Moore neighbour tracing on the filled cells), keep the rings worth a name
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < Hh ? g[y * W + x] : 0);
  const label = new Int32Array(W * Hh), rings = [];
  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let blobs = 0;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y) || label[y * W + x]) continue;
    const id = ++blobs, st = [y * W + x]; label[y * W + x] = id;   // (label the blob, so it is traced once)
    while (st.length) { const i = st.pop(), cx = i % W, cy = (i - cx) / W; for (const [dx, dy] of N8) { const xx = cx + dx, yy = cy + dy; if (at(xx, yy) && !label[yy * W + xx]) { label[yy * W + xx] = id; st.push(yy * W + xx); } } }
    // (x, y) is the blob's first cell in scan order, so (x - 1, y) is outside: walk clockwise from there
    const ring = [[x, y]]; let cx = x, cy = y, back = 4, guard = 0;
    for (;;) {
      let k = 0, found = false;
      for (; k < 8; k++) { const d = (back + 1 + k) % 8, xx = cx + N8[d][0], yy = cy + N8[d][1]; if (at(xx, yy)) { back = (d + 4) % 8; cx = xx; cy = yy; found = true; break; } }
      if (!found || (cx === x && cy === y) || ++guard > 1e6) break;
      ring.push([cx, cy]);
    }
    let area = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    if (Math.abs(area) * H * H / 2 > 0.002) rings.push(ring.map(([u, v]) => [x0 + u * H, y0 + v * H]));
  }
  return rings.map((r) => simplify(r, 0.004));
}
function simplify(pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i], [ax, ay] = pts[a], [bx, by] = pts[b], ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey) || 1, d = Math.abs((px - ax) * ey - (py - ay) * ex) / L; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const to2 = ([x, y]) => [Math.round((x * 300 + 700) * 10) / 10, Math.round((556 - y * 300) * 10) / 10];
const RING_OF = { esophagus: 'esophagus-all', heart: ['heart', 'heart-ra'], bowel: 'bowel', colon: 'colon', 'kidney-l': 'kidney-l', spleen: 'spleen', stomach: 'stomach', liver: 'liver' };
const RINGS = {};
for (const [id, parts] of Object.entries(RING_OF)) RINGS[id] = silhouette([parts].flat().flatMap((p) => PARTS[p])).map((r) => r.map(to2));

// ---- the names: a point inside the placed silhouette nearest where the old anchor lands when the organ's box moves (or, for a name that stands beside its organ, the old anchor's offset kept) ----
const inRing = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const inside = (rings, x, y) => rings.reduce((n, P) => n + (inRing(x, y, P) ? 1 : 0), 0) % 2 === 1;
const away = (rings, x, y) => { let d = Infinity; for (const P of rings) for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1))); d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t)); } return d; };
const oldRings = (id) => { const o = ORGANS.find((q) => q.id === id); return o ? flattenPath(o.ring ?? o.d, 2).map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]])).filter((r) => r.length > 2) : []; };
const ringBox = (rings) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; };
/** How deep inside its organ a name's anchor stands at least (2D units), where the organ is thick enough: a name on the rim reads as the next organ's. */
const INSET = 24;
const NAMES = {};
for (const [word, ax, ay] of ORGAN_LABELS) {
  const id = NAME_ORGAN[word], was = oldRings(id), now = RINGS[id];
  if (!now?.length) throw new Error(`no placed silhouette for ${word}`);
  const bw = ringBox(was), bn = ringBox(now);
  const mx = bn[0] + ((ax - bw[0]) / (bw[2] - bw[0])) * (bn[2] - bn[0]), my = bn[1] + ((ay - bw[1]) / (bw[3] - bw[1])) * (bn[3] - bn[1]);
  const own = inside(was, ax, ay);
  let best = [mx, my], bd = Infinity;
  if (own) {
    // the nearest grid point inside the silhouette, as deep as the organ allows (up to INSET)
    let deepest = 0; for (let x = bn[0]; x <= bn[2]; x += 4) for (let y = bn[1]; y <= bn[3]; y += 4) if (inside(now, x, y)) deepest = Math.max(deepest, away(now, x, y));
    const want = Math.min(INSET, deepest * 0.6);
    for (let x = bn[0]; x <= bn[2]; x += 2) for (let y = bn[1]; y <= bn[3]; y += 2) { if (!inside(now, x, y) || away(now, x, y) < want) continue; const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = [x, y]; } }
  } else {
    // beside its organ: the old anchor's offset from the nearest point of the old outline, carried to the placed outline's point that lands where that one does (box to box)
    let q = null, qd = Infinity;
    for (const r of was) for (const p of r) { const d = Math.hypot(p[0] - ax, p[1] - ay); if (d < qd) { qd = d; q = p; } }
    const lx = bn[0] + ((q[0] - bw[0]) / (bw[2] - bw[0])) * (bn[2] - bn[0]), ly = bn[1] + ((q[1] - bw[1]) / (bw[3] - bw[1])) * (bn[3] - bn[1]);
    let qn = null; qd = Infinity;
    for (const r of now) for (const p of r) { const d = Math.hypot(p[0] - lx, p[1] - ly); if (d < qd) { qd = d; qn = p; } }
    const tx = qn[0] + ax - q[0], ty = qn[1] + ay - q[1], gap = away(was, ax, ay);
    best = [tx, ty];
    for (let x = tx - 120; x <= tx + 120; x += 2) for (let y = ty - 120; y <= ty + 120; y += 2) { if (inside(now, x, y) || Math.abs(away(now, x, y) - gap) > 3) continue; const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = [x, y]; } }
  }
  // the depth of the organ's front face at the name (the nearest surface points' front)
  const sx = (best[0] - 700) / 300, sy = (556 - best[1]) / 300, parts = [RING_OF[id]].flat();
  let z = -Infinity, dmin = Infinity, zn = 0;
  for (const p of parts.flatMap((q) => PARTS[q])) { const d = Math.hypot(p[0] - sx, p[1] - sy); if (d < 0.03) z = Math.max(z, p[2]); if (d < dmin) { dmin = d; zn = p[2]; } }
  NAMES[word] = [Math.round(best[0]), Math.round(best[1]), r4(Number.isFinite(z) ? z : zn)];
}

const BOXES = Object.fromEntries(Object.entries(PARTS).filter(([k]) => k !== 'esophagus-all').map(([k, p]) => [k, boxOf(p)]));
const text = `// GENERATED by scripts/gen-placed-organs.mjs from the approved placement (art/anatomy-placement/organsA.json, the gut and the caudate of placement.generated.ts). Do not edit; run the script again.
// BOX: each placed organ part's bounds [x0, y0, z0, x1, y1, z1] in scene units (the stomach below the cardia at y ${CARDIA_Y}, the oesophagus above it to the plate's top; gej the cardia and the oesophagus's foot; the gut's tubes with their radii).
// RINGS: each organ's front silhouette as rings of [x, y] in the 2D figure's world units (the frame of organ-screen.ts). NAMES: where each organ's name stands, [x, y] in 2D world units and its front depth z.
export const PLACED_ORGAN_BOX: Readonly<Record<string, readonly [number, number, number, number, number, number]>> = ${JSON.stringify(BOXES)};
export const PLACED_ORGAN_RINGS: Readonly<Record<string, readonly (readonly [number, number])[][]>> = ${JSON.stringify(RINGS)};
export const PLACED_ORGAN_NAMES: Readonly<Record<string, readonly [number, number, number]>> = ${JSON.stringify(NAMES)};
`;
const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
if (process.argv.includes('--check')) { if (!same) { console.error('gen-placed-organs: src/scene/anatomy/placed-organs.generated.ts is out of date: run node scripts/gen-placed-organs.mjs'); process.exit(1); } }
else if (!same) { writeFileSync(OUT, text); console.log(`wrote ${OUT.slice(root.length)} (${text.length} bytes)`); }
else console.log('placed-organs.generated.ts is current');
