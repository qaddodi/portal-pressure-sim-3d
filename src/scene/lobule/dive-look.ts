// Plan 30b: where a dive from the body into the lobule goes. ONE function, called by scene.placeDive and by the tests (no copy).
// Plan 30 aimed through the DESTINATION room's centre and took the liver's bounding box for the liver, so an ordinary tap on Lobule flew into the middle of the belly. Here:
//   - the ray goes through the centre of the room he is LOOKING at now (rig.pose.room), never the room the lobule will land in;
//   - "the liver" is its drawn outline (the 2D outline, morphed and shrunk as the figure draws it, liver-edge.ts liverOutline2d), taken in from its edge by DIVE_INSET;
//   - not zoomed in (the body's own framing): the liver's familiar default place; zoomed on the liver: where he looks; zoomed elsewhere: the nearest liver point that is on screen (default when none is).
import { Vector3, type PerspectiveCamera } from 'three';
import { liverOutline2d } from '../disease/liver-edge.ts';
import { x3, y3 } from '../frame2d.ts';
import { DEFAULT_DIVE_PLACE, LIVER_Z } from './frames.ts';

/** How far inside the liver's edge the place stays (scene units; the liver is about 1.5 wide). */
export const DIVE_INSET = 0.04;
/** The hand is "not zoomed in" up to this zoom and this pan (px): the body's own framing. */
export const HOME_K = 1.05, HOME_PAN = 8;
export type Pt = { x: number; y: number };
export interface LookRig {
  camera: PerspectiveCamera;
  pose: { room: { x: number; y: number; w: number; h: number } };
  handView: { k: number; x: number; y: number };
  project(p: Vector3): Pt;
}
export interface LiverState { cirrhosis: number; congestion: number }

/** The liver's drawn outline in scene units. */
export function liverOutlineWorld(liver: LiverState): Pt[] {
  return liverOutline2d(liver.cirrhosis, liver.congestion).map(([x, y]) => ({ x: x3(x), y: y3(y) }));
}
const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};
/** Point in polygon (even-odd). */
export function inPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** Inside the outline and at least `inset` from its edge. */
export function insideInset(p: Pt, poly: readonly Pt[], inset = DIVE_INSET): boolean {
  if (!inPolygon(p, poly)) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segDist(p, poly[i]!, poly[j]!) < inset) return false;
  return true;
}
/** The point of the liver's plane under the centre of the room he is looking at (null when the ray never meets it). */
export function lookPoint(rig: LookRig, w: number, h: number): Pt | null {
  const r = rig.pose.room, cx = r.w > 1 ? r.x + r.w / 2 : w / 2, cy = r.h > 1 ? r.y + r.h / 2 : h / 2;
  const a = new Vector3((cx / w) * 2 - 1, -(cy / h) * 2 + 1, 0.5).unproject(rig.camera), o = rig.camera.position, dz = a.z - o.z;
  if (!(dz < -1e-9)) return null;
  const t = (LIVER_Z - o.z) / dz, p = { x: o.x + (a.x - o.x) * t, y: o.y + (a.y - o.y) * t };
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}
export const isHome = (hv: { k: number; x: number; y: number }): boolean => hv.k <= HOME_K && Math.abs(hv.x) <= HOME_PAN && Math.abs(hv.y) <= HOME_PAN;
/** On screen: inside the room he is looking at (the whole canvas when it has none), a margin in from its edge. */
export function onScreen(rig: LookRig, p: Pt, w: number, h: number, margin = 0.04): boolean {
  const r = rig.pose.room.w > 1 ? rig.pose.room : { x: 0, y: 0, w, h }, s = rig.project(new Vector3(p.x, p.y, LIVER_Z));
  const mx = r.w * margin, my = r.h * margin;
  return Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= r.x + mx && s.x <= r.x + r.w - mx && s.y >= r.y + my && s.y <= r.y + r.h - my;
}

/** The place of the dive (scene units, the liver's plane). */
export function diveLook(rig: LookRig, w: number, h: number, liver: LiverState): Pt {
  const dflt = { x: DEFAULT_DIVE_PLACE[0], y: DEFAULT_DIVE_PLACE[1] };
  if (isHome(rig.handView) || !(w > 1) || !(h > 1)) return dflt;
  const look = lookPoint(rig, w, h);
  if (!look) return dflt;
  const poly = liverOutlineWorld(liver), good = (p: Pt) => insideInset(p, poly) && onScreen(rig, p, w, h);
  if (good(look)) return look;
  // zoomed elsewhere: the nearest valid liver point (a grid over the liver, then the line to it bisected to the first valid point, so the answer sits on the edge of the valid region)
  let best: Pt | null = null, bd = Infinity;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of poly) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const NX = 96, NY = 72;
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) {
    const q = { x: x0 + ((x1 - x0) * i) / NX, y: y0 + ((y1 - y0) * j) / NY }, d = Math.hypot(q.x - look.x, q.y - look.y);
    if (d < bd && good(q)) { best = q; bd = d; }
  }
  if (!best) return dflt;
  let lo = 0, hi = 1;   // (along look -> best: lo is not valid, hi is)
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (good({ x: look.x + (best.x - look.x) * m, y: look.y + (best.y - look.y) * m })) hi = m; else lo = m; }
  const n = { x: look.x + (best.x - look.x) * hi, y: look.y + (best.y - look.y) * hi };
  return good(n) ? n : best;
}
