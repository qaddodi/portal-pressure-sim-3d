// A route in the scene: the 2D route (route.ts, the figure's world units) carried by the one linear map of frame2d.ts, with a depth for each sample from the tier of the vessel it runs in, so a
// device sits exactly where the vessel it travels is and stays registered with it as the figure turns. Lengths stay in figure units (they are the 2D app's: `d` below is a length along the route
// in those units, `u` is a share), radii and positions are scene units.
import { Vector3 } from 'three';
import { NETWORK_BY_ID, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { smoothJoinsOn } from '../vessels/join-mode.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { type Route, type RoutePart, catheterRadius, routeAt, routeOf } from './route.ts';
import { type Course, radiusAtU } from '../vessels/tubes.ts';
import { widthSwell } from '../vessels/live-width.ts';
import { drawnWidthD } from '../../engine/tract-override.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { liveWidest, liveShapeVersion } from '../vessels/live-shape.ts';

const lines = new Map<string, readonly (readonly [number, number, number])[]>();
/** The centreline the vessel's tube is built on (shape.ts coursesOf at rest: depth eased to its nodes, ends fitted to their trunks with smooth joins); a fan of tributaries has none, so its own points. */
function centreline(id: string): readonly (readonly [number, number, number])[] | null {
  const key = `${id}|${smoothJoinsOn()}`, hit = lines.get(key);
  if (hit) return hit;
  const v: NetVessel | undefined = NETWORK_BY_ID.get(id);
  if (!v) return null;
  const c = v.plan ? coursesOf(v, REST)[0]?.pts ?? v.pts : v.pts;
  lines.set(key, c);
  return c;
}
/** The nearest point of vessel `id`'s own 3D centreline (the course its tube is built on, z included, read now so a changed course is followed) to (x, y, z), and the distance. */
export function nearestOnCourse(id: string, x: number, y: number, z: number): { x: number; y: number; z: number; dist: number } | null {
  const pts = centreline(id);
  if (!pts || pts.length < 2) return null;
  let best: { x: number; y: number; z: number; dist: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2)) : 0;
    const cx = a[0] + dx * u, cy = a[1] + dy * u, cz = a[2] + dz * u, d = Math.hypot(x - cx, y - cy, z - cz);
    if (!best || d < best.dist) best = { x: cx, y: cy, z: cz, dist: d };
  }
  return best;
}
/** A vessel as it is DRAWN: the course its tube is built on and the tube's radius along it (its own, end tapers and buried ends included: tubes.ts radiusAtU), so a device can be held inside what is on the screen and not inside the
 *  vessel's nominal width (a branch's first stretch is drawn narrower where it meets its trunk). */
interface Drawn { pts: readonly (readonly [number, number, number])[]; cum: number[]; len: number; course: Course }
const drawnKept = new Map<string, Drawn | null>();
function drawnOf(id: string): Drawn | null {
  const key = `${id}|${smoothJoinsOn()}`;
  if (drawnKept.has(key)) return drawnKept.get(key)!;
  const v = NETWORK_BY_ID.get(id);
  let out: Drawn | null = null;
  if (v?.plan) {
    const cs = coursesOf(v, REST);
    let c = cs[0]!;
    for (const x of cs) if (x.radius > c.radius) c = x;
    if (c.pts.length >= 2 && c.radius > 0) {
      const cum = [0];
      for (let i = 1; i < c.pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]));
      out = { pts: c.pts, cum, len: cum[cum.length - 1]!, course: c };
    }
  }
  drawnKept.set(key, out);
  return out;
}
/** How far point (x, y, z) is from the centreline of vessel `id` as a share of the tube's DRAWN radius there (0 on the centreline, 1 at the wall), and that radius (scene units); null for a vessel with no tube. */
export function drawnShare(id: string, x: number, y: number, z: number): { share: number; radius: number; dist: number } | null {
  const d = drawnOf(id);
  if (!d) return null;
  let best = Infinity, bu = 0;
  for (let i = 1; i < d.pts.length; i++) {
    const a = d.pts[i - 1]!, b = d.pts[i]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2)) : 0;
    const dd = Math.hypot(x - (a[0] + dx * u), y - (a[1] + dy * u), z - (a[2] + dz * u));
    if (dd < best) { best = dd; bu = (d.cum[i - 1]! + Math.sqrt(l2) * u) / (d.len || 1); }
  }
  const radius = Math.max(radiusAtU(d.course, Math.min(1, Math.max(0, bu)), d.len), 1e-6);
  return { share: best / radius, radius, dist: best };
}
/** The smallest `drawnShare` over the vessels `ids` (the lumen a device is in; at a corner it is in either): Infinity when none has a tube. */
export function lumenShare(ids: readonly string[], x: number, y: number, z: number): number {
  let m = Infinity;
  for (const id of ids) { const q = drawnShare(id, x, y, z); if (q && q.share < m) m = q.share; }
  return m;
}
/** The vessels a route runs in (a vein cut in pieces counts whole, its branches' pieces too). */
export function routeVessels(r: Route): string[] {
  const out = new Set<string>();
  const add = (q: { id: string | null; subs?: { id: string | null }[] }): void => { if (q.id && NETWORK_BY_ID.has(q.id)) out.add(q.id); for (const s of q.subs ?? []) if (s.id && NETWORK_BY_ID.has(s.id)) out.add(s.id); };
  for (const q of r.parts) add(q);
  for (const i of r.ids) if (NETWORK_BY_ID.has(i)) out.add(i);
  return [...out];
}

/** The distance in scene units from `p` to the nearest centreline of the vessels `ids`; Infinity when none has a course. */
export function courseDistance(ids: readonly string[], p: Vector3): number {
  let best = Infinity;
  for (const id of ids) { const c = nearestOnCourse(id, p.x, p.y, p.z); if (c && c.dist < best) best = c.dist; }
  return best;
}

export interface Route3D {
  route: Route;
  /** one scene point per smoothed route sample, and its depth */
  z: Float32Array;
  /** the route's own scene positions at the samples */
  pos: Vector3[];
  /** where the tip stands when `u` of its way is done (u: 0 at the route's `start`, 1 at `free`), as a length */
  tipD(u: number): number;
  /** the scene point at length d, and the unit direction there */
  point(d: number, out?: Vector3): Vector3;
  dir(d: number, out?: Vector3): Vector3;
  /** the scene point at length d ON the vessel's own centreline (the shaft is rounded off it at the corners; a balloon that fills the lumen is not) */
  centre(d: number, out?: Vector3): Vector3;
  /** the vessel's lumen radius at d as it is drawn NOW (the nominal radius, the tube's own taper, and the engine's live width: `setLive`), in scene units */
  lumen(d: number): number;
  /** The engine's diameters (per edge, mm) the veins are drawn at (null: as built). Every vessel of the route is drawn at its live width (the vessel shader's rule, live-width.ts), so the device follows it: `point`, `dir`, `lumen` and
   *  `swellAt` answer for the vessels as drawn. True when the answer changed. */
  setLive(D: ArrayLike<number> | null | undefined): boolean;
  /** counts the changes `setLive` has made (a device that shares the route compares it with the one it drew at) */
  liveVersion(): number;
  /** The live width over the built width at d (1 as built; the vein of a cirrhotic liver is narrower), blurred along the route so it never steps at a joint */
  swellAt(d: number): number;
  /** Lays the route on the vessels as they are drawn NOW (a collateral's curve grows with its fill: live-shape.ts). True when the route moved since the last call; `followVersion` counts the moves. */
  follow(): boolean;
  followVersion(): number;
  /** the catheter's radius, scene units */
  rc: number;
}

const partIdAt = (parts: readonly RoutePart[], d: number): string | null => {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (d <= p.d1 + 1e-6 && d >= p.d0 - 1e-6) return p.id ?? parts.slice(i + 1).find((q) => q.id)?.id ?? null;
  }
  return parts[parts.length - 1]?.id ?? null;
};
const tierZ = (id: string | null): number => {
  if (!id) return TIER_Z.net;
  if (id === 'TIPS' || id === 'DIPS') return TIER_Z.over;
  const v = NETWORK_BY_ID.get(id);
  return v ? TIER_Z[v.tier] : TIER_Z.net;
};

/** The least bend radius a device takes, in catheter radii: the smoothing's width (a Gaussian this wide turns a right-angle elbow into an arc about this round). */
export const BEND_RADII = 6;
/** How much of the room the lumen has beyond the shaft a sample may use to cut a corner: under 1, so the shaft never touches the wall. */
export const SAFE = 0.92;
/** Rounds the route's corners in place: moves each sample (offX, offY, z) toward the Gaussian-smoothed path, by no more than SAFE of its vessel's room beyond the shaft. Ends and stretches with no room stay put. */
export function smoothBends(r: Route, rc: number, z: Float32Array, offX: Float32Array, offY: Float32Array, lumen?: { share: (x: number, y: number, z: number) => number; cap: number }): void {
  const n = r.pts.length, U = UNITS_PER_SCENE, sig0 = Math.max(rc * U * BEND_RADII, 1e-6);
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), room = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = x3(r.pts[i]![0]) + offX[i]!; Y[i] = y3(r.pts[i]![1]) + offY[i]!; Z[i] = z[i]!; room[i] = Math.max(0, (r.rad[i] ?? 0) / U - rc) * SAFE; }
  // The room to move off the centreline can change no faster than a bend allows (ROOM_SLOPE per unit of path): a corner from a wide vein (the cava) into a narrow one (a renal or hepatic vein) is then entered along
  // an arc that begins in the wide vein, instead of a sharp turn at the node where the room drops at once.
  for (let i = 1; i < n; i++) room[i] = Math.min(room[i]!, room[i - 1]! + (ROOM_SLOPE * (r.cum[i]! - r.cum[i - 1]!)) / U);
  for (let i = n - 2; i >= 0; i--) room[i] = Math.min(room[i]!, room[i + 1]! + (ROOM_SLOPE * (r.cum[i + 1]! - r.cum[i]!)) / U);
  for (let i = 0; i < n; i++) {
    if (room[i]! < 1e-6) continue;
    // the bend radius is at least the shaft's, and about the vein's own width where the vein is wide
    const sigma = Math.max(sig0, (r.rad[i] ?? 0) * 0.9), reach = sigma * 2.6;
    let sx = 0, sy = 0, sz = 0, w = 0;
    for (let j = i; j >= 0 && r.cum[i]! - r.cum[j]! <= reach; j--) { const k = Math.exp(-((r.cum[i]! - r.cum[j]!) ** 2) / (2 * sigma * sigma)); sx += X[j]! * k; sy += Y[j]! * k; sz += Z[j]! * k; w += k; }
    for (let j = i + 1; j < n && r.cum[j]! - r.cum[i]! <= reach; j++) { const k = Math.exp(-((r.cum[j]! - r.cum[i]!) ** 2) / (2 * sigma * sigma)); sx += X[j]! * k; sy += Y[j]! * k; sz += Z[j]! * k; w += k; }
    let dx = sx / w - X[i]!, dy = sy / w - Y[i]!, dz = sz / w - Z[i]!;
    const m = Math.hypot(dx, dy, dz);
    if (m > room[i]!) { const f = room[i]! / m; dx *= f; dy *= f; dz *= f; }
    // (and only as far as the DRAWN lumen allows: the move is shortened until the moved point is within `cap` of the drawn radius from a centreline, or is no further out than the point was: a stretch the route
    //  already holds off its centreline (a hairpin into a shunt) is bounded by the room alone, as before)
    if (lumen) {
      const cap = Math.max(lumen.cap, lumen.share(X[i]!, Y[i]!, Z[i]!)), ok = (f: number): boolean => lumen.share(X[i]! + dx * f, Y[i]! + dy * f, Z[i]! + dz * f) <= cap + 1e-9;
      let f = 1; for (let k = 0; k < 7 && !ok(f); k++) f *= 0.6;
      if (!ok(f)) f = 0;
      dx *= f; dy *= f; dz *= f;
    }
    offX[i] = offX[i]! + dx; offY[i] = offY[i]! + dy; z[i] = z[i]! + dz;
  }
}
/** How fast the room to cut a corner may change along the path (scene units per scene unit of path): about 27 degrees. */
export const ROOM_SLOPE = 0.5;

/** How far from a vessel's drawn centreline the shaft's axis may go while it rounds a corner, as a share of the drawn radius (the shaft is about 0.17 of it wide, so its wall stays inside 0.7). */
export const LUMEN_COMFORT = 0.5;
/** The shaft's radius as a share of the radius the 2D app draws it at (stage-cath.js: 0.26 to 0.34 of the vein): thin and refined (owner, 20 Nov 2026: "thick chunky tube"). */
export const CATHETER_SLIM = 0.62;

/** Half the width (route samples) the live width is blurred over, and the most the lumen is taken to swell (a balloon fills a dilated vein, but never a vein of any size). */
const SWELL_BLUR = 4, SWELL_CAP = 2.5;
const kept = new Map<string, Route3D>();
export function route3d(kind: string): Route3D | null {
  const key = `${kind}|${smoothJoinsOn()}`, hit = kept.get(key);
  if (hit) return hit;
  const r = routeOf(kind);
  if (!r) return null;
  const n = r.pts.length;
  let z: Float32Array<ArrayBufferLike> = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = tierZ(partIdAt(r.parts, r.cum[i]!));
  // the vessels step from tier to tier; the device passes through the step, so the depth is eased over about 14 figure units either side
  for (let pass = 0; pass < 2; pass++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -12; k <= 12; k++) { const j = Math.min(n - 1, Math.max(0, i + k)), g = Math.exp(-(k * k) / 50); s += z[j]! * g; w += g; } q[i] = s / w; }
    z = q;
  }
  // The device runs INSIDE the lumen, ON the centreline: each sample that lies on a vessel is put exactly on that vessel's own centreline (read now from the course its tube is built on, depth included, so a changed
  // course or node depth is followed). Where the route turns from one vessel into the next (the cava into a hepatic or renal vein) the two centrelines meet at their node, so the corner is a sharp turn at that
  // node and never a chord across the cava's lumen. Only a stretch with no vessel (the lead-in) keeps the 2D rule's own point and the tier depth.
  const offX = new Float32Array(n), offY = new Float32Array(n), pieceIds: (string | null)[] = new Array(n).fill(null), drawnR = new Float32Array(n).fill(Infinity);
  const partAt = (d: number): RoutePart | undefined => r.parts.find((q) => d <= q.d1 + 1e-6 && d >= q.d0 - 1e-6) ?? r.parts[r.parts.length - 1];
  for (let i = 0; i < n; i++) {
    const part = partAt(r.cum[i]!), cands = [part?.id, ...(part?.subs ?? []).map((q) => q.id)].filter((id): id is string => !!id && NETWORK_BY_ID.has(id));
    const px = x3(r.pts[i]![0]), py = y3(r.pts[i]![1]);
    // THE PLACED ANATOMY (route-placed.ts): the route was laid in 3D on the vessels' drawn centrelines, so each sample's own centreline point is known (raw3): the device sits on it, and the vessel it is in
    // is the nearest IN 3D (two vessels that cross on the figure are apart in depth)
    const own = r.raw3?.[i];
    if (own) {
      z[i] = own[2]; offX[i] = own[0] - px; offY[i] = own[1] - py;
      let bd = Infinity, bid: string | null = null;
      for (const id of cands) { const c = nearestOnCourse(id, own[0], own[1], own[2]); if (c && c.dist < bd) { bd = c.dist; bid = id; } }
      if (bid) { pieceIds[i] = bid; drawnR[i] = drawnShare(bid, own[0], own[1], own[2])?.radius ?? Infinity; }
      continue;
    }
    let best: { x: number; y: number; z: number; dist: number } | null = null, bestXY = Infinity, bestId: string | null = null;
    for (const id of cands) { const c = nearestOnCourse(id, px, py, z[i]!); if (c) { const dxy = Math.hypot(c.x - px, c.y - py); if (dxy < bestXY) { bestXY = dxy; best = c; bestId = id; } } }
    if (!best) continue;
    pieceIds[i] = bestId; drawnR[i] = drawnShare(bestId!, best.x, best.y, best.z)?.radius ?? Infinity;
    z[i] = best.z; offX[i] = best.x - px; offY[i] = best.y - py;
  }
  // ROUNDED CORNERS (20 Nov 2026): snapping each sample to its vessel's centreline leaves a sharp elbow where one vessel turns into the next (the cava into a hepatic vein), and a tube swept
  // through an elbow kinks. The path is smoothed along its arc length with a Gaussian whose width is a minimum bend radius (BEND_RADII catheter radii), and each sample may move off the
  // centreline only as far as the lumen has room beyond the shaft (SAFE of it), so the catheter takes a generous bend and still lies wholly inside its vessel at any tilt.
  const rcS = (kind === 'hvpg' ? Math.max(0.5, routeAt(r, r.free, { p: [0, 0], t: [1, 0], w: [0, 0], r: 0 }).r * 0.27) : catheterRadius(r) * 0.8) * CATHETER_SLIM / UNITS_PER_SCENE;
  const z0 = Float32Array.from(z), offX0 = Float32Array.from(offX), offY0 = Float32Array.from(offY);   // (the vessels' own centreline, before the bends are rounded: what a device that fills the lumen sits on)
  // the shaft's axis stays in the middle LUMEN_COMFORT of the drawn lumen of any vessel of the route (at a corner, of either): the nominal width the 2D route knows is wider than a branch's drawn first stretch
  const vessels = routeVessels(r);
  smoothBends(r, rcS, z, offX, offY, { share: (x, y, zz) => lumenShare(vessels, x, y, zz), cap: LUMEN_COMFORT });
  // FOLLOWING THE DRAWN VESSEL: a collateral that coils (the gastrorenal shunt) is drawn curved as it fills, and the route is laid on its straight rest course; each sample of such a vessel remembers where it lies along the rest course
  // (segment, share) and is carried by how far the drawn course has moved off the rest one there (follow()), so the shaft, the balloon and the sclerosant's column stay inside what is on the screen.
  const fol: ({ id: string; j: number; t: number } | null)[] = new Array(n).fill(null), rest = new Map<string, readonly (readonly [number, number, number])[]>();
  for (let i = 0; i < n; i++) {
    const id = pieceIds[i], v = id ? NETWORK_BY_ID.get(id) : undefined, own = r.raw3?.[i];
    if (!id || !own || !(v?.plan?.kind === 'coil' && v.plan.coils)) continue;
    let P = rest.get(id); if (!P) { P = coursesOf(v, REST)[0]!.pts; rest.set(id, P); }
    let best = Infinity, bj = 0, bt = 0;
    for (let j = 1; j < P.length; j++) {
      const a = P[j - 1]!, b = P[j]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
      const u = l2 > 0 ? Math.min(1, Math.max(0, ((own[0] - a[0]) * dx + (own[1] - a[1]) * dy + (own[2] - a[2]) * dz) / l2)) : 0;
      const dd = Math.hypot(own[0] - (a[0] + dx * u), own[1] - (a[1] + dy * u), own[2] - (a[2] + dz * u));
      if (dd < best) { best = dd; bj = j; bt = u; }
    }
    fol[i] = { id, j: bj, t: bt };
  }
  const anyFollow = fol.some((f) => f);
  const fOff = new Float32Array(n * 3);
  let followSeen = -1, followVer = 0;
  const follow = (): boolean => {
    if (!anyFollow) return false;
    const ver = liveShapeVersion();
    if (ver === followSeen) return false;
    followSeen = ver;
    let moved = false;
    for (let i = 0; i < n; i++) {
      const f = fol[i];
      let dx = 0, dy = 0, dz = 0;
      if (f) {
        const live = liveWidest(f.id)?.pts, P = rest.get(f.id)!;
        if (live && live.length === P.length) {
          const a = live[f.j - 1]!, b = live[f.j]!, c = P[f.j - 1]!, e = P[f.j]!;
          dx = a[0] + (b[0] - a[0]) * f.t - (c[0] + (e[0] - c[0]) * f.t); dy = a[1] + (b[1] - a[1]) * f.t - (c[1] + (e[1] - c[1]) * f.t); dz = a[2] + (b[2] - a[2]) * f.t - (c[2] + (e[2] - c[2]) * f.t);
        }
      }
      if (Math.abs(fOff[3 * i]! - dx) + Math.abs(fOff[3 * i + 1]! - dy) + Math.abs(fOff[3 * i + 2]! - dz) > 1e-7) moved = true;
      fOff[3 * i] = dx; fOff[3 * i + 1] = dy; fOff[3 * i + 2] = dz;
    }
    if (moved) followVer++;
    return moved;
  };
  const followAt = (d: number, o: Vector3): Vector3 => {
    if (!anyFollow) return o;
    const [i, u] = bracket(d), a = 3 * (i - 1), b = 3 * i;
    return o.set(o.x + fOff[a]! + (fOff[b]! - fOff[a]!) * u, o.y + fOff[a + 1]! + (fOff[b + 1]! - fOff[a + 1]!) * u, o.z + fOff[a + 2]! + (fOff[b + 2]! - fOff[a + 2]!) * u);
  };
  const pos = r.pts.map((p, i) => new Vector3(x3(p[0]) + offX[i]!, y3(p[1]) + offY[i]!, z[i]!));
  const bracket = (d: number): [number, number] => {
    d = Math.min(r.total, Math.max(0, d));
    let i = 1, hi = r.cum.length - 1;
    while (i < hi) { const m = (i + hi) >> 1; if (r.cum[m]! < d) i = m + 1; else hi = m; }
    const s0 = r.cum[i - 1]!, s1 = r.cum[i]!;
    return [i, s1 > s0 ? (d - s0) / (s1 - s0) : 0];
  };
  const zAt = (d: number): number => { const [i, u] = bracket(d); return z[i - 1]! + (z[i]! - z[i - 1]!) * u; };
  const offAt = (d: number, o: Vector3): Vector3 => { const [i, u] = bracket(d); return o.set(o.x + offX[i - 1]! + (offX[i]! - offX[i - 1]!) * u, o.y + offY[i - 1]! + (offY[i]! - offY[i - 1]!) * u, o.z); };
  const pt = { p: [0, 0] as [number, number], t: [1, 0] as [number, number], w: [0, 0] as [number, number], r: 0 };
  const A = new Vector3(), B = new Vector3(), C = new Vector3();
  const centre = (d: number, o = new Vector3()): Vector3 => {
    routeAt(r, d, pt); const [i, u] = bracket(d);
    const zz = z0[i - 1]! + (z0[i]! - z0[i - 1]!) * u;
    return followAt(d, o.set(x3(pt.p[0]) + offX0[i - 1]! + (offX0[i]! - offX0[i - 1]!) * u, y3(pt.p[1]) + offY0[i - 1]! + (offY0[i]! - offY0[i - 1]!) * u, zz));
  };
  const point0 = (d: number, o = new Vector3()): Vector3 => { routeAt(r, d, pt); return followAt(d, offAt(d, o.set(x3(pt.p[0]), y3(pt.p[1]), zAt(d)))); };
  // LIVE WIDTH: the vessel shader draws every vein at the engine's diameter (a cirrhotic liver's hepatic veins are far narrower than they were built), and the route was laid for the built width. The shaft's place off the vessel's
  // own centreline (the rounded corners) shrinks with the vessel (SWELL_K), and `lumen` is the live radius; the shaft's radius is held under a share of it (proc-catheter.ts).
  const sw = new Float32Array(n).fill(1);
  let anyNarrow = false, liveKey = '', version = 0;
  const vesselsHere = routeVessels(r);
  const swellAt = (d: number): number => { const [i, u] = bracket(d); return sw[i - 1]! + (sw[i]! - sw[i - 1]!) * u; };
  const drawnAt = (d: number): number => { const [i, u] = bracket(d); const a = drawnR[i - 1]!, b = drawnR[i]!; return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * u : Math.min(a, b); };
  const point = (d: number, o = new Vector3()): Vector3 => {
    point0(d, o);
    if (!anyNarrow) return o;
    const k = Math.min(1, swellAt(d));
    if (k >= 0.9999) return o;
    return o.lerpVectors(centre(d, C), o, k);   // (its own scratch: `dir` passes B as the out, and a shared one would hand back the centre itself)
  };
  const out: Route3D = {
    route: r, z, pos,
    tipD: (u) => r.start + (r.free - r.start) * Math.min(1, Math.max(0, u)),
    point, centre,
    // the direction is the path's own (a difference across the smoothed samples), so a ring's frame follows the bend the tube is swept through
    dir(d, o = new Vector3()) {
      const e = 2.4, lo = Math.max(0, d - e), hi = Math.min(r.total, d + e);
      if (hi - lo < 1e-6) return o.set(1, 0, 0);
      point(lo, A); point(hi, B);
      o.subVectors(B, A);
      return o.lengthSq() > 1e-12 ? o.normalize() : o.set(1, 0, 0);
    },
    lumen(d) { routeAt(r, d, pt); return Math.min(pt.r / UNITS_PER_SCENE, drawnAt(d)) * swellAt(d); },
    swellAt, liveVersion: () => version, follow, followVersion: () => followVer,
    setLive(D) {
      const by = new Map<string, number>();
      for (const id of vesselsHere) { const v = NETWORK_BY_ID.get(id)!; by.set(id, widthSwell(v.widthKind, v.baseD, drawnWidthD(id, D ? D[indexOf(v.lensId)] : undefined))); }
      const key = vesselsHere.map((id) => by.get(id)!.toFixed(3)).join('|');
      if (key === liveKey) return false;
      liveKey = key; version++;
      let a = Float64Array.from({ length: n }, (_, i) => (pieceIds[i] ? by.get(pieceIds[i]!) ?? 1 : 1));
      // (blurred over about 10 figure units so a joint between two veins of different widths is a glide, never a step; the route's samples are about 1.2 apart)
      for (let pass = 0; pass < 3; pass++) { const q = new Float64Array(n); for (let i = 0; i < n; i++) { let t = 0, w = 0; for (let k = -SWELL_BLUR; k <= SWELL_BLUR; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); t += a[j]!; w++; } q[i] = t / w; } a = q; }
      anyNarrow = false;
      for (let i = 0; i < n; i++) { sw[i] = Math.min(SWELL_CAP, a[i]!); if (sw[i]! < 0.9999) anyNarrow = true; }
      return true;
    },
    rc: 0,
  };
  out.rc = rcS;
  kept.set(key, out);
  return out;
}

/** A route's named stretches as u (0..1 of the way in, the share `ProcCatheter` takes): the 2D stage.cathStops. `tract` is the TIPS's way through the liver, `rpv` the right portal vein. */
export function stopsOf(r3: Route3D): Record<string, [number, number]> {
  const r = r3.route, span = r.free - r.start || 1;
  return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [(a - r.start) / span, (b - r.start) / span] as [number, number]]));
}
