// Where the bleeding stream leaves (ON the bleeding varix itself: tearAt), and where it lands, so that it stays INSIDE the esophagus and the stomach for any fill level (Mohammad, 26 Nov: it
// started right of the esophagus, arced out over the
// gap beside it, and looked outside the organs; he asked for it to start at the esophagus's far left wall, with a shallow arc). One pure place, read by
// the jet (bleed.ts), by the pool's ripples that run
// out from the landing (organs/pool-level.ts poolUniforms) and by the mark at the tear (tear.ts), so the three never part.
//
// The stream is a parabola, thrown out from the tear and falling to the landing on the pool's surface (jet.ts pathAt). Its throw is what makes it arc, so the way to keep it in is to throw it no
// farther than the organs allow: the landing is the farthest point toward the 2D app's own landing at which every point of the path is `STREAM_MARGIN` clear of the wall and the landing itself is
// `SPLASH_MARGIN` clear (the splash drops spread about that far). The wall is the real mesh as the screen covers it (lumen.ts), notch beside the esophagus and all.
import { SITES } from './copied/anatomy-b4.ts';
import { lumenClearance, streamZ } from './lumen.ts';
import { pathAt, spurtOf, type JetParams, type PathPoint } from './jet.ts';
import { PLACED_PATH_2D, PLACED_Z } from '../anatomy/placed-network.ts';
import { PLACED_VESSELS } from '../anatomy/placement.generated.ts';

export type BleedSite = 'VAR' | 'GV';

/** How far the stream's centre line keeps from the wall in the esophagus (figure units: the tube is only about 17 wide, and the stream's own half width with its ink is up to about 5). */
export const STREAM_MARGIN = 5;
/** And in the stomach below the cardia, where there is room: the liver lies over the stomach's left edge, so a stream that hugs it reads as outside the stomach. */
export const BODY_MARGIN = 9;
/** The height (figure units) where the esophagus opens into the stomach: the notch beside the tube has closed (tests/bleed-in-lumen.test.ts pins it against the mesh). */
export const CARDIA_Y = 254;
/** The room the stream's centre line must keep from the wall at height `y`. */
export const marginAt = (y: number): number => (y < CARDIA_Y ? STREAM_MARGIN : BODY_MARGIN);
/** How far the landing keeps from the wall: the splash's drops spread about this far to each side. */
export const SPLASH_MARGIN = 10;
/** How many points of the path are judged. */
export const FIT_STEPS = 64;
/** The tear's height at the esophageal varix (figure units): the 2D app's (the varix site's y plus 12, and one more for the thread's first row), where the varix meets the cardia. */
const VAR_TEAR_DROP = 13;

/** The vessels that carry each site's varix, as the 3D figure places them (anatomy/placed-network.ts), in flow order: the coronary vein's run up the
 *  esophagus, and the short gastric veins on to the gastrorenal shunt round the fundus. */
export const VARIX_COURSE: Readonly<Record<BleedSite, readonly string[]>> = { VAR: ['C1a'], GV: ['C2', 'C5'] };
/** Where the 2D app leaves its tear (figure units): only an aim. The 3D placement moves every vessel (the fundal loops crest 10 units below the 2D app's
 *  point), so the tear is the vessel's own nearest point, never this one. */
const AIM: Record<BleedSite, readonly [number, number]> = {
  VAR: [SITES.varix![0]!, SITES.varix![1]! + VAR_TEAR_DROP],
  GV: [SITES.fundus![0]!, SITES.fundus![1]! - 3],
};

export interface CoursePoint { x: number; y: number; z: number }
/** The point on a drawn course (2D points with a depth each) nearest to `aim`, found on its segments (not only its points), with the depth interpolated
 *  there. Pure: the rule every bleed's tear stands on. */
export function nearestOnCourse(pts: readonly (readonly [number, number])[], zs: readonly number[], aim: readonly [number, number]): CoursePoint {
  let best = Infinity, out: CoursePoint = { x: pts[0]![0], y: pts[0]![1], z: zs[0] ?? 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L > 0 ? Math.min(1, Math.max(0, ((aim[0] - a[0]) * dx + (aim[1] - a[1]) * dy) / L)) : 0;
    const x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(aim[0] - x, aim[1] - y);
    if (d < best) { best = d; out = { x, y, z: (zs[i] ?? 0) + t * ((zs[i + 1] ?? zs[i] ?? 0) - (zs[i] ?? 0)) }; }
  }
  return out;
}
/** Slides a point sideways, toward the deeper part of the lumen, only as far as the stream needs its room from the wall (an esophageal varix lies ON the
 *  wall: its blood leaves into the lumen beside it). A point that already has the room stays. */
export function inwardTo(x: number, y: number, margin: number): number {
  let bx = x, bc = lumenClearance(x, y);
  for (let dx = -40; dx <= 40; dx++) { const c = lumenClearance(x + dx, y); if (c > bc + 1e-9) { bc = c; bx = x + dx; } }
  if (lumenClearance(x, y) >= margin || bx === x) return x;
  const dir = bx > x ? 0.5 : -0.5;
  let u = x;
  while (lumenClearance(u, y) < margin && Math.abs(u - x) < Math.abs(bx - x)) u += dir;
  return u;
}

export interface Tear { x: number; y: number; /** scene depth of the vessel's near surface at the tear: where the blood leaves it */ z: number }
const TEARS: Partial<Record<BleedSite, Tear>> = {};
/** The tear's point (figure units, x right, y down) and depth, for `site`: ON the site's own placed varix vessel (the point of its drawn course nearest
 *  the 2D app's aim), moved inward only as far as the stream's room from the wall needs; the depth is the vessel's near surface there. One rule for the
 *  esophageal varix and the gastric one, so a bleed always leaves the vein that is bleeding. */
export function tearAt(site: BleedSite): Tear {
  const kept = TEARS[site];
  if (kept) return kept;
  const pts: [number, number][] = [], zs: number[] = [];
  let r = 0.016;
  for (const id of VARIX_COURSE[site]) {
    const c = PLACED_PATH_2D[id], z = PLACED_Z[id];
    if (!c || !z) continue;
    c.forEach((p, i) => { pts.push([p[0], p[1]]); zs.push(z[i] ?? 0); });
    r = Math.max(r, PLACED_VESSELS[id]?.r ?? 0);
  }
  if (!pts.length) return (TEARS[site] = { x: AIM[site][0], y: AIM[site][1], z: streamZ(AIM[site][0], AIM[site][1]) });
  const on = nearestOnCourse(pts, zs, AIM[site]), x = inwardTo(on.x, on.y, STREAM_MARGIN);
  return (TEARS[site] = { x, y: on.y, z: on.z + r });
}
/** The tear's point (figure units, x right, y down) for `site`. */
export const tearOf = (site: BleedSite): readonly [number, number] => { const t = tearAt(site); return [t.x, t.y]; };

/** How far (figure units) from the tear the stream's depth has come back to the organ's wall plane. */
export const TEAR_DEPTH_EASE = 30;
const ease01 = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
/** The depth the stream is drawn at over the figure's point (x, y): at the tear it is the vein's own near surface (so the blood leaves the vessel from
 *  every camera angle: the 14 degree view turns the 0.2 or so between the vein and the stomach's
 *  front wall into a sideways shift of the tear), and it eases over TEAR_DEPTH_EASE to just in front of the organ's wall, where it rides for the rest of its fall (lumen.ts streamZ). */
export function streamDepth(site: BleedSite, x: number, y: number): number {
  const t = tearAt(site), w = 1 - ease01(Math.hypot(x - t.x, y - t.y) / TEAR_DEPTH_EASE), z = streamZ(x, y);
  return z + (t.z - z) * w;
}
/** Where the 2D app aims the stream's landing, before the organs' walls are asked (copied/bleed-shapes.js: the tear's x plus 62 for the esophageal varix, plus 3 for the gastric). */
const aimX = (site: BleedSite): number => (site === 'GV' ? SITES.fundus![0]! + 3 : SITES.varix![0]! + 8 + 62);

export interface StreamFit {
  x0: number; y0: number; xl: number; yl: number; lift: number;
  /** the path's tightest slack over its margin (figure units, 0 or more when it keeps them), and how clear of the wall the landing is */
  pathClear: number; landClear: number;
}
const FIT: StreamFit = { x0: 0, y0: 0, xl: 0, yl: 0, lift: 0, pathClear: 0, landClear: 0 };
const JP: JetParams = { x0: 0, y0: 0, xl: 0, yl: 0, r0: 3, brk: 0.7, spurt: 0.5, lift: 0 };
const PT: PathPoint = { x: 0, y: 0, tx: 0, ty: 0 };

/** The shallow throw: up to a few units, more for a faster bleed. */
export const liftOf = (spurt: number): number => 4 * (0.35 + 0.65 * spurt);
/** The steeper starts it may fall back on, as a lift below zero (it leaves the wall going down at a slant instead of level): tried in this order, only when the shallow throw cannot stay inside. */
const STEEPER = [0, -10, -20, -30, -45, -60, -80, -110];

/** The path's tightest slack: how much more room than `marginAt` it has at its worst point (0 or more: it keeps every margin). */
function slackOf(p: JetParams): number {
  let lo = Infinity;
  for (let i = 0; i <= FIT_STEPS; i++) { pathAt(p, i / FIT_STEPS, PT); lo = Math.min(lo, lumenClearance(PT.x, PT.y) - marginAt(PT.y)); }
  return lo;
}

let memo: { site: BleedSite; rate: number; yl: number } | null = null;
/** The stream's tear and landing for `site`, a bleed of `rate` and a pool whose surface is at `yl` (figure units, down the page). One kept record, valid until the next call. */
export function fitStream(site: BleedSite, rate: number, yl: number): StreamFit {
  if (memo && memo.site === site && memo.rate === rate && memo.yl === yl) return FIT;
  memo = { site, rate, yl };
  const [x0, y0] = tearOf(site), spurt = spurtOf(rate), aim = aimX(site);
  JP.x0 = x0; JP.y0 = y0; JP.yl = yl; JP.spurt = spurt;
  // (the shallow throw first, then steeper starts; for each, from the 2D app's landing back toward the tear, step 2: the first that keeps the whole path
  // and the landing clear is the farthest the stream
  //  may be thrown; none at all, the roomiest of every one tried)
  const dir = aim >= x0 ? -1 : 1, n = Math.max(0, Math.ceil(Math.abs(aim - x0) / 2)), drop = Math.max(14, yl - y0);
  let best = -Infinity, bx = x0, bl = 0, bp = 0, bf = liftOf(spurt), found = false;
  const lifts = [liftOf(spurt), ...STEEPER.filter((l) => -l < drop * 0.9)];
  for (let k = 0; k < lifts.length && !found; k++) {
    JP.lift = lifts[k]!;
    for (let i = 0; i <= n && !found; i++) {
      const xl = i === n ? x0 : aim + dir * 2 * i;
      JP.xl = xl;
      const pc = slackOf(JP), lc = lumenClearance(xl, yl);
      const score = Math.min(1 + pc / STREAM_MARGIN, lc / SPLASH_MARGIN, 1);
      if (score > best + 1e-9) { best = score; bx = xl; bp = pc; bl = lc; bf = lifts[k]!; }
      if (score >= 1) found = true;
    }
  }
  FIT.x0 = x0; FIT.y0 = y0; FIT.xl = bx; FIT.yl = yl; FIT.lift = bf; FIT.pathClear = bp; FIT.landClear = bl;
  return FIT;
}
