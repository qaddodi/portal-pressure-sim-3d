// The finer rows of the lobule: round the sinusoid view's station the 3D lobule grows the view's own layout (the rows of sinusoids and the one-cell plates between
//  them), so that when the camera goes down to the sinusoid every
// lumen and plate on screen is already where the view draws it and nothing but finer detail arrives (Mohammad, 27 Nov: "zoom from anatomy to lobule to sinusoid ...
//  every zoom out should feel like one continuous zoom; now
// the lobule disappears and the sinusoid view appears"). A real hepatocyte plate is one cell thick with a sinusoid either side of it, so the view's rows are the
//  truer picture and the lobule's gaps of about 85 µm (2D's
// simplification, cords a few cells thick) are what the zoom refines. Each row's axis is the view's own (a line at k row spacings across the station's sinusoid,
//  along the flow, sinusoidLocal), and a stretch of it is
// drawn only where no sinusoid of the lobule already lies on it (within COVER_UM and COVER_DEG), so the lobule's own tubes stay the ones drawn wherever they agree.
//
// They are as wide as the view's lumen and as the lobule's own tubes, so they fade in by their size on screen (fineShare: a pure function of the camera's distance,
//  the same going in and out), from nothing at the
// lobule's own framing to whole by the time the view begins to come in.
import type { LobuleNet, Course, P2 } from '../lobule/geometry.ts';
import { LOBULE_SCALE, SIN_REL, sinusoidLocal } from '../lobule/frames.ts';
import { LOBULE_R } from '../lobule/sizes.ts';
import { PERIOD, UM, CELL, SEED, cellOf, h1 } from '../sinusoid/layout.ts';
import { restDisseW, restHalfW } from './sinusoid-shape.ts';
import { U } from '../sinusoid/view.ts';
import { BEYOND } from './sinusoid3d.ts';

/** One µm of the view in the lobule's local units. */
export const UM_LOCAL = U * SIN_REL;
/** How far along the flow (µm each way) the rows are laid: past what the camera shows when they are whole (about 150 µm each way at the first share the view is drawn, 0.25, on a wide screen). */
export const FINE_REACH = 200;
/** The spacing of the samples along a row (µm). */
export const FINE_STEP = 5;
/** The rows' lumen axes, in row spacings from the station's own sinusoid: the view draws the main sinusoid and BEYOND rows each side (sinusoid3d.ts), so the lobule grows as many. */
export const FINE_BEYOND = BEYOND;
/** A stretch of a row is "already there" where a sinusoid of the lobule lies within this many µm and degrees of it. */
export const COVER_UM = 3, COVER_DEG = 3;
/** The fade's window: the tube's width on screen as a share of the picture's height. Nothing below FINE_FROM, whole from FINE_TO. (Mohammad's 1.5 px to 4 px does
 *  not hold here: the view's lumen is 10 µm, as wide as the lobule's
 *  own tubes, 3 px on a phone and 8 on a Mac at the lobule's own framing, so a window of 1.5 to 4 px would be whole there. As a share of the picture's height the
 *  lobule's framing is 1.4 % on every screen, the sinusoid's own
 *  station 3.3 % and the view's landing 10 %: this window is dark at the station's framing and whole by a share of 0.4 of the dive.) */
export const FINE_FROM = 0.035, FINE_TO = 0.08;
/** The tube's drawn width (local units): the view's lumen. */
export const FINE_WIDTH = 2 * UM.lum * UM_LOCAL;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of the fine rows show at a camera `distance` (scene units) from the station, for a picture `heightPx` CSS px tall and a lens `fovDeg`: by the tube's
 *  width as a share of the picture's height. A pure
 *  function of the distance (nothing of the dive's direction or speed), so going in and coming out are one picture. */
export function fineShare(distance: number, heightPx: number, fovDeg: number, tubeWidth = FINE_WIDTH * LOBULE_SCALE): number {
  if (!(distance > 0) || !(heightPx > 0)) return 1;
  const px = (tubeWidth * heightPx) / (2 * Math.tan((fovDeg * Math.PI) / 360) * distance);
  return smooth(FINE_FROM, FINE_TO, px / heightPx);
}

/** A point of the view (µm along the flow, µm across, up) in the lobule's local units. */
export const viewToLobule = (x: number, y: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] => sinusoidLocal([x * U, y * U, 0], out);

export interface Seg2 { ax: number; ay: number; bx: number; by: number; a: number }
/** The lobule's blood sinusoids as segments (local units) with their direction: what a row is tested against. */
export function sinusoidSegments(net: LobuleNet): Seg2[] {
  const out: Seg2[] = [];
  for (const c of net.courses) {
    if (c.kind !== 's0' && c.kind !== 's1' && c.kind !== 's2') continue;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i]!, b = c.pts[i + 1]!, ax = a[0] * LOBULE_R, ay = -a[1] * LOBULE_R, bx = b[0] * LOBULE_R, by = -b[1] * LOBULE_R;
      out.push({ ax, ay, bx, by, a: Math.atan2(by - ay, bx - ax) });
    }
  }
  return out;
}
const lineTurn = (a: number, b: number): number => { const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI); return (Math.min(d, Math.PI - d) * 180) / Math.PI; };
/** The distance (µm) from a point to the nearest sinusoid segment of the lobule whose direction is within `deg` of `angle` (Infinity when none). */
export function nearestSinusoid(segs: readonly Seg2[], x: number, y: number, angle: number, deg = COVER_DEG): number {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - (s.ax + t * dx), y - (s.ay + t * dy)) / UM_LOCAL;
    if (d < best && lineTurn(s.a, angle) <= deg) best = d;
  }
  return best;
}

export interface FineRow { k: number; y: number; runs: [number, number, number][][] }
/** The rows' stretches the lobule lacks: for each row (k = -FINE_BEYOND .. FINE_BEYOND, y = k spacings across), the runs of points (local units, x y z) along the
 *  flow, FINE_REACH each way, where no sinusoid of the lobule lies
 *  on the row. Each run is extended one step into the covered stretch each side so the new tube meets the old one. Row k is the view's own axis: the main sinusoid (k 0) and the rows BEYOND it. */
export function fineRows(net: LobuleNet, z = 0): FineRow[] {
  const segs = sinusoidSegments(net), flow = Math.atan2(sinusoidLocal([1, 0, 0])[1] - sinusoidLocal([0, 0, 0])[1], sinusoidLocal([1, 0, 0])[0] - sinusoidLocal([0, 0, 0])[0]);
  const rows: FineRow[] = [];
  const n = Math.round(FINE_REACH / FINE_STEP);
  for (let k = -FINE_BEYOND; k <= FINE_BEYOND; k++) {
    const y = k * PERIOD, pts: [number, number, number][] = [], cov: boolean[] = [];
    for (let i = -n; i <= n; i++) {
      const p = viewToLobule(i * FINE_STEP, y); p[2] = z;
      pts.push(p); cov.push(nearestSinusoid(segs, p[0], p[1], flow) <= COVER_UM);
    }
    const runs: [number, number, number][][] = [];
    let from = -1;
    for (let i = 0; i <= pts.length; i++) {
      const open = i < pts.length && !cov[i];
      if (open && from < 0) from = i;
      else if (!open && from >= 0) { runs.push(pts.slice(Math.max(0, from - 1), Math.min(pts.length, i + 1))); from = -1; }
    }
    rows.push({ k, y, runs: runs.filter((r) => r.length >= 2) });
  }
  return rows;
}

/** The rows' runs as courses the lobule's own tube builder takes (net radii, y down; a blood sinusoid of the second generation: its colour, width and flow marks are the lobule's). */
export function fineCourses(net: LobuleNet, z = 0): Course[] {
  const out: Course[] = [];
  let id = 900000;
  for (const row of fineRows(net, z)) for (const run of row.runs) {
    const pts: P2[] = run.map((p) => [p[0] / LOBULE_R, -p[1] / LOBULE_R]);
    out.push({ id: id++, kind: 's1', pts, len: pts.length, rho: pts.map((p) => Math.hypot(p[0], p[1])) });
  }
  return out;
}

/** The plates between the rows (the view's own: the main plate each side of the station's sinusoid, and the BEYOND plates), as the view lays them: for band k
 *  (between row k and k+1, k = -FINE_BEYOND-1 .. FINE_BEYOND) and each cell j its
 *  seed and outline factors. `bands()` lists them; cells are cut along the flow over FINE_REACH. */
export interface FineBand { k: number; side: -1 | 1; r: number; seed: number; face: (x: number) => number }
export function fineBands(): FineBand[] {
  const out: FineBand[] = [];
  // (the view draws plates on the upper side (-1) as r = 0 .. BEYOND from the main sinusoid up, the lower (+1) the same down; face: where the plate's Disse side stands, µm from the axis)
  for (const side of [-1, 1] as const) for (let r = 0; r <= FINE_BEYOND; r++) {
    const seed = (side < 0 ? SEED.plateUp : SEED.plateDn) + (r > 0 ? 101 * r : 0);
    out.push({ k: side < 0 ? r : -(r + 1), side, r, seed, face: (x) => restHalfW(x) + UM.endo + restDisseW(x) + r * PERIOD });
  }
  return out;
}
/** The cells of a band over the stretch the rows cover. */
export function fineCellRange(): [number, number] { return [Math.floor(-FINE_REACH / CELL) - 1, Math.ceil(FINE_REACH / CELL) + 1]; }
export { cellOf, h1 };
