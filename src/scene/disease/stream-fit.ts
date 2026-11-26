// Where the bleeding stream leaves, and where it lands, so that it stays INSIDE the esophagus and the stomach for any fill level (Mohammad, 26 Nov: it
// started right of the esophagus, arced out over the
// gap beside it, and looked outside the organs; he asked for it to start at the esophagus's far left wall, with a shallow arc). One pure place, read by
// the jet (bleed.ts), by the pool's ripples that run
// out from the landing (organs/pool-level.ts poolUniforms) and by the mark at the tear (tear.ts), so the three never part.
//
// The stream is a parabola, thrown out from the tear and falling to the landing on the pool's surface (jet.ts pathAt). Its throw is what makes it arc, so the way to keep it in is to throw it no
// farther than the organs allow: the landing is the farthest point toward the 2D app's own landing at which every point of the path is `STREAM_MARGIN` clear of the wall and the landing itself is
// `SPLASH_MARGIN` clear (the splash drops spread about that far). The wall is the real mesh as the screen covers it (lumen.ts), notch beside the esophagus and all.
import { SITES } from './copied/anatomy-b4.ts';
import { lumenClearance } from './lumen.ts';
import { pathAt, spurtOf, type JetParams, type PathPoint } from './jet.ts';

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

const gridX = (y: number): number => {
  // (the first x, from the left, with room for the stream: the far left wall of the esophagus at the tear's height)
  for (let x = 700; x < 1000; x += 0.5) if (lumenClearance(x, y) >= STREAM_MARGIN) return x;
  return SITES.varix![0]!;
};

const TEAR: Record<BleedSite, readonly [number, number]> = {
  VAR: [0, SITES.varix![1]! + VAR_TEAR_DROP],
  GV: [SITES.fundus![0]!, SITES.fundus![1]! - 3],
};
let varX: number | null = null;
/** The tear's point (figure units, x right, y down): the esophageal varix's at the esophagus's far left wall, the gastric varix's at the fundus. */
export function tearOf(site: BleedSite): readonly [number, number] {
  if (site === 'GV') return TEAR.GV;
  if (varX === null) varX = gridX(TEAR.VAR[1]);
  return [varX, TEAR.VAR[1]];
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
