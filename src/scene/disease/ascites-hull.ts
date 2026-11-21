// The ascites as ONE inflated hull (21 Nov 2026, organic design package A: /mnt/project-files/rebuild-3d/ascites-organic-design.md; Mohammad: "a flat right and left; it should have an organic curvature throughout").
// This file is the hull's LAYOUT (CPU): a boundary-fitting grid of 2D points over the water, the attributes the hull program (package B, ascites-hull-glsl.ts) reads, the thickness numbers and the tap's ray walk. The depth
// itself (z) is made by the vertex shader from `aW`, so nothing here is a flat extrusion: the front and back sheets both sit at z = MID on the cavity wall (aW = 0) and swell to the middle (sqrt profile), so no vertex
// of the wall lies off the flank line and no face is flat.
//
// Layout (design 3.1): the wet part of the cavity wall (wallBelow) is resampled by arc length into NS + 1 points W[i]; the surface between its two ends into NS + 1 points S[i] (cosine-spaced in x). Vertex (i, j) of a sheet is
// mix(S[i], W[i], t[j]): rows 0..5 sit at 2D's own depths under the surface (ROW_DEPTHS, along the segment, so the meniscus and the depth ramp shade as 2D's), the other rows go to the wall, denser toward it, and the last row
// IS the wall (aW = 0). Columns 0 and NS collapse onto the two crossings (also on the wall). Two sheets (front aK = +1, back aK = -1, the same 2D points) and the lid (the surface row repeated across NK steps of aK from
// -1 to 1, aLid = 1). Topology is built once; only the attributes are rewritten, into preallocated arrays (no allocation per lay, apart from wallBelow's small point list).
// Imports ascites-pool.ts (the shared numbers), never ascites.ts, which imports this.
import { BufferAttribute, BufferGeometry } from 'three';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import * as A from './ascites-pool.ts';
import { fluidBase } from './copied/fluid-step.js';

export const HULL = {
  /** Columns minus one (NS + 1 = 97 columns), rows per sheet, and lid steps across the depth. */
  NS: 96, NT: 20, NK: 9,
  /** The gut's middle plane (scene z): the rim plane, the flank line and the tap lie on it (organs.bin: bowel -0.224..-0.035, colon -0.104..0.040). */
  MID: -0.09,
  /** The most the front and the back reach beyond MID (scene units): the front to 0.07, the back to -0.26. */
  TF_MAX: 0.16, TB_MAX: 0.17,
  /** A full belly's volume, and the first film's radius (2D units) over which the body grows from a thin lens. */
  FULL_ML: 6000, SMALL_R: 160,
} as const;

const { NS, NT, NK } = HULL;
const COLS = NS + 1, SHEET = COLS * NT, LID = COLS * NK, VERTS = 2 * SHEET + LID;

/** A wall point of the cavity below the water: its 2D position and its depth under the surface (2D units). */
export interface WallPoint { x: number; y: number; d: number }

/** The cavity's wall polyline (2D units, y down) cut to the part under the surface: `surfaceY(x)` is the surface's y (2D units) at x. Points where the wall is under the surface keep their depth; where the polyline crosses the
 *  surface a point of depth 0 is added. In the polyline's own order. (Moved from ascites-shell.ts, which the integration package deletes.) */
export function wallBelow(poly: readonly (readonly [number, number])[], surfaceY: (x: number) => number): WallPoint[] {
  const out: WallPoint[] = [];
  const depth = (i: number): number => poly[i]![1] - surfaceY(poly[i]![0]);
  const cross = (i: number, j: number): WallPoint => {
    const da = depth(i), db = depth(j), t = da / (da - db), a = poly[i]!, b = poly[j]!;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, d: 0 };
  };
  for (let i = 0; i < poly.length; i++) {
    const d = depth(i), wet = d > 0, was = i > 0 && depth(i - 1) > 0;
    if (wet && i > 0 && !was) out.push(cross(i - 1, i));
    if (wet) out.push({ x: poly[i]![0], y: poly[i]![1], d });
    if (!wet && was) out.push(cross(i - 1, i));
  }
  return out;
}

/** Columns cluster toward the two crossings (cosine spacing): the body's rim there is a vertical tangent, and a column step of 8 units across it would be a visible facet. */
const ease = (u: number): number => 0.5 - 0.5 * Math.cos(Math.PI * u);
const smooth01 = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The profile of the body: 0 on the wall, 1 at w = 1 (the deepest point), vertical tangent at the wall: sqrt(w (2 - w)), an ellipse. w is the distance from the wall over the deepest distance. */
export const hullProfile = (w: number): number => { const c = Math.min(1, Math.max(0, w)); return Math.sqrt(c * (2 - c)); };

/** How far the front and back reach from MID (scene units): TF_MAX and TB_MAX times the fill (1 L is about a third as thick as a full belly: (ml / 6000)^0.6, whole from 6 L), times `small` (a first film, radius R in 2D
 *  units, is a thin lens, not a ball) and the living switch (0 is 2D's flat pool). */
export function hullThickness(ml: number, R: number, living: number): { tf: number; tb: number } {
  const fill = Math.pow(Math.min(1, Math.max(0, ml / HULL.FULL_ML)), 0.6), k = fill * smooth01(0, HULL.SMALL_R, R) * Math.min(1, Math.max(0, living));
  return { tf: HULL.TF_MAX * k, tb: HULL.TB_MAX * k };
}

export class HullLayout {
  readonly geometry = new BufferGeometry();
  /** The attributes' arrays, kept for the tests (and never reallocated). */
  readonly pos = new Float32Array(VERTS * 3); readonly aD = new Float32Array(VERTS); readonly aW = new Float32Array(VERTS);
  readonly aG = new Float32Array(VERTS * 2); readonly aK = new Float32Array(VERTS); readonly aLid = new Float32Array(VERTS);
  readonly index: Uint32Array;
  /** The deepest distance from the wall (2D units), `uR`; 0 while there is no water. */
  radius = 0;
  /** The wet wall as laid (2D units, left to right, flat x y pairs) and its point count, for the tap and the tests. */
  wall = new Float64Array(0); wallN = 0;
  private wx = new Float64Array(0); private wy = new Float64Array(0); private cum = new Float64Array(0);
  private readonly sx = new Float64Array(COLS); private readonly sy = new Float64Array(COLS);
  private readonly ex = new Float64Array(COLS); private readonly ey = new Float64Array(COLS);
  private readonly indexCount: number;
  constructor() {
    const idx: number[] = [];
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT - 1; j++) {
      const a = i * NT + j, b = a + NT;
      idx.push(a, a + 1, b, a + 1, b + 1, b);                                          // front: outward (+z)
      const a2 = a + SHEET, b2 = b + SHEET;
      idx.push(a2, b2, a2 + 1, a2 + 1, b2, b2 + 1);                                    // back: outward (-z)
    }
    for (let i = 0; i < NS; i++) for (let k = 0; k < NK - 1; k++) {
      const a = 2 * SHEET + i * NK + k, b = a + NK;
      idx.push(a, a + 1, b, a + 1, b + 1, b);                                          // lid: upward (+y)
    }
    this.index = new Uint32Array(idx); this.indexCount = idx.length;
    for (let v = 0; v < SHEET; v++) { this.aK[v] = 1; this.aK[v + SHEET] = -1; }
    for (let i = 0; i < COLS; i++) for (let k = 0; k < NK; k++) { const v = 2 * SHEET + i * NK + k; this.aK[v] = -1 + (2 * k) / (NK - 1); this.aLid[v] = 1; }
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aD', new BufferAttribute(this.aD, 1));
    g.setAttribute('aW', new BufferAttribute(this.aW, 1));
    g.setAttribute('aG', new BufferAttribute(this.aG, 2));
    g.setAttribute('aK', new BufferAttribute(this.aK, 1));
    g.setAttribute('aLid', new BufferAttribute(this.aLid, 1));
    g.setIndex(new BufferAttribute(this.index, 1));
    g.setDrawRange(0, 0);
    for (let v = 0; v < VERTS; v++) this.pos[v * 3 + 2] = HULL.MID;
  }
  get vertexCount(): number { return VERTS; }
  get sheet(): number { return SHEET; }
  /** Lays the hull for the cavity `poly` (2D units) under the surface `surfaceY(x)` (2D units, clamped to the wall top by the caller). */
  lay(poly: readonly (readonly [number, number])[], surfaceY: (x: number) => number): void {
    const pts = wallBelow(poly, surfaceY), n = pts.length;
    if (n < 2) { this.radius = 0; this.wallN = 0; this.geometry.setDrawRange(0, 0); return; }
    if (this.wx.length < n) { const c = n + 32; this.wx = new Float64Array(c); this.wy = new Float64Array(c); this.cum = new Float64Array(c); this.wall = new Float64Array(2 * c); }
    const wx = this.wx, wy = this.wy, cum = this.cum;
    const rev = pts[0]!.x > pts[n - 1]!.x;
    for (let k = 0; k < n; k++) { const p = pts[rev ? n - 1 - k : k]!; wx[k] = p.x; wy[k] = p.y; this.wall[2 * k] = p.x; this.wall[2 * k + 1] = p.y; }
    this.wallN = n;
    cum[0] = 0; let cx = wx[0]!, cy = wy[0]!;
    for (let k = 1; k < n; k++) { cum[k] = cum[k - 1]! + Math.hypot(wx[k]! - wx[k - 1]!, wy[k]! - wy[k - 1]!); cx += wx[k]!; cy += wy[k]!; }
    cx /= n; cy /= n;
    const total = cum[n - 1]!;
    // the columns: W[i] by arc length, S[i] cosine-spaced in x between the two crossings (the ends are the crossings themselves)
    let seg = 0;
    for (let i = 0; i < COLS; i++) {
      const s = total * ease(i / NS);
      while (seg < n - 2 && cum[seg + 1]! < s) seg++;
      const l = cum[seg + 1]! - cum[seg]!, u = l > 0 ? Math.min(1, Math.max(0, (s - cum[seg]!) / l)) : 0;
      this.ex[i] = wx[seg]! + (wx[seg + 1]! - wx[seg]!) * u; this.ey[i] = wy[seg]! + (wy[seg + 1]! - wy[seg]!) * u;
      const x = wx[0]! + (wx[n - 1]! - wx[0]!) * ease(i / NS);
      this.sx[i] = x; this.sy[i] = i === 0 ? wy[0]! : i === NS ? wy[n - 1]! : surfaceY(x);
    }
    this.ex[0] = wx[0]!; this.ey[0] = wy[0]!; this.ex[NS] = wx[n - 1]!; this.ey[NS] = wy[n - 1]!;
    const rd = A.ROW_DEPTHS, nd = rd.length;
    let R = 0;
    for (let i = 0; i < COLS; i++) {
      const dx = this.ex[i]! - this.sx[i]!, dy = this.ey[i]! - this.sy[i]!, L = Math.hypot(dx, dy);
      const t5 = L > 0 ? Math.min(1, rd[nd - 1]! / L) : 1;
      for (let j = 0; j < NT; j++) {
        let t: number;
        if (j < nd) t = L > 0 ? Math.min(1, rd[j]! / L) : 1;
        else { const u = (j - (nd - 1)) / (NT - nd); t = t5 + (1 - t5) * (1 - (1 - u) * (1 - u)); }
        if (j === NT - 1) t = 1;
        const x = this.sx[i]! + dx * t, y = this.sy[i]! + dy * t, v = i * NT + j;
        // the nearest wall point: distance and the unit direction away from it (2D, y down)
        let best = Infinity, fx = 0, fy = 0, sgi = 0;
        for (let k = 1; k < n; k++) {
          const ax = wx[k - 1]!, ay = wy[k - 1]!, bx = wx[k]! - ax, by = wy[k]! - ay, l2 = bx * bx + by * by;
          const tt = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * bx + (y - ay) * by) / l2)) : 0;
          const px = ax + tt * bx, py = ay + tt * by, d2 = (x - px) * (x - px) + (y - py) * (y - py);
          if (d2 < best) { best = d2; fx = px; fy = py; sgi = k; }
        }
        let d = Math.sqrt(best), gx: number, gy: number;
        if (d > 1e-6) { gx = (x - fx) / d; gy = (y - fy) / d; }
        else {   // on the wall: the segment's normal, toward the water (the wet wall's centre)
          const bx = wx[sgi]! - wx[sgi - 1]!, by = wy[sgi]! - wy[sgi - 1]!, l = Math.hypot(bx, by) || 1;
          gx = -by / l; gy = bx / l;
          if (gx * (cx - fx) + gy * (cy - fy) < 0) { gx = -gx; gy = -gy; }
        }
        if (j === NT - 1 || i === 0 || i === NS) d = 0;
        this.setVertex(v, x, y, Math.max(0, y - surfaceY(x)), d, gx, -gy);
        if (d > R) R = d;
        // the back sheet repeats the front's 2D point; the lid takes the surface row (j = 0) at every depth step
        this.copyVertex(v, v + SHEET);
        if (j === 0) for (let k = 0; k < NK; k++) { const w = 2 * SHEET + i * NK + k; this.copyVertex(v, w); this.aD[w] = 0; }
      }
    }
    this.radius = R;
    this.geometry.setDrawRange(0, this.indexCount);
    for (const nm of ['position', 'aD', 'aW', 'aG']) (this.geometry.getAttribute(nm) as BufferAttribute).needsUpdate = true;
    this.geometry.boundingSphere = null;
  }
  private setVertex(v: number, x2: number, y2: number, d: number, w: number, gx: number, gy: number): void {
    this.pos[v * 3] = x3(x2); this.pos[v * 3 + 1] = y3(y2); this.pos[v * 3 + 2] = HULL.MID;
    this.aD[v] = d; this.aW[v] = w; this.aG[v * 2] = gx; this.aG[v * 2 + 1] = gy;
  }
  private copyVertex(from: number, to: number): void {
    this.pos[to * 3] = this.pos[from * 3]!; this.pos[to * 3 + 1] = this.pos[from * 3 + 1]!; this.pos[to * 3 + 2] = HULL.MID;
    this.aD[to] = this.aD[from]!; this.aW[to] = this.aW[from]!; this.aG[to * 2] = this.aG[from * 2]!; this.aG[to * 2 + 1] = this.aG[from * 2 + 1]!;
  }
  /** Distance (2D units) from a point to the wet wall as laid. */
  wallDistance(x: number, y: number): number {
    let best = Infinity; const w = this.wall;
    for (let k = 1; k < this.wallN; k++) {
      const ax = w[2 * k - 2]!, ay = w[2 * k - 1]!, bx = w[2 * k]! - ax, by = w[2 * k + 1]! - ay, l2 = bx * bx + by * by;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * bx + (y - ay) * by) / l2)) : 0;
      best = Math.min(best, (x - ax - t * bx) ** 2 + (y - ay - t * by) ** 2);
    }
    return Math.sqrt(best);
  }
  dispose(): void { this.geometry.dispose(); }
}

/** A point or direction in the group's local frame (scene units). */
export interface V3 { x: number; y: number; z: number }
/** The tap (design section 8): walks the ray through the hull's z range in `steps` samples, front to back. Each sample is mapped back to 2D by the inverse of the rest-ray slide (project from the rest eye `E` onto MID),
 *  and hits when `holds(x, y)` (2D units) accepts it and its z lies inside that point's [zB, zF]. Returns the first hit's 2D point, or null. `th` is the body's current thickness (hullThickness). */
export function hullHit(ray: { origin: V3; direction: V3 }, E: V3, layout: HullLayout, holds: (x: number, y: number) => boolean, th: { tf: number; tb: number }, steps = 16): { x: number; y: number } | null {
  const o = ray.origin, d = ray.direction;
  if (!(Math.abs(d.z) > 1e-9) || layout.wallN < 2 || !(layout.radius > 0)) return null;
  const zHi = HULL.MID + Math.max(th.tf, 1e-4), zLo = HULL.MID - Math.max(th.tb, 1e-4);
  const tA = (zHi - o.z) / d.z, tB = (zLo - o.z) / d.z, t0 = Math.min(tA, tB), t1 = Math.max(tA, tB);
  if (t1 < 0) return null;
  for (let s = 0; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps;
    if (t < 0) continue;
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    const k = (E.z - pz) / (E.z - HULL.MID);
    if (!(k > 1e-6)) continue;
    const mx = E.x + (px - E.x) / k, my = E.y + (py - E.y) / k;   // back to the 2D point (scene x, y on MID)
    const x = x2d(mx), y = y2d(my);
    if (!holds(x, y)) continue;
    const prof = hullProfile(layout.wallDistance(x, y) / layout.radius);
    if (pz <= HULL.MID + th.tf * prof + 1e-9 && pz >= HULL.MID - th.tb * prof - 1e-9) return { x, y };
  }
  return null;
}

// (fluidBase is re-exported so the tests build the same surface the layer does without reaching into copied/)
export { fluidBase };
