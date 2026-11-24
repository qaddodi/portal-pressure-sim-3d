// The approved placement's organs (docs/approved/anatomy-placement.md, frozen round 16): the app's own outline meshes moved and re-inflated round from their silhouette (a Poisson dome: no flat face, no creases), at their own
// depth and thickness. This is the mock's own code (round-16 page/geom.js: refineRim, poissonHeight, inflateOrgan), ported line for line so the app builds the surface he approved, with two corrections at the outline only (rimTrue: the dome meets the rim at zero height instead of a cliff; the slope read inside the organ); tests/organs-placed.test.ts holds the result
// to the frozen vertices (art/anatomy-placement/organsA.json, rounded there to 1e-3). Pure arithmetic: no three.js, no clock. Run once per organ when the organs are prepared (prepare.ts), at build time when the bake has the file.
import type { PlacedOrganA } from './placed-map.ts';

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function vertexNormalZ(pos: ArrayLike<number>, idx: ArrayLike<number>): Float32Array {
  const nz = new Float32Array(pos.length / 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]! * 3, b = idx[t + 1]! * 3, c = idx[t + 2]! * 3;
    const ex = pos[b]! - pos[a]!, ey = pos[b + 1]! - pos[a + 1]!, fx = pos[c]! - pos[a]!, fy = pos[c + 1]! - pos[a + 1]!;
    const z = ex * fy - ey * fx; nz[idx[t]!] += z; nz[idx[t + 1]!] += z; nz[idx[t + 2]!] += z;
  }
  return nz;
}

export interface Height { h: Float32Array; sample: (x: number, y: number) => number }

/** The silhouette's Poisson height (-lap h = 1, h = 0 outside) on a grid, read bicubically at each vertex (geom.js poissonHeight). sqrt(2h) is a circle's half-chord for a strip. */
export function poissonHeight(pos: ArrayLike<number>, idx: ArrayLike<number>, cell = 0.008): Height {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); y0 = Math.min(y0, pos[i + 1]!); y1 = Math.max(y1, pos[i + 1]!); }
  x0 -= 2 * cell; y0 -= 2 * cell;
  const W = Math.ceil((x1 - x0) / cell) + 3, H = Math.ceil((y1 - y0) / cell) + 3, inside = new Uint8Array(W * H);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]! * 3, b = idx[t + 1]! * 3, c = idx[t + 2]! * 3;
    const ax = pos[a]!, ay = pos[a + 1]!, bx = pos[b]!, by = pos[b + 1]!, cx = pos[c]!, cy = pos[c + 1]!;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-14) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), gx1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell)), gy1 = Math.min(H - 1, Math.ceil((Math.max(ay, by, cy) - y0) / cell));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = x0 + gx * cell, py = y0 + gy * cell;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) inside[gy * W + gx] = 1;
    }
  }
  // (Float64 like the mock's plain arrays' arithmetic is not needed: the mock's grid is a Float32Array too)
  const h = new Float32Array(W * H), q = cell * cell, om = 1.9, iters = Math.round(4 * Math.max(W, H));
  for (let it = 0; it < iters; it++) for (let gy = 1; gy < H - 1; gy++) for (let gx = 1; gx < W - 1; gx++) {
    const k = gy * W + gx; if (!inside[k]) continue;
    const g = (h[k - 1]! + h[k + 1]! + h[k - W]! + h[k + W]! + q) / 4; h[k] += om * (g - h[k]!);
  }
  for (let pass = 0; pass < 3; pass++) for (const [dx, dy] of [[1, 0], [0, W]] as const) { const c2 = h.slice(); for (let k = W + 1; k < W * H - W - 1; k++) h[k] = (c2[k - dx - dy]! + 2 * c2[k]! + c2[k + dx + dy]!) / 4; }
  const at = (X: number, Y: number) => h[Math.min(H - 1, Math.max(0, Y)) * W + Math.min(W - 1, Math.max(0, X))]!;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const sample = (px: number, py: number): number => {
    const fx = (px - x0) / cell, fy = (py - y0) / cell, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
    const row = (Y: number) => cr(at(ix - 1, Y), at(ix, Y), at(ix + 1, Y), at(ix + 2, Y), u);
    return Math.max(0, cr(row(iy - 1), row(iy), row(iy + 1), row(iy + 2), v));
  };
  const out = new Float32Array(pos.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = sample(pos[i * 3]!, pos[i * 3 + 1]!);
  return { h: out, sample };
}

/** How far in from the outline the grid's height is brought down to meet it (scene units: the Poisson grid's cell). */
export const RIM_TRUE = 0.008;
/** The height `grid` gives, made to vanish ON the outline: the grid's own zero line lies up to a cell outside the outline, so the height at the outline was a cell's worth, and with the rim pinned to the organ's mid-depth
 *  the surface dropped down a sheer cliff in its last fraction of a cell (a crease at the top of the wall, 25 to 40 degrees in the shading). Within RIM_TRUE of the outline the grid's height at the nearest outline point
 *  is taken off, fading to nothing at RIM_TRUE: the dome now meets the rim as a Poisson dome does, its height going to zero linearly, so its wall turns upright with no crease. Away from the outline nothing changes. */
function rimTrue(raw: ArrayLike<number>, idx: ArrayLike<number>, grid: (x: number, y: number) => number): (x: number, y: number) => number {
  const n = raw.length / 3, fr = new Uint8Array(n), bk = new Uint8Array(n);
  for (let k = 0; k < idx.length; k += 3) { const A = idx[k]! * 3, B = idx[k + 1]! * 3, C = idx[k + 2]! * 3; const z = (raw[B]! - raw[A]!) * (raw[C + 1]! - raw[A + 1]!) - (raw[B + 1]! - raw[A + 1]!) * (raw[C]! - raw[A]!); const m = z >= 0 ? fr : bk; m[idx[k]!] = m[idx[k + 1]!] = m[idx[k + 2]!] = 1; }
  const segs: number[] = [], seen = new Set<number>(), cells = new Map<number, number[]>(), D = RIM_TRUE, cell = (v: number) => Math.floor(v / D), ck = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
  for (let k = 0; k < idx.length; k += 3) for (let j = 0; j < 3; j++) {
    const u = idx[k + j]!, v = idx[k + ((j + 1) % 3)]!;
    if (!(fr[u] && bk[u] && fr[v] && bk[v])) continue;
    const key = u < v ? u * n + v : v * n + u; if (seen.has(key)) continue; seen.add(key);
    const s0 = segs.length / 4, ax = raw[u * 3]!, ay = raw[u * 3 + 1]!, bx = raw[v * 3]!, by = raw[v * 3 + 1]!;
    segs.push(ax, ay, bx, by);
    for (let cx = cell(Math.min(ax, bx)) - 1; cx <= cell(Math.max(ax, bx)) + 1; cx++) for (let cy = cell(Math.min(ay, by)) - 1; cy <= cell(Math.max(ay, by)) + 1; cy++) { const c = ck(cx, cy); (cells.get(c) ?? cells.set(c, []).get(c)!).push(s0); }
  }
  return (x: number, y: number): number => {
    const g = grid(x, y); if (g <= 0) return 0;
    let bd = D, qx = 0, qy = 0;
    for (const s0 of cells.get(ck(cell(x), cell(y))) ?? []) {
      const ax = segs[s0 * 4]!, ay = segs[s0 * 4 + 1]!, dx = segs[s0 * 4 + 2]! - ax, dy = segs[s0 * 4 + 3]! - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, px = ax + t * dx, py = ay + t * dy, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; qx = px; qy = py; }
    }
    return bd >= D ? g : Math.max(0, g - grid(qx, qy) * (1 - bd / D));
  };
}

/** The organ moved (p -> t, x pulled toward xs[1] by xs[0]) and re-inflated round about its depth zc (geom.js inflateOrgan): thick is its greatest front-to-back depth, back how much flatter the back is, zones add depth or make a strip round
 *  (the oesophagus). Returns the positions and the surface's own smooth normals (from the height function, not the triangles). */
export function inflateOrgan(raw: ArrayLike<number>, idx: ArrayLike<number>, P: PlacedOrganA, hc?: Height, /** the organ's thickness is set by its first this many vertices (the mock's own: a mesh refined further after them keeps the mock's surface) */ tmaxOf?: number): { pos: Float32Array; normals: Float32Array } {
  const n = raw.length / 3, out = new Float32Array(raw.length);
  const H = hc ?? poissonHeight(raw, idx), h = H.h, grid = H.sample;
  let tmax = 0; for (let i = 0; i < (tmaxOf ?? n); i++) tmax = Math.max(tmax, Math.sqrt(2 * h[i]!));
  const sample = rimTrue(raw, idx, grid);
  const nz = vertexNormalZ(raw, idx), back = P.back ?? 0.8, f = (P.thick ?? 0) / (tmax * (1 + back));
  const xs = P.xs ?? [1, 0];
  const p = P.p ?? [0, 0], t = P.t ?? p, s = [1, 1], a = 0, ca = Math.cos(a), sa = Math.sin(a);
  const F = (x: number, y: number, front: boolean, hv?: number): [number, number, number] => {
    const dx = s[0]! * (x - p[0]), dy = s[1]! * (y - p[1]);
    let X = t[0] + dx * ca - dy * sa, zc = P.zc ?? 0, ff = f, fb = f * back;
    const Y = t[1] + dx * sa + dy * ca;
    const r = Math.sqrt(2 * (hv ?? sample(x, y)));
    if (P.zones) for (const zn of P.zones) {
      const w = zn.axis === 'y' ? smooth(zn.from, zn.to, y) : smooth(zn.from, zn.to, x);
      zc += (zn.dz ?? 0) * w; X += (zn.dx ?? 0) * w;
      if (zn.round) { ff += (1 - ff) * w; fb += (1 - fb) * w; }
    }
    return [xs[1] + (X - xs[1]) * xs[0], Y, front ? zc + ff * r : zc - fb * r];
  };
  const fr = new Uint8Array(n), bk = new Uint8Array(n);
  for (let k = 0; k < idx.length; k += 3) { const A = idx[k]! * 3, B = idx[k + 1]! * 3, C = idx[k + 2]! * 3; const z = (raw[B]! - raw[A]!) * (raw[C + 1]! - raw[A + 1]!) - (raw[B + 1]! - raw[A + 1]!) * (raw[C]! - raw[A]!); const m = z >= 0 ? fr : bk; m[idx[k]!] = m[idx[k + 1]!] = m[idx[k + 2]!] = 1; }
  const nrm = new Float32Array(raw.length), e = 0.003;
  const rimN = new Map<number, Set<number>>(), inSide = new Map<number, [number, number]>();
  for (let k = 0; k < idx.length; k += 3) {
    const tt = [idx[k]!, idx[k + 1]!, idx[k + 2]!], cx = (raw[tt[0]! * 3]! + raw[tt[1]! * 3]! + raw[tt[2]! * 3]!) / 3, cy = (raw[tt[0]! * 3 + 1]! + raw[tt[1]! * 3 + 1]! + raw[tt[2]! * 3 + 1]!) / 3;
    for (let j = 0; j < 3; j++) {
      const u = tt[j]!, v = tt[(j + 1) % 3]!;
      if (fr[u] && bk[u] && fr[v] && bk[v]) { (rimN.get(u) ?? rimN.set(u, new Set()).get(u)!).add(v); (rimN.get(v) ?? rimN.set(v, new Set()).get(v)!).add(u); }
      if (fr[u] && bk[u] && !inSide.has(u)) inSide.set(u, [cx, cy]);
    }
  }
  for (let i = 0; i < n; i++) {
    const x = raw[i * 3]!, y = raw[i * 3 + 1]!, rim = !!(fr[i] && bk[i]), front = nz[i]! >= 0, q = F(x, y, front, rim ? 0 : sample(x, y));
    out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
    let N: number[];
    if (rim) {
      const nb = [...(rimN.get(i) ?? [])]; let ox: number, oy: number;
      if (nb.length >= 2) { const tx = raw[nb[1]! * 3]! - raw[nb[0]! * 3]!, ty = raw[nb[1]! * 3 + 1]! - raw[nb[0]! * 3 + 1]!; ox = ty; oy = -tx; }
      else { ox = -(sample(x + e, y) - sample(x - e, y)); oy = -(sample(x, y + e) - sample(x, y - e)); }
      const c = inSide.get(i); if (c && ox * (x - c[0]) + oy * (y - c[1]) < 0) { ox = -ox; oy = -oy; }
      N = [ox / xs[0], oy, 0];
    } else {
      const A1 = F(x + e, y, front), A0 = F(x - e, y, front), B1 = F(x, y + e, front), B0 = F(x, y - e, front);
      const u = [A1[0] - A0[0], A1[1] - A0[1], A1[2] - A0[2]], v = [B1[0] - B0[0], B1[1] - B0[1], B1[2] - B0[2]];
      N = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      if ((N[2]! < 0) === front) N = N.map((c) => -c);
    }
    const l = Math.hypot(N[0]!, N[1]!, N[2]!) || 1; nrm[i * 3] = N[0]! / l; nrm[i * 3 + 1] = N[1]! / l; nrm[i * 3 + 2] = N[2]! / l;
  }
  return { pos: out, normals: nrm };
}

/** Refines the triangles at an organ's rim `rounds` times (geom.js refineRim): each round splits every edge of a triangle that touches the rim, so the rows crowd toward the edge where the re-inflated surface turns steeply.
 *  The mock does this twice before it inflates; organsA.json's vertex order is this function's. */
export function refineRimRounds(pos: ArrayLike<number>, idx: ArrayLike<number>, rounds = 2, /** split the edges this says (its two ends in the front view) instead of every edge of a triangle that touches the rim */ where?: (ax: number, ay: number, bx: number, by: number, rimTri: boolean) => boolean): { pos: Float32Array; idx: Uint32Array } {
  const P = Array.from(pos); let I = Array.from(idx);
  for (let r = 0; r < rounds; r++) {
    const n = P.length / 3, fr = new Uint8Array(n), bk = new Uint8Array(n);
    for (let k = 0; k < I.length; k += 3) { const A = I[k]! * 3, B = I[k + 1]! * 3, C = I[k + 2]! * 3; const z = (P[B]! - P[A]!) * (P[C + 1]! - P[A + 1]!) - (P[B + 1]! - P[A + 1]!) * (P[C]! - P[A]!); const m = z >= 0 ? fr : bk; m[I[k]!] = m[I[k + 1]!] = m[I[k + 2]!] = 1; }
    const rim = (v: number) => fr[v] && bk[v], key = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a), marked = new Set<number>();
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k]!, b = I[k + 1]!, c = I[k + 2]!;
      if (where) { for (const [u, v] of [[a, b], [b, c], [c, a]] as const) if (where(P[u * 3]!, P[u * 3 + 1]!, P[v * 3]!, P[v * 3 + 1]!, !!(rim(a) || rim(b) || rim(c)))) marked.add(key(u, v)); continue; }
      if (rim(a) || rim(b) || rim(c)) { marked.add(key(a, b)); marked.add(key(b, c)); marked.add(key(c, a)); }
    }
    const mids = new Map<number, number>(), mid = (a: number, b: number): number => { const k = key(a, b); let m = mids.get(k); if (m === undefined) { m = P.length / 3; for (let j = 0; j < 3; j++) P.push((P[a * 3 + j]! + P[b * 3 + j]!) / 2); mids.set(k, m); } return m; };
    const J: number[] = [];
    for (let k = 0; k < I.length; k += 3) {
      let t = [I[k]!, I[k + 1]!, I[k + 2]!];
      const mk = [0, 1, 2].map((e) => marked.has(key(t[e]!, t[(e + 1) % 3]!)));
      const cnt = mk.filter(Boolean).length;
      if (cnt === 0) { J.push(...t); continue; }
      if (cnt === 3) { const [a, b, c] = t as [number, number, number], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); J.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
      if (cnt === 1) { const e = mk.indexOf(true); t = [t[e]!, t[(e + 1) % 3]!, t[(e + 2) % 3]!]; const [a, b, c] = t as [number, number, number], m = mid(a, b); J.push(a, m, c, m, b, c); continue; }
      const e = mk.indexOf(false); t = [t[(e + 1) % 3]!, t[(e + 2) % 3]!, t[e]!];
      const [a, b, c] = t as [number, number, number], ab = mid(a, b), bc = mid(b, c); J.push(a, ab, bc, ab, b, bc, a, bc, c);
    }
    I = J;
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I) };
}
