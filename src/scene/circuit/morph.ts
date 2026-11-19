// A vessel's centreline at t of the change between the Anatomy and the Circuit, as the 2D stage draws it (stage-frame.js vesselAt), on the N samples of its course:
// each point on its own share of the change (the flow peel), a vessel that runs the other way in the circuit carried in the frame of its chord, and an end that
// joins another vessel part-way along it moved with that point of its host. Only the xy plane moves this way; depth eases straight from the body's to the map's.
//
// The GPU draws every tube between its two courses with the plain peeled lerp (shader.ts). The vessels this file changes (those that reverse, those with a pinned end)
// get `track` rows: how far each sample stands from the plain lerp, and the centreline's direction. The change is zero at both ends of the move, so the landed
// views are exactly the body's and the map's courses.
import { N_TRACK, PIN_FALL, type CircuitCourse, COURSES, type Pin } from './course.ts';
import { chordPointInto, peelAt, reverses } from './peel.ts';
import { turnScenePt } from './map.ts';

const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Whether a course runs the other way in the circuit as it is laid out now (turned by rr). */
export function revOf(g: CircuitCourse, rr: number): boolean {
  const n = g.C.length;
  const a = turnScenePt(g.C[0]!.x, g.C[0]!.y, rr), b = turnScenePt(g.C[n - 1]!.x, g.C[n - 1]!.y, rr);
  return n > 2 && reverses(g.A, b[0] - a[0], b[1] - a[1]);
}

const LP = [0, 0], E0 = [0, 0], E1 = [0, 0], H0 = [0, 0], H1 = [0, 0], PS = [0, 0], CH = [0, 0], TP: [number, number] = [0, 0];

function lerpPt(g: CircuitCourse, i: number, t: number, rr: number, out: number[]): number[] {
  const A = g.A[i]!, C = g.C[i]!, w = peelAt(t, g.rank[i]!);
  const c = turnScenePt(C.x, C.y, rr, TP);
  out[0] = lerp(A.x, c[0], w); out[1] = lerp(A.y, c[1], w);
  return out;
}
function rawPt(g: CircuitCourse, i: number, t: number, rr: number, rev: boolean, out: number[]): number[] {
  lerpPt(g, i, t, rr, out);
  const n = g.A.length;
  if (i > 0 && i < n - 1 && rev) { lerpPt(g, 0, t, rr, E0); lerpPt(g, n - 1, t, rr, E1); chordPointInto(out, g.sA, g.sC, i, peelAt(t, g.rank[i]!), E0[0]!, E0[1]!, E1[0]!, E1[1]!); }
  return out;
}
/** How far a pinned end is moved at t: to its host's point (the host's share along its course eased from the body's to the map's), less what lay between them at rest. */
function pinShift(g: CircuitCourse, pin: Pin, t: number, rr: number, out: number[]): number[] {
  const h = COURSES.get(pin.host)!, w = peelAt(t, g.rank[pin.k]!), f = lerp(pin.fA, pin.fC, w), nh = h.A.length, i = Math.min(nh - 2, Math.floor(f)), u = f - i;
  const hrev = revOf(h, rr);
  rawPt(h, i, t, rr, hrev, H0); rawPt(h, i + 1, t, rr, hrev, H1); rawPt(g, pin.k, t, rr, revOf(g, rr), LP);
  const a = turnAngleCS(rr), rcx = a.c * pin.dC[0] - a.s * pin.dC[1], rcy = a.s * pin.dC[0] + a.c * pin.dC[1];
  out[0] = lerp(H0[0]!, H1[0]!, u) - LP[0]! - lerp(pin.dA[0], rcx, w);
  out[1] = lerp(H0[1]!, H1[1]!, u) - LP[1]! - lerp(pin.dA[1], rcy, w);
  return out;
}
function turnAngleCS(rr: number): { c: number; s: number } { const a = (Math.PI / 2) * rr; return { c: Math.cos(a), s: Math.sin(a) }; }

/** Whether the vessel needs a track at (t, rr): it reverses, or an end is pinned. */
export function needsTrack(g: CircuitCourse, rr: number): boolean { return !!g.pins || revOf(g, rr); }

/**
 * The vessel's centreline at t (0 < t < 1), scene xyz per sample, written into `m` (3 N numbers); `base` gets the plain peeled lerp the GPU draws (so the track is m - base).
 * Returns whether the two differ (the vessel needs a track).
 */
export function morphInto(g: CircuitCourse, t: number, rr: number, m: Float32Array, base: Float32Array): boolean {
  const n = g.A.length, rev = revOf(g, rr);
  for (let i = 0; i < n; i++) {
    const A = g.A[i]!, C = g.C[i]!, w = peelAt(t, g.rank[i]!), c = turnScenePt(C.x, C.y, rr, TP);
    const x = lerp(A.x, c[0], w), y = lerp(A.y, c[1], w), z = lerp(A.z, C.z, w);
    base[3 * i] = x; base[3 * i + 1] = y; base[3 * i + 2] = z;
    m[3 * i] = x; m[3 * i + 1] = y; m[3 * i + 2] = z;
  }
  if (!rev && !g.pins) return false;
  if (rev) {
    const x0 = m[0]!, y0 = m[1]!, x1 = m[3 * (n - 1)]!, y1 = m[3 * (n - 1) + 1]!;
    for (let i = 1; i < n - 1; i++) { chordPointInto(CH, g.sA, g.sC, i, peelAt(t, g.rank[i]!), x0, y0, x1, y1); m[3 * i] = CH[0]!; m[3 * i + 1] = CH[1]!; }
  }
  if (g.pins) for (const pin of g.pins) {
    pinShift(g, pin, t, rr, PS);
    const dx = PS[0]!, dy = PS[1]!, reach = PIN_FALL * (n - 1);
    if (dx === 0 && dy === 0) continue;
    for (let j = 0; j < n; j++) {
      const kf = smooth01(1 - j / reach);
      if (kf <= 0) break;
      const q = pin.end ? n - 1 - j : j;
      m[3 * q] = m[3 * q]! + dx * kf; m[3 * q + 1] = m[3 * q + 1]! + dy * kf;
    }
  }
  return true;
}

/** The direction of the centreline at each sample (central differences, unit length), written into `tan` (3 N numbers). */
export function tangentsInto(m: Float32Array, tan: Float32Array): void {
  const n = m.length / 3;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let x = m[3 * b]! - m[3 * a]!, y = m[3 * b + 1]! - m[3 * a + 1]!, z = m[3 * b + 2]! - m[3 * a + 2]!;
    const l = Math.hypot(x, y, z);
    if (l < 1e-9) { x = 1; y = 0; z = 0; } else { x /= l; y /= l; z /= l; }
    tan[3 * i] = x; tan[3 * i + 1] = y; tan[3 * i + 2] = z;
  }
}

export { N_TRACK };
