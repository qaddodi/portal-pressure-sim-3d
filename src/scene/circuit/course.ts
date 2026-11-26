// Every vessel's two courses and what the change between them needs: the body course (the scene's own, anatomy/vessels.ts and vessels/network.ts) and the map course (the
// 2D circuit's, data.copied.ts), each sampled at the same N even steps of arc length, the one correspondence the 2D morph uses (stage-geo.js: sample i to sample i).
// Also each sample's flow rank (from its column in the wide map), the courses in the frame of their own chord (a vessel that reverses between the views), and the ends
// that join another vessel part-way along it in one view and at a station in the other (the left gastric vein on the portal trunk), pinned to their host.
import { CatmullRomCurve3, Vector3 } from 'three';
import { MAPPED, type NetVessel } from '../vessels/network.ts';
import { vesselPoints } from '../anatomy/vessels.ts';
import { CIRCUIT_D, VB_CIRC } from './data.copied.ts';
import { MAP_K, mapToScene, sceneToMap } from './map.ts';
import { courseOf, cumulative, resample } from './paths.ts';
import { chordShape, peelRank } from './peel.ts';

/** Samples to a course, as the 2D app's N_SAMPLES. */
export const N_TRACK = 64;
/** An end this near its host's course (scene units, in the plane) in both views is a side join; four map units as the 2D app has it, a little more for the body's warped courses. */
export const PIN_TOL = 4 * MAP_K * 2.5;
/** The share of a pinned vessel the host's shift fades out over. */
export const PIN_FALL = 0.4;

export interface Pin {
  /** 0 the vessel's start, 1 its end */
  end: 0 | 1;
  /** the sample at that end */
  k: number;
  host: string;
  /** where on the host's samples (fractional index) the end lies, in the body and on the map */
  fA: number; fC: number;
  /** what lay between the end and that point at rest, in the body and on the map (xy) */
  dA: [number, number]; dC: [number, number];
}

export interface CircuitCourse {
  id: string;
  /** the body course's curve (the tube's own) and the map course's curve, both uniform in arc length */
  curveA: CatmullRomCurve3;
  curveC: CatmullRomCurve3;
  lenA: number;
  lenC: number;
  /** N samples of each, scene xyz; the map's unturned */
  A: Vector3[];
  C: Vector3[];
  /** flow rank of each sample, 0 (gut) to 1 (heart) */
  rank: Float32Array;
  sA: Float64Array;
  sC: Float64Array;
  pins: Pin[] | null;
  /** the map course in map units (dense), for hit testing */
  mapPts: [number, number][];
}

/** How far (map units) a sharp corner is rounded back along each side: a vein is about 15 units wide, so the inner edge of a bend still has a radius of its own. */
export const CORNER_R = 22;
/** A turn under this (radians) is a curve's own step, not a corner. */
const CORNER_MIN_TURN = 0.35;

/** A polyline with its sharp corners rounded (a quadratic through the corner, from where it starts to cut it to where it ends): a tube turns a mitred corner into a pinched joint with a
 *  thick triangle of ink at its inner side. The first and last points stay where they are (stations and joins sit there). */
export function roundCorners(pts: readonly [number, number][], r = CORNER_R): [number, number][] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [[pts[0]![0], pts[0]![1]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!;
    const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const turn = lu > 1e-9 && lv > 1e-9 ? Math.PI - Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) : 0;
    // (a dense run of short steps is a curve already: only a corner with room on both sides is rounded)
    const d = Math.min(r, 0.45 * lu, 0.45 * lv);
    if (turn < CORNER_MIN_TURN || d < 2) { out.push([b[0], b[1]]); continue; }
    const p0: [number, number] = [b[0] + (ux / lu) * d, b[1] + (uy / lu) * d], p1: [number, number] = [b[0] + (vx / lv) * d, b[1] + (vy / lv) * d];
    const steps = 8;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, m = 1 - t;
      out.push([m * m * p0[0] + 2 * m * t * b[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * b[1] + t * t * p1[1]]);
    }
  }
  out.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1]]);
  return out;
}

/** The course's map polyline for an edge, in map units, its corners rounded. */
export function mapCourse(id: string): [number, number][] | null {
  const d = CIRCUIT_D[id];
  // (as 2D draws it, to the last point: the hepatic arteries stop at the tips of the bed's lanes, 30 map units short of the bed's station, and never cross them. Mohammad, 21 Nov: "do it like 2D does it", which ends the 20 Nov run-on to the station)
  return d ? roundCorners(courseOf(d)) : null;
}

const curvesA = new Map<string, CatmullRomCurve3>();
/** The body course of a network vessel as the tube is built from it. */
export function bodyCurve(v: Pick<NetVessel, 'id' | 'pts' | 'radius' | 'from' | 'to' | 'host' | 'label' | 'tone'>): CatmullRomCurve3 {
  let c = curvesA.get(v.id);
  if (!c) { c = new CatmullRomCurve3(vesselPoints(v as never)); curvesA.set(v.id, c); }
  return c;
}

function sampleCurve(c: CatmullRomCurve3, n: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < n; i++) out.push(c.getPointAt(i / (n - 1)));
  return out;
}

/** The map course as a curve in the scene (dense enough that the rounded corners keep their shape). */
export function mapCurve(dense: [number, number][]): CatmullRomCurve3 {
  const { total } = cumulative(dense);
  const n = Math.max(24, Math.min(600, Math.ceil(total / 2.5)));
  const pts = resample(dense, n).map(([x, y]) => { const p = mapToScene(x, y); return new Vector3(p[0], p[1], p[2]); });
  return new CatmullRomCurve3(pts, false, 'centripetal');
}

function nearOn(P: readonly Vector3[], q: Vector3): { d: number; f: number } {
  let best = Infinity, f = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]!, b = P[i]!, dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
    const u = Math.min(1, Math.max(0, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)), ex = a.x + dx * u - q.x, ey = a.y + dy * u - q.y, d = ex * ex + ey * ey;
    if (d < best) { best = d; f = i - 1 + u; }
  }
  return { d: Math.sqrt(best), f };
}
function ptAt(P: readonly Vector3[], f: number): [number, number] {
  const i = Math.min(P.length - 2, Math.floor(f)), u = f - i;
  return [P[i]!.x + (P[i + 1]!.x - P[i]!.x) * u, P[i]!.y + (P[i + 1]!.y - P[i]!.y) * u];
}

function findPins(list: readonly NetVessel[], by: Map<string, CircuitCourse>): void {
  const art = (v: NetVessel) => v.tone === 'artery';
  for (const v of list) {
    const g = by.get(v.id)!, n = g.A.length;
    for (const end of [0, 1] as const) {
      const node = end ? v.to : v.from, k = end ? n - 1 : 0, qa = g.A[k]!, qc = g.C[k]!;
      let best: Pin | null = null, bestD = Infinity;
      for (const h of list) {
        if (h === v || art(h) !== art(v) || (h.from !== node && h.to !== node)) continue;
        const hg = by.get(h.id)!;
        const a = nearOn(hg.A, qa), c = nearOn(hg.C, qc);
        if (a.d > PIN_TOL || c.d > PIN_TOL) continue;
        // only a side join in either view: an end that meets its host's end in both moves with it already
        const side = (f: number) => f > 0.5 && f < n - 1.5;
        if (!side(a.f) && !side(c.f)) continue;
        if (a.d + c.d < bestD) {
          const pa = ptAt(hg.A, a.f), pc = ptAt(hg.C, c.f);
          bestD = a.d + c.d;
          best = { end, k, host: h.id, fA: a.f, fC: c.f, dA: [pa[0] - qa.x, pa[1] - qa.y], dC: [pc[0] - qc.x, pc[1] - qc.y] };
        }
      }
      if (best) (g.pins ||= []).push(best);
    }
  }
}

function build(): Map<string, CircuitCourse> {
  const by = new Map<string, CircuitCourse>();
  for (const v of MAPPED) {
    const dense = mapCourse(v.id);
    if (!dense) throw new Error(`no circuit course for ${v.id}`);
    const curveA = bodyCurve(v), curveC = mapCurve(dense);
    const A = sampleCurve(curveA, N_TRACK), C = sampleCurve(curveC, N_TRACK);
    const rank = new Float32Array(N_TRACK);
    for (let i = 0; i < N_TRACK; i++) rank[i] = peelRank(sceneToMap(C[i]!.x, C[i]!.y)[0]);
    by.set(v.id, { id: v.id, curveA, curveC, lenA: curveA.getLength(), lenC: curveC.getLength(), A, C, rank, sA: chordShape(A), sC: chordShape(C), pins: null, mapPts: dense });
  }
  findPins(MAPPED, by);
  return by;
}

/** Every drawn vessel's courses, by edge ID. */
export const COURSES: ReadonlyMap<string, CircuitCourse> = build();

