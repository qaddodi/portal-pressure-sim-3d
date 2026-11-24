// The variceal bleed's jet, as a shape (pure: numbers in, numbers out; bleed.ts puts them on the GPU).
//
// 2D (blood.js bleedShapesInto, veins-gl.js): a thread leaves the tear, throws out toward where it lands (x = land - (land - x0) * e^(-y / 26)), thins as it falls, pinches
// into beads that slide down it (the lower it is, the more of it is beads), and lands in the pool. It is steady, it never beats (Mohammad, 6 Nov 2026). This keeps all of that
// and gives it a body: a narrow orifice that widens, a true arc under gravity (a parabola through the tear and the landing, thrown a little up first), a stream that necks
// into beads and sheds spray, a splash where it lands, and a lens of blood on the surface. The strength follows the model's bleeding rate: `spurt` (0 an ooze, 1 a fast bleed),
// the 2D's own smooth(25, 70, rate), and the thread's width from the same k as the 2D.
//
// Units are the 2D figure's (x right, y DOWN, 1400 x 1000): the layer turns them to the scene with x3 / y3. Nothing here allocates once the buffers are made.
import { x3, y3 } from '../frame2d.ts';
import { organMap } from '../editor-anchors.ts';

export const JET_SEG = 24;                       // rings along the stream (25 rings)
export const JET_RAD = 7;                        // sides of the stream
export const N_SPRAY = 10;                       // drops shed from the stream's lower half
export const N_SPLASH = 6;                       // drops thrown up where it lands
/** Blobs: the spray, the splash, the lens of blood on the pool's surface, the wet swell at the tear. */
export const N_BLOB = N_SPRAY + N_SPLASH + 2;
export const BLOB_LON = 8;                       // sides of a drop (two rings between its poles)
export const TUBE_RINGS = JET_SEG + 1;
export const TUBE_VERTS = TUBE_RINGS * (JET_RAD + 1) + 2;
export const BLOB_VERTS = 2 + 2 * BLOB_LON;
export const VERTS = TUBE_VERTS + N_BLOB * BLOB_VERTS;
export const TUBE_TRIS = JET_SEG * JET_RAD * 2 + 2 * JET_RAD;
export const BLOB_TRIS = BLOB_LON * 4;
export const TRIS = TUBE_TRIS + N_BLOB * BLOB_TRIS;

/** How much thicker the 3D stream is than the 2D thread (the 2D's is a pixel-fine line; this has a body and an outline to carry). */
export const THICKEN = 1.7;
export const LANDING_LIFE = 0.42;                // seconds a splash drop is in the air

export interface JetParams {
  /** the tear and where the stream lands (2D units) */
  x0: number; y0: number; xl: number; yl: number;
  /** the thread's radius at the tear (2D units, blood.js row 1), and how much of it is beads (0.5 fast, 1 an ooze) */
  r0: number; brk: number;
  /** 0 an ooze, 1 a fast bleed (smooth(25, 70, rate)) */
  spurt: number;
}
/** The eased state of the stream: how far it has grown out (0 nothing, 1 landed) and how far it has drained off from its tail (0 none, 1 gone). */
export interface JetEase { grow: number; drain: number }

export interface JetBuffers { pos: Float32Array; nor: Float32Array; tang: Float32Array; ik: Float32Array }
export function makeJetBuffers(): JetBuffers {
  return { pos: new Float32Array(VERTS * 3), nor: new Float32Array(VERTS * 3), tang: new Float32Array(VERTS * 3), ik: new Float32Array(VERTS) };
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const smooth = (e0: number, e1: number, x: number): number => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };
const frac = (x: number): number => x - Math.floor(x);
/** A fixed pseudo-random 0..1 for an integer (a drop's own size, side and phase never change). */
export const hash = (i: number): number => frac(Math.sin(i * 12.9898 + 4.1) * 43758.5453);

/** The 2D's bleed rate to strength: 0 an ooze, 1 a fast bleed. */
export const spurtOf = (rate: number | undefined): number => smooth(25, 70, rate || 50);

/** How much of the stream is there: the part of its path from `lo` to `hi` (0..1 of the way from the tear to the landing), and how thick it is (0..1). */
export interface Reach { lo: number; hi: number; thick: number }
const REACH: Reach = { lo: 0, hi: 0, thick: 0 };
/** It grows out of the tear as it starts (the head runs out to the landing), and on a stop it stays whole while the tail leaves it, thinning, so nothing pops. One kept record. */
export function reachOf(e: JetEase): Reach {
  REACH.hi = smooth(0, 1, e.grow);
  REACH.lo = smooth(0, 1, e.drain) * 0.98;
  REACH.thick = smooth(0, 0.3, e.grow) * (1 - smooth(0.55, 1, e.drain));
  return REACH;
}

/** The stream's path: a parabola through the tear and the landing (thrown a little up first, so it arcs), s from 0 at the tear to 1 at the landing. Writes the 2D point and unit tangent. */
export interface PathPoint { x: number; y: number; tx: number; ty: number }
export function jetLift(p: JetParams): number { return Math.min(16, 0.2 * Math.abs(p.xl - p.x0) + 3) * (0.35 + 0.65 * p.spurt); }
export function jetDrop(p: JetParams): number { return Math.max(14, p.yl - p.y0); }
export function pathAt(p: JetParams, s: number, out: PathPoint): PathPoint {
  const H = jetDrop(p), lift = jetLift(p), dx = p.xl - p.x0;
  out.x = p.x0 + dx * s;
  out.y = p.y0 - lift * s + (H + lift) * s * s;
  const dy = -lift + 2 * (H + lift) * s, n = Math.hypot(dx, dy) || 1;
  out.tx = dx / n; out.ty = dy / n;
  return out;
}
/** A rough length of the whole path (2D units): the beads are spaced along it. */
export function pathLength(p: JetParams): number {
  const a = { x: 0, y: 0, tx: 0, ty: 0 }, b = { x: 0, y: 0, tx: 0, ty: 0 };
  let L = 0; pathAt(p, 0, a);
  for (let i = 1; i <= 8; i++) { pathAt(p, i / 8, b); L += Math.hypot(b.x - a.x, b.y - a.y); a.x = b.x; a.y = b.y; }
  return L;
}

/** The stream's radius at s (2D units, before the ease): a narrow orifice that widens, the thinning of the fall, the beads, and a slow ripple running down it (a flow, not a beat). */
export function radiusAt(p: JetParams, s: number, len: number, time: number): number {
  const R = p.r0 * THICKEN;
  const core = 0.7 + 0.52 * smooth(0, 0.42, s);
  const taper = 1 - 0.45 * smooth(0, 0.9, s);
  const brk = p.brk * smooth(0.25, 0.85, s) * (0.55 + 0.45 * p.spurt);
  const along = s * len;
  const ph = (along * 0.045 * (1 + 0.22 * Math.sin(along * 0.047 + 1.3)) - time * (0.55 + 0.4 * p.spurt)) ;
  const cell = Math.floor(ph), bead = Math.pow(Math.max(Math.sin(Math.PI * (ph - cell)), 0), 0.55);
  const hv = hash(cell);
  const beaded = 0.16 + (0.9 + 0.5 * hv) * bead;
  const ripple = 1 + 0.07 * Math.sin(along * 0.35 - time * 9) * (1 - brk);
  return R * core * taper * (1 + (beaded - 1) * brk) * ripple;
}

const P: PathPoint = { x: 0, y: 0, tx: 0, ty: 0 };
const R_AT = new Float64Array(TUBE_RINGS);
const L_AT = new Float64Array(TUBE_RINGS);

let vi = 0;   // (the vertex the writers below have reached)
function put(b: JetBuffers, x: number, y: number, z: number, nx: number, ny: number, nz: number, tx: number, ty: number, ik: number): void {
  const m = organMap('stomach');   // (the stream and its drops lie in the stomach's lumen: they go with the organ's edit; the shading normals are left as they are)
  if (m) { const q = m([x, y, z]); x = q[0]; y = q[1]; z = q[2]; }
  const o = vi * 3;
  b.pos[o] = x; b.pos[o + 1] = y; b.pos[o + 2] = z;
  b.nor[o] = nx; b.nor[o + 1] = ny; b.nor[o + 2] = nz;
  b.tang[o] = tx; b.tang[o + 1] = ty; b.tang[o + 2] = 0;
  b.ik[vi] = ik; vi++;
}

/** The ink's strength along the stream: full at the tear, thinning to a quarter toward the tip (the outline fades with the stream). */
export const inkAlong = (s: number): number => 1 - 0.72 * smooth(0.3, 1, s);

/** One drop: an ellipsoid at (cx, cy) (2D units) whose long axis (ra) lies along (ax, ay) (a unit vector, 2D), the other two radii rb (in the plane) and rc (toward the viewer). */
function blob(b: JetBuffers, z: number, cx: number, cy: number, ax: number, ay: number, ra: number, rb: number, rc: number, ik: number): void {
  // the scene's axes: x right, y UP, so the 2D direction is flipped in y; the plane's other axis is its perpendicular
  const tx = ax, ty = -ay, px = -ty, py = tx;
  const X = x3(cx), Y = y3(cy), k = 1 / 300;
  const A = Math.max(ra * k, 1e-6), B = Math.max(rb * k, 1e-6), C = Math.max(rc * k, 1e-6);
  const dead = ra <= 0 || rb <= 0;
  const ring = (lat: number): void => {
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let j = 0; j < BLOB_LON; j++) {
      const th = (j / BLOB_LON) * Math.PI * 2, ux = sl, uy = cl * Math.cos(th), uz = cl * Math.sin(th);
      // the normal of an ellipsoid: the unit direction over each radius, renormalised
      const nx = tx * ux / A + px * uy / B, ny = ty * ux / A + py * uy / B, nz = uz / C, n = Math.hypot(nx, ny, nz) || 1;
      put(b, X + (tx * ux * A + px * uy * B), Y + (ty * ux * A + py * uy * B), z + uz * C, nx / n, ny / n, nz / n, tx, ty, dead ? 0 : ik);
    }
  };
  put(b, X + tx * A, Y + ty * A, z, tx, ty, 0, tx, ty, dead ? 0 : ik);
  ring(0.7);    // (40 degrees toward the nose, then as far toward the tail)
  ring(-0.7);
  put(b, X - tx * A, Y - ty * A, z, -tx, -ty, 0, tx, ty, dead ? 0 : ik);
}

/** Index buffer (once): the stream's sides and caps, then each drop's. */
export function jetIndex(): Uint16Array {
  const idx: number[] = [];
  const stride = JET_RAD + 1;
  for (let i = 0; i < JET_SEG; i++) for (let j = 0; j < JET_RAD; j++) {
    const a = i * stride + j, c = a + stride;
    idx.push(a, a + 1, c, c, a + 1, c + 1);
  }
  const tail = TUBE_RINGS * stride, head = tail + 1;
  for (let j = 0; j < JET_RAD; j++) idx.push(tail, j + 1, j);
  for (let j = 0; j < JET_RAD; j++) idx.push(head, (JET_SEG * stride) + j, (JET_SEG * stride) + j + 1);
  for (let n = 0; n < N_BLOB; n++) {
    const o = TUBE_VERTS + n * BLOB_VERTS, nose = o, r1 = o + 1, r2 = o + 1 + BLOB_LON, back = o + 1 + 2 * BLOB_LON;
    for (let j = 0; j < BLOB_LON; j++) {
      const j1 = (j + 1) % BLOB_LON;
      idx.push(nose, r1 + j, r1 + j1);
      idx.push(r1 + j, r2 + j, r1 + j1, r1 + j1, r2 + j, r2 + j1);
      idx.push(back, r2 + j1, r2 + j);
    }
  }
  return Uint16Array.from(idx);
}
/** The static uv (u along the stream, v round it) the toon shader reads. */
export function jetUv(): Float32Array {
  const uv = new Float32Array(VERTS * 2);
  const stride = JET_RAD + 1;
  for (let i = 0; i < TUBE_RINGS; i++) for (let j = 0; j <= JET_RAD; j++) { uv[(i * stride + j) * 2] = i / JET_SEG; uv[(i * stride + j) * 2 + 1] = j / JET_RAD; }
  uv[TUBE_RINGS * stride * 2] = 0; uv[(TUBE_RINGS * stride + 1) * 2] = 1;
  return uv;
}

/** Where a drop is on its way, and how big (written for the tests and for `fill`). */
export interface Drop { s: number; off: number; offZ: number; r: number; stretch: number }
const DROP: Drop = { s: 0, off: 0, offZ: 0, r: 0, stretch: 1 };
/** Drop j of the spray at `time`: it is shed from the stream's lower half and carries on down the arc, drifting out of it. One kept record. */
export function sprayDrop(p: JetParams, j: number, time: number, hi: number, thick: number): Drop {
  const h = hash(j + 1), h2 = hash(j + 31), h3 = hash(j + 71);
  const ph = frac(time * (0.5 + 0.3 * p.spurt) + j / N_SPRAY + 0.07 * h);
  const gate = clamp(3.5 + 6.5 * p.spurt - j, 0, 1);   // an ooze sheds few, a fast bleed all of them
  DROP.s = hi * (0.5 + 0.5 * ph);
  DROP.off = (h2 * 2 - 1) * ph * p.r0 * THICKEN * 2.6;
  DROP.offZ = (h3 * 2 - 1) * ph * p.r0 * THICKEN * 1.6;
  DROP.r = p.r0 * THICKEN * (0.36 + 0.26 * h) * gate * thick * smooth(0, 0.18, ph) * (1 - smooth(0.86, 1, ph));
  DROP.stretch = 1.25 + 0.9 * ph;
  return DROP;
}
/** Splash drop j at `time`: thrown up and out from the landing, falls back (a small ballistic arc, 2D units). Offsets from the landing point. */
export interface Splash { dx: number; dy: number; r: number; vx: number; vy: number }
const SPL: Splash = { dx: 0, dy: 0, r: 0, vx: 0, vy: 0 };
const SPLASH_G = 260;
export function splashDrop(p: JetParams, j: number, time: number, gate: number): Splash {
  const h = hash(j + 101), h2 = hash(j + 131);
  const ph = frac(time * 1.9 + j / N_SPLASH + 0.09 * h), tau = ph * LANDING_LIFE;
  const ang = (-0.95 + (1.9 * (j + 0.5 * h)) / N_SPLASH), v = (55 + 30 * h2) * (0.6 + 0.5 * p.spurt);
  SPL.vx = Math.sin(ang) * v; SPL.vy = -Math.cos(ang) * v + SPLASH_G * tau;
  SPL.dx = Math.sin(ang) * v * tau; SPL.dy = -Math.cos(ang) * v * tau + 0.5 * SPLASH_G * tau * tau;
  SPL.r = p.r0 * THICKEN * (0.28 + 0.2 * h) * gate * (0.35 + 0.65 * p.spurt) * smooth(0, 0.15, ph) * (1 - smooth(0.65, 1, ph));
  return SPL;
}

/** Writes the whole jet into `b` at `time` seconds, `z` the plane it is drawn in. Returns the thickness (0 nothing shown). Nothing is made. */
export function fillJet(b: JetBuffers, p: JetParams, e: JetEase, time: number, z: number): number {
  const { lo, hi, thick } = reachOf(e);
  const len = pathLength(p);
  vi = 0;
  // ── the stream: its rings, each carried by the path's tangent and the plane's normal (the path lies in the plane, so no twisting) ──
  for (let i = 0; i < TUBE_RINGS; i++) {
    const s = lo + (hi - lo) * (i / JET_SEG);
    R_AT[i] = Math.max(1e-3, radiusAt(p, s, len, time) * thick);
    L_AT[i] = s * len;
  }
  for (let i = 0; i < TUBE_RINGS; i++) {
    const s = lo + (hi - lo) * (i / JET_SEG);
    pathAt(p, s, P);
    const i0 = Math.max(0, i - 1), i1 = Math.min(TUBE_RINGS - 1, i + 1);
    const slope = (R_AT[i1]! - R_AT[i0]!) / Math.max(1e-6, L_AT[i1]! - L_AT[i0]! || 1e-6);   // (how fast the radius changes along the stream: it tilts the shading normal)
    const T3x = P.tx, T3y = -P.ty, Nx = -T3y, Ny = T3x;   // (scene axes: y up)
    const X = x3(P.x), Y = y3(P.y), r = R_AT[i]! / 300, ik = inkAlong(s);
    for (let j = 0; j <= JET_RAD; j++) {
      const th = (j / JET_RAD) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const nx = Nx * c - T3x * slope, ny = Ny * c - T3y * slope, nz = sn, n = Math.hypot(nx, ny, nz) || 1;
      put(b, X + Nx * c * r, Y + Ny * c * r, z + sn * r, nx / n, ny / n, nz / n, T3x, T3y, ik);
    }
  }
  {
    // the tail and the head (the two apexes)
    pathAt(p, lo, P); const r0 = R_AT[0]! / 300, rN = R_AT[TUBE_RINGS - 1]! / 300;
    put(b, x3(P.x) - P.tx * r0 * 0.4, y3(P.y) + P.ty * r0 * 0.4, z, -P.tx, P.ty, 0, P.tx, -P.ty, inkAlong(lo));
    pathAt(p, hi, P);
    put(b, x3(P.x) + P.tx * rN * 0.4, y3(P.y) - P.ty * rN * 0.4, z, P.tx, -P.ty, 0, P.tx, -P.ty, inkAlong(hi));
  }
  // ── the spray: drops shed from the lower half, strung out along the arc and drifting off it ──
  for (let j = 0; j < N_SPRAY; j++) {
    const d = sprayDrop(p, j, time, hi, thick);
    pathAt(p, clamp(d.s, 0, 1), P);
    const nx = -P.ty, ny = P.tx;   // (2D normal)
    blob(b, z + d.offZ / 300, P.x + nx * d.off, P.y + ny * d.off, P.tx, P.ty, d.r * d.stretch, d.r, d.r, 0.85);
  }
  // ── the splash: where the stream meets the surface, drops thrown up and falling back ──
  const landed = smooth(0.9, 1, hi) * (1 - smooth(0.6, 0.98, lo)) * thick;
  for (let j = 0; j < N_SPLASH; j++) {
    const d = splashDrop(p, j, time, landed), sp = Math.hypot(d.vx, d.vy) || 1;
    blob(b, z + 0.004, p.xl + d.dx, p.yl + d.dy, d.vx / sp, d.vy / sp, d.r * 1.3, d.r, d.r, 0.8);
  }
  // ── the lens of blood on the surface, rocking a little as the stream lands in it ──
  const lensR = p.r0 * THICKEN * (0.5 + 0.3 * p.spurt);
  blob(b, z - 0.004, p.xl, p.yl + lensR * 0.3, 1, 0, landed * lensR * (4.6 + 1.1 * Math.sin(time * 3.1)), landed * lensR * 0.62, landed * lensR * 0.9, 0.8);
  // ── the wet swell at the tear ──
  const swell = thick * p.r0 * THICKEN * (1.25 + 0.1 * Math.sin(time * 2.3));
  blob(b, z - 0.004, p.x0, p.y0, 1, 0, swell, swell * 0.85, swell * 0.6, 0.9);
  return thick;
}
