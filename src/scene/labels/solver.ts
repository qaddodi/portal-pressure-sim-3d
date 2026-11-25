// THE label solver: one place decides where every label of the figure stands (parity plan B6: "one solver: labels never under cards").
// Pure numbers in, numbers out: no DOM, no three.js, no history. The same input always gives the same answer, so a reload, a replay or a
// slide jump never lays the figure out differently (2D lesson of 16 Nov: a solve that read its own past made labels differ per reload).
//
// Rules, in the order the 2D app's solver learned them:
//  1. A label never stands under a card, the presenter bar, the key or the strip (the blockers), and never off the view.
//  2. A label never overlaps another label, another station's dot, or a leader line; it avoids vessels (a soft cost; a hard rule for an `offVessels` name, which gives way instead).
//  3. A label with room beside its vessel has no leader; one that stands more than LEAD_ON px away gets one.
//  4. A crowded label shortens by forms (full name, then the abbreviation, then the number alone) before it is dropped.
//  5. A `must` label (a station the slide names, the picked vessel) is searched all the way round and is dropped last.
//  6. A station whose vessel is partly under a card slides its dot along the vessel to the middle of the part in view.
//
// A label's own standing spot (`was`) is worth `stay` to it: the answer then depends on where the label stands, as the fader keeps it; with no `was` the same input still gives the same answer.
// Higher `pri` wins when space is short; ties break by id, so the order is total.

import { COMPASS, RING_SPOTS, type Box, type Dir, boxGap, crosses, grow, hits, nearestOn, offsetOf, segsCross, within } from './geometry.ts';

export interface Form { text: string; w: number; h: number; /** a form that has let its unit, change badge and alert go for room (2D shortenItem): the number stays */ bare?: boolean }

export interface Item {
  id: string;
  /** The station's dot on the canvas now (CSS px), and where along `path` it stands (0..1; 0.5 = the vessel's middle). */
  ax: number; ay: number; au: number;
  /** The vessel's course on the canvas, evenly spaced along its length: the dot may slide along it (rule 6) and may be moved off a crowded neighbour. */
  path?: readonly (readonly [number, number])[];
  /** Where along `path` the dot may stand (u 0..1): only where its own vessel is the one seen there (stations.ts `rests`). Absent: anywhere. */
  rests?: (u: number) => boolean;
  /** The label's padding round its words (px): its leader is drawn to the words' box, so it is judged there (the box's corner let a leader the solver passed clip a neighbour as drawn). */
  pad?: { x: number; y: number };
  /** Widest form first. */
  forms: readonly Form[];
  pri: number;
  must?: boolean;
  /** Preferred sides, tried first in this order. */
  dirs?: readonly Dir[];
  /** A region's name (an organ) is drawn on what it names and never has a leader. */
  region?: boolean;
  /** An organ's name: the other places it may stand (centres of its box, px from the dot, nearest first: the 2D app's nameSpots on the screen), tried when
   *  its own place is under a vessel; and whether a box lies on another organ, which it keeps off where it can ("organs first where it can be, never left off for it"). */
  spots?: readonly (readonly [number, number])[];
  onOther?: (box: Box) => boolean;
  /** How much of a box (0 to 1) lies on another organ: priced in the last resort, once no spot keeps off them all. */
  otherShare?: (box: Box) => number;
  /** A tract name stands on the side its vessel faces: from the hub (cx, cy; the venule) along the unit spoke (ux, uy). A box whose middle turns more than 60 degrees from it is on the wrong side
   *  of the tract and costs as much as two crossed leaders (2D lobule-tract-labels.js fanCost: FACE_COS .5, CLASH), placed still, never left out for it. */
  face?: { cx: number; cy: number; ux: number; uy: number };
  /** Half the vessel's width on the canvas, so a label starts clear of it. */
  vw?: number;
  /** A name of a vessel that always shows its leader and ring (2D's lobule: a name keeps a visible stretch of leader and never sits right over what it names, lobule-zoom-records.js `Math.max(0, 16 - lead)`):
   *  the words stand at least this many px from the vessel's edge, so the gap is over LEAD_ON and the leader is drawn. Not enforced on the last resort of a `must` label. */
  minLead?: number;
  /** The words stand clear of every line in `lines` (the courses drawn under them: a name over the sinusoids is hard to read), searched round the dot as far as CLEAR_MAX; only when no such spot
   *  exists does it take the cheapest one with a line under it. */
  /** A name never stands on vessels (owner, 25 Nov, after 2D's rule of 4 Nov: "when there is no room we shouldn't have labels covering the portal vein and structures completely"): no spot of a station's
   *  name, near or far, last resort or not, has a vessel line under it; where none is clear it gives way (it is left out and fades as names do), and a lower ranked name gives way for it first when
   *  that lets it in (see the yield passes in `solve`). The near ring had still taken a spot over the lines at a cost of 8 a line, whatever their number: on the phone "Right hepatic vein" stood over 113
   *  line pieces of the hepatic vein knot, with strokes through "SMV" too. The reader's own choices (the picked vessel, what a slide names or shows), a stent's labels and the hepatic artery keep the old rule. */
  offVessels?: boolean;
  /** A name whose figure fills the view with vessels (the lobule's net): a far spot with a vessel under it is allowed, at its line cost, before the name is given up, as 2D's lobule orders
   *  append the unclear spots after the clear ones (stage-label-solve.js `{ gap: near, leader: false }, { gap: far, leader: true }`). The Anatomy and Circuit "every far spot is clear" rule (5316a81e) does not apply to it. */
  looseFar?: boolean;
  clearLines?: boolean;
  /** For a `clearLines` name: the side (a unit vector on the canvas) it prefers to go to when it must stand off, as 2D puts the central vein's name on the side away from the tract (the nearer clear spots on the other side cost more). */
  prefer?: readonly [number, number];
  /** The longest leader (px from the dot) this item may take on the ordinary passes; default LONG_LEAD + the vessel's width + 10. */
  reach?: number;
  /** An optional name (the 2D app's `minor`: a station shown only where it fits): whole (its first form), beside its vessel with no leader and on no vessel line, or not at all. It takes no room from a name that
   *  was asked for (ranked last) and is never counted as dropped (`skipped` lists it). */
  optional?: boolean;
  /** Where the label stands now (the form and the box's offset from its dot): a spot within STAY_PX of it, once legal under every rule, costs `stay` less, so a label moves only when the new spot is better by more than that (plan 27). */
  was?: { form: number; dx: number; dy: number; /** where along `path` its dot stood (a slid dot keeps its place while that is still clear, rather than sliding again from the middle) */ au?: number };
}

export interface SolveInput {
  /** What standing where it is is worth to a label (cost units, as a spot's own cost): the tuned STAY at rest, Infinity while the picture is still moving (a label then moves only when its spot became illegal). Absent: 0. */
  stay?: number;
  items: readonly Item[];
  /** The canvas area labels may use (inside the safe areas). */
  view: Box;
  /** Everything a label may never touch: cards, the presenter bar, the strip, the key. */
  blockers: readonly Box[];
  /** The vessels' centrelines on the canvas, [x0, y0, x1, y1]: a label avoids standing on them (a cost, not a ban). */
  lines?: readonly Line[];
  /** Discs of vessels seen end-on (a portal venule's, a central vein's): a label never stands on one nor does a leader run across one, except the item that names it (`id`); 2D's lobule keeps the same (lobule-tract-labels.js fanCost). */
  keep?: readonly { id: string; x: number; y: number; r: number }[];
  /** Set (above 0): a label's leader never crosses a vessel line (past the vessel the dot stands on): a name stands beside its vessel or on a leader with a clear route, never on one drawn across the sinusoids
   *  (Circuit, phone and iPad, 20 and 22 Nov: "Middle hepatic vein" hung from a diagonal leader across the ovals). A rule, not a cost: only a `must` label's last resort (relax 2) may cross, at this cost per line, up to four. 0 or absent: none. */
  leaderLineCost?: number;
  /** A diagnostic (`?capwhy`): filled with, for each item, how many of its near spots (cost under 20) each rule threw out, and who the label or dot in the way was. */
  why?: Map<string, Record<string, number>>;
}

export interface Placement {
  id: string;
  /** Index into the item's forms. */
  form: number;
  /** The box's top-left corner relative to the dot (so the label follows the dot while the camera moves). */
  dx: number; dy: number; w: number; h: number;
  leader: boolean;
  /** Where along the vessel the dot stands (the layer places it there each frame). */
  au: number;
}

export interface Solved {
  placed: Placement[];
  /** Items with no clear spot at all (never a must item in the slice's framings; a test says so). */
  dropped: string[];
  /** Items whose vessel is wholly out of view or under a card: nothing to label. */
  hidden: string[];
  /** Optional items that found no clear spot beside their vessel (not an error). */
  skipped: string[];
}

// Tuning (px). One place, so a change is one change.
export const LEAD_ON = 12;
export const AIR_BLOCKER = 6;
export const AIR_LABEL = 4;
export const DOT_ROOM = 40;
export const VIEW_INSET = 8;
const SLIDE_INSET = 18;
const SHORT_LEAD = 45, LONG_LEAD = 60;
const WIDE_GAPS = [40, 58, 76, 96, 120];
const FORM_COST = 50;
/** Spots this near (px, dx and dy) to where a label stands are its standing spot: a readout's width ticking by a few px does not make a new spot. */
export const STAY_PX = 8;
/** The worth of standing where it is at rest: one long leader (LONG_LEAD), so a real need to move (a spot worth a leader's length less) still wins, and no flicker of a few cost units does. */
export const STAY = 60;
/** The least cost of a spot past the near ring (the compass gaps cost 2 a step, under this): the wide gaps and every ring beyond. */
const NEAR_COST = 20;
/** The least cost of a spot of the wide search (RING_SPOTS): the far last-resort spots. */
const RING_COST = 100;
const LINE_COST = 8;
/** Air kept between a `clearLines` name and a line (px): half a tube's width as drawn, the ink beside it and a little. */
export const LINE_AIR = 3;
const DROP_ROUNDS = 3;
/** At most this many more passes in which a name left out stands first and one lower ranked name stands last (see `solve`): enough for the few names a small figure leaves out, bounded so a solve stays short. */
const YIELD_TRIES = 8;
/** What a clear spot on the side opposite the preferred one costs over one on it (px of leader at 0.1 each, as 20 px more). */
const PREFER_COST = 12;
const CLEAR_STEP = 10, CLEAR_MAX = 340, CLEAR_ANGLES = 36;
/** The furthest a box's centre stands from its dot on any search (the clear rings; the wide gaps and the callout gaps are far inside it), px, plus the dot room: what a spot's neighbours are found within. */
const RING_REACH = CLEAR_MAX + 20;
/** The spots of an item that must stand clear of the lines: the box's centre on rings about the dot, nearest ring first. */
const CLEAR_SPOTS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let r = 24; r <= CLEAR_MAX; r += CLEAR_STEP) for (let a = 0; a < CLEAR_ANGLES; a++) out.push([Math.round(r * Math.cos((a * 2 * Math.PI) / CLEAR_ANGLES)), Math.round(r * Math.sin((a * 2 * Math.PI) / CLEAR_ANGLES)), r]);
  return out;
})();
/** An organ's name under a vessel steps to the next spot of its organ that no vessel touches (the 2D app: the first spot no vessel touches), so a crossing costs more than any step. */
const REGION_LINE_COST = 60;
/** A region's name wholly on another organ costs this (a line costs 60 a hit): in the last resort it stands on its own organ over a vessel or two before it leaves it. */
const OTHER_COST = 200;

type Seg = [number, number, number, number];
/** A vessel's centreline piece [x0, y0, x1, y1] and, optionally, half the width it is drawn at (px): a name stands that much further from it, so its words never lie on the tube's edge or its glow
 *  (the Circuit's "MHV" stood in the gap between two tubes with its halo over both, a box on the pale tube, 22 Nov). Absent: a hairline. */
export type Line = readonly [number, number, number, number, number?];
/** Whether a line, drawn at its own width and `air` more, passes through the box. */
export const onLine = (l: Line, box: Box, air: number): boolean => crosses(l[0], l[1], l[2], l[3], grow(box, air + (l[4] ?? 0)));

/** The lines in a grid of cells, so a box or a leader asks only the few lines near it (the solver's cost was candidates x every line of the figure, about 100 ms a solve on a Mac: the stall on leaving a talk, opening a view or a patient glide).
 *  A line is entered in every cell its box (grown by its own half width) touches; a query names every line whose box, grown by `air`, may touch the asked box. The exact tests then run on those few only. */
const GRID_CELL = 48;
export class LineGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Uint32Array;
  private readonly lines: readonly Line[];
  /** (a line too long for the grid, or without a finite end: always asked) */
  private readonly far: number[] = [];
  private stamp = 0;
  constructor(lines: readonly Line[]) {
    this.lines = lines;
    this.seen = new Uint32Array(lines.length);
    lines.forEach((l, i) => {
      const w = l[4] ?? 0;
      const x0 = Math.floor((Math.min(l[0], l[2]) - w) / GRID_CELL), x1 = Math.floor((Math.max(l[0], l[2]) + w) / GRID_CELL);
      const y0 = Math.floor((Math.min(l[1], l[3]) - w) / GRID_CELL), y1 = Math.floor((Math.max(l[1], l[3]) + w) / GRID_CELL);
      if (!Number.isFinite(x0 + x1 + y0 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 4096) { this.far.push(i); return; }
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cx * 65536 + cy; const c = this.cells.get(k); if (c) c.push(i); else this.cells.set(k, [i]); }
    });
  }
  /** Calls `visit(line)` once for each line that may touch the box grown by `air`; stops when it returns true. Returns whether it did. */
  some(x0: number, y0: number, x1: number, y1: number, air: number, visit: (l: Line) => boolean): boolean {
    const st = ++this.stamp;
    for (const i of this.far) if (visit(this.lines[i]!)) return true;
    const cx0 = Math.floor((x0 - air) / GRID_CELL), cx1 = Math.floor((x1 + air) / GRID_CELL), cy0 = Math.floor((y0 - air) / GRID_CELL), cy1 = Math.floor((y1 + air) / GRID_CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const c = this.cells.get(cx * 65536 + cy);
      if (!c) continue;
      for (const i of c) { if (this.seen[i] === st) continue; this.seen[i] = st; if (visit(this.lines[i]!)) return true; }
    }
    return false;
  }
}
/** Air kept between a label and the disc of a vessel seen end-on (px). */
const KEEP_AIR = 3;
export const FACE_COS = 0.5, FACE_CLASH = 1e5;
/** The distance from (x, y) to a segment. */
function segDist(s: Seg, x: number, y: number): number {
  const vx = s[2] - s[0], vy = s[3] - s[1], l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - s[0]) * vx + (y - s[1]) * vy) / l2)) : 0;
  const ex = s[0] + vx * t - x, ey = s[1] + vy * t - y;
  return Math.sqrt(ex * ex + ey * ey);
}

/** The least distance between two segments (0 when they cross). */
function segsDist(a: Seg, b: Seg): number {
  if (segsCross(a, b)) return 0;
  return Math.min(segDist(b, a[0], a[1]), segDist(b, a[2], a[3]), segDist(a, b[0], b[1]), segDist(a, b[2], b[3]));
}
/** Air a leader keeps from a tube's drawn edge, px: a hairline squeezed between two tubes (the hepatic artery's, down the gap of the sinusoid bundle) is as much "through the vessels" as one across them. */
export const LEADER_AIR = 8;
/** Whether a leader runs through a vessel's drawn band or closer than LEADER_AIR to its edge; the vessel the dot itself stands on (within its band and 2 px) is not counted. Only a line that carries its width. */
export function leaderTouches(from: Seg, l: Line, ax: number, ay: number): boolean {
  const w = l[4] ?? 0, s: Seg = [l[0], l[1], l[2], l[3]];
  if (segDist(s, ax, ay) < w + 2) return false;
  const r = w + LEADER_AIR;
  if (Math.max(from[0], from[2]) + r < Math.min(s[0], s[2]) || Math.min(from[0], from[2]) - r > Math.max(s[0], s[2]) || Math.max(from[1], from[3]) + r < Math.min(s[1], s[3]) || Math.min(from[1], from[3]) - r > Math.max(s[1], s[3])) return false;
  return segsDist(from, s) < r;
}

function clearPoint(x: number, y: number, view: Box, blockers: readonly Box[]): boolean {
  if (x < view.x0 + SLIDE_INSET || x > view.x1 - SLIDE_INSET || y < view.y0 + SLIDE_INSET || y > view.y1 - SLIDE_INSET) return false;
  for (const b of blockers) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return false;
  return true;
}

/** The point u (0..1) along a polyline of samples. */
export function pointAlong(path: readonly (readonly [number, number])[], u: number): [number, number] {
  const n = path.length - 1;
  if (n < 1) return [path[0][0], path[0][1]];
  const f = Math.min(Math.max(u, 0), 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
}

/** Rule 6: the dot of a vessel whose middle is not clear stands at the middle of the longest run of the vessel that is. Null: none is. */
export function slideInView(path: readonly (readonly [number, number])[], view: Box, blockers: readonly Box[], rests?: (u: number) => boolean): { u: number; x: number; y: number } | null {
  const STEPS = 100;
  let from = -1, b0 = -1, b1 = -1;
  for (let n = 0; n <= STEPS; n++) {
    const [x, y] = pointAlong(path, n / STEPS);
    if (clearPoint(x, y, view, blockers) && (!rests || rests(n / STEPS))) { if (from < 0) from = n; if (b0 < 0 || n - from > b1 - b0) { b0 = from; b1 = n; } } else from = -1;
  }
  if (b0 < 0) return null;
  const u = (b0 + b1) / 2 / STEPS, [x, y] = pointAlong(path, u);
  return { u, x, y };
}

// Dots kept apart: where two stations' dots stand closer than DOT_ROOM, the lower ranked slides along its own vessel to the nearest clear point.
const SLIDES = [0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
/** A name nobody asked for stands at most this far from its vessel (the length of its leader, px). */
export const NAME_LEAD_MAX = 88;
function spreadDots(items: Anchored[], view: Box, blockers: readonly Box[]): void {
  // (a dot gives way only to a more important one: the portal confluence never slides off its vessel's middle because the hepatic artery, which runs beside it and is named last, could not find a clear place)
  const near = (it: Anchored, x: number, y: number) => items.some((o) => o !== it && rank(o, it) < 0 && Math.hypot(o.ax - x, o.ay - y) < DOT_ROOM);
  for (const it of [...items].sort(rank).reverse()) {
    if (!near(it, it.ax, it.ay) || !it.path) continue;
    // (a dot the label already stood on, slid off the middle, stays there while it is still clear: sliding again from the middle as the picture turns moved a label whose spot was legal: the hepatic
    //  artery's name on the placed hilum, where every spot is within DOT_ROOM of another dot)
    for (const u of it.was?.au !== undefined && it.was.au !== it.au ? [it.was.au, ...SLIDES] : SLIDES) {
      const [x, y] = pointAlong(it.path, u);
      if (!near(it, x, y) && clearPoint(x, y, view, blockers) && (!it.rests || it.rests(u))) { it.ax = x; it.ay = y; it.au = u; break; }
    }
  }
}

type Anchored = Item & { ax: number; ay: number; au: number };
const rank = (a: Item, b: Item) => (Number(!!b.must) - Number(!!a.must)) || (b.pri - a.pri) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Cand { dx: number; dy: number; cost: number }

function candidates(it: Anchored, f: Form, wide: boolean): Cand[] {
  const out: Cand[] = [];
  if (it.region) {
    const [dx, dy] = offsetOf('C', f.w, f.h, 0);
    return [{ dx, dy, cost: 0 }, ...(it.spots ?? []).map(([cx, cy], i) => ({ dx: cx - f.w / 2, dy: cy - f.h / 2, cost: 1 + i * 0.4 }))];
  }
  const gap0 = Math.max(12, (it.vw ?? 3) + 8, it.minLead ? (it.vw ?? 0) + it.minLead + 1 : 0);
  const order: Dir[] = [...(it.dirs ?? []), ...COMPASS.filter((d) => !(it.dirs ?? []).includes(d))];
  order.forEach((d, i) => { const [dx, dy] = offsetOf(d, f.w, f.h, gap0); out.push({ dx, dy, cost: i * 2 }); });
  WIDE_GAPS.forEach((g, gi) => order.forEach((d, i) => { const [dx, dy] = offsetOf(d, f.w, f.h, g + (it.vw ?? 0)); out.push({ dx, dy, cost: 20 + gi * 8 + i }); }));
  if (wide) RING_SPOTS.forEach(([cx, cy], i) => out.push({ dx: cx - f.w / 2, dy: cy - f.h / 2, cost: RING_COST + i * 0.2 }));
  if (it.clearLines) CLEAR_SPOTS.forEach(([cx, cy, r]) => out.push({ dx: cx - f.w / 2, dy: cy - f.h / 2, cost: 30 + r * 0.1 + (it.prefer ? (1 - (cx * it.prefer[0] + cy * it.prefer[1]) / r) * PREFER_COST : 0) }));
  return out;
}

/** The spot a label stands at, judged as it stands (its own offset from the dot), ahead of the search's spots: the nearest search spot can lie a few px off it (a side spot's offset follows the words'
 *  width, which a ticking reading changes), and judging that one instead moved a label whose own spot was still legal while the picture turned (Mac slow drag: "MHV" left a clear spot because the spot
 *  8 px from it grazed a line). It costs what the nearest search spot within STAY_PX costs; with none (the label stands where the search no longer reaches) it is not offered. */
function withStanding(it: Anchored, fi: number, cands: Cand[], stay: number): Cand[] {
  const w = it.was;
  if (!w || stay <= 0 || w.form !== fi || !Number.isFinite(w.dx + w.dy)) return cands;
  let near: Cand | null = null, d = Infinity;
  for (const c of cands) { const e = Math.max(Math.abs(c.dx - w.dx), Math.abs(c.dy - w.dy)); if (e <= STAY_PX && e < d) { d = e; near = c; } }
  return near && d > 0 ? [{ dx: w.dx, dy: w.dy, cost: near.cost }, ...cands] : cands;
}

export function solve(input: SolveInput): Solved {
  const { view, lines = [], keep = [], leaderLineCost = 0, stay = 0 } = input;
  const grid = new LineGrid(lines);
  const blockersAir = input.blockers.map((b) => grow(b, AIR_BLOCKER));
  // (the last resort for a label that must stand: it may touch a card's edge, never lie under it)
  const blockersRaw = input.blockers;
  const inner: Box = { x0: view.x0 + VIEW_INSET, y0: view.y0 + VIEW_INSET, x1: view.x1 - VIEW_INSET, y1: view.y1 - VIEW_INSET };
  const hidden: string[] = [];
  const items: Anchored[] = [];

  // rule 6: dots in the clear
  for (const raw of input.items) {
    const it: Anchored = { ...raw };
    if (!clearPoint(it.ax, it.ay, view, input.blockers)) {
      const s = it.path ? slideInView(it.path, view, input.blockers, it.rests) : null;
      if (!s) { hidden.push(it.id); continue; }
      it.ax = s.x; it.ay = s.y; it.au = s.u;
    }
    items.push(it);
  }
  spreadDots(items, view, input.blockers);

  let placedBoxes: { id: string; box: Box; /** the box with AIR_LABEL round it (a label keeps that from it) and with 1 px (a leader may not cross it), made once */ air: Box; near: Box }[] = [];
  let leaders: { id: string; seg: Seg }[] = [];
  let placed: Placement[] = [];
  let dropped: string[] = [];
  let skipped: string[] = [];

  const tryItem = (it: Anchored, relax: 0 | 1 | 2, offOrgans = false, strictLines = false, nearOnly = false, standOnly = false, maxLead = it.offVessels ? NAME_LEAD_MAX : Infinity) => {
    const blockers = relax >= 2 ? blockersRaw : blockersAir;
    let best: { cost: number; form: number; c: Cand; box: Box; leader: boolean; seg: Seg | null; hits: number } | null = null;
    const tally = input.why ? (input.why.get(it.id) ?? (input.why.set(it.id, {}), input.why.get(it.id)!)) : null;
    const no = (c: Cand, reason: string): void => { if (tally) { const k = (c.cost < NEAR_COST ? '' : c.cost < RING_COST ? 'wide:' : 'ring:') + reason; tally[k] = (tally[k] ?? 0) + 1; } };
    for (let fi = 0; fi < (nearOnly ? 1 : it.forms.length); fi++) {
      const f = it.forms[fi];
      // (the other dots a box of this form could stand within 9 px of: none further than the widest spot of the search, so the per-spot test asks these few, not every item)
      const reach = RING_REACH + f.w + f.h;
      // (an organ's anchor is no dot: its name is drawn on the organ with no ring or leader, so nothing marks the point; counting it kept "Left sinusoids" off the one clear spot near the spleen's middle)
      const dots = relax < 2 ? items.filter((o) => o !== it && !o.region && !gone.has(o.id) && Math.abs(o.ax - it.ax) < reach && Math.abs(o.ay - it.ay) < reach) : [];
      {
        for (const c of withStanding(it, fi, candidates(it, f, !!it.must || relax > 0), stay)) {
          if (nearOnly && c.cost >= 20) continue;   // (an optional name: the ring beside its vessel only)
          // (a spot whose own cost already reaches the best found cannot beat it: every penalty after this only adds. Skipped at once, not judged; `?capwhy` still judges them all, to count what threw each out)
          const bonus = it.was && stay > 0 && it.was.form === fi && Math.abs(c.dx - it.was.dx) <= STAY_PX && Math.abs(c.dy - it.was.dy) <= STAY_PX ? stay : 0;
          if (standOnly && bonus <= 0) continue;
          if (best && !tally && fi * FORM_COST + c.cost - bonus >= best.cost) continue;
          const box: Box = { x0: it.ax + c.dx, y0: it.ay + c.dy, x1: it.ax + c.dx + f.w, y1: it.ay + c.dy + f.h };
          if (!within(box, inner)) { if (tally) no(c, 'view'); continue; }
          if (offOrgans && it.onOther?.(box)) continue;
          let bad = false;
          for (const b of blockers) if (hits(box, b)) { bad = true; break; }
          if (bad) { if (tally) no(c, 'card'); continue; }
          for (const p of placedBoxes) if (hits(box, p.air)) { bad = true; if (tally) no(c, 'label:' + p.id); break; }
          if (bad) continue;
          if (!it.region) for (const k of keep) if (k.id !== it.id && boxGap(box, k.x, k.y) < k.r + KEEP_AIR) { bad = true; if (tally) no(c, 'disc:' + k.id); break; }
          if (bad) continue;
          for (const o of dots) if (o.ax > box.x0 - 9 && o.ax < box.x1 + 9 && o.ay > box.y0 - 9 && o.ay < box.y1 + 9 && boxGap(box, o.ax, o.ay) < 9) { bad = true; if (tally) no(c, 'dot:' + o.id); break; }
          if (bad) continue;
          // the dot's own place: a label never covers its own dot (a region's name, drawn on what it names, has none)
          if (!it.region && boxGap(box, it.ax, it.ay) < 3) { if (tally) no(c, 'ownDot'); continue; }
          // (measured from the vessel's edge as drawn, not from its middle: a label hugging a fat vein has no line)
          const gap = it.region ? 0 : boxGap(box, it.ax, it.ay) - (it.vw ?? 0);
          if (it.minLead && !it.region && relax < 2 && gap < it.minLead) { if (tally) no(c, 'minLead'); continue; }
          if (strictLines && grid.some(box.x0, box.y0, box.x1, box.y1, LINE_AIR, (l) => onLine(l, box, LINE_AIR))) continue;
          const leader = !it.region && gap > LEAD_ON;
          if (nearOnly && leader) continue;
          let seg: Seg | null = null;
          let pen = 0;
          if (leader) {
            const [px, py] = nearestOn(it.pad ? { x0: box.x0 + it.pad.x, y0: box.y0 + it.pad.y, x1: box.x1 - it.pad.x, y1: box.y1 - it.pad.y } : box, it.ax, it.ay);
            seg = [it.ax, it.ay, px, py];
            const len = Math.hypot(px - it.ax, py - it.ay);
            if (len > maxLead) { if (tally) no(c, 'maxLead'); continue; }
            if (len > (it.reach ?? LONG_LEAD + (it.vw ?? 0) + 10) && c.cost < 100) { if (tally) no(c, 'reach'); continue; }
            if (len > SHORT_LEAD) pen += (len - SHORT_LEAD) * 0.2;
            if (leaderLineCost > 0 && len > 1) {
              const k = Math.min(1, ((it.vw ?? 0) + 4) / len), from: Seg = [seg[0] + (seg[2] - seg[0]) * k, seg[1] + (seg[3] - seg[1]) * k, seg[2], seg[3]];
              let n = 0;
              grid.some(Math.min(from[0], from[2]), Math.min(from[1], from[3]), Math.max(from[0], from[2]), Math.max(from[1], from[3]), LEADER_AIR, (l) => { if (segsCross(from, [l[0], l[1], l[2], l[3]]) || (l[4] !== undefined && leaderTouches(from, l, it.ax, it.ay))) n++; return false; });
              if (n > 0 && relax < 2) { if (tally) no(c, 'leaderLine'); continue; }
              pen += leaderLineCost * Math.min(n, 4);
            }
            for (const b of blockers) if (crosses(seg[0], seg[1], seg[2], seg[3], b)) { bad = true; if (tally) no(c, 'leaderCard'); break; }
            if (bad) continue;
            for (const p of placedBoxes) if (crosses(seg[0], seg[1], seg[2], seg[3], p.near)) { bad = true; if (tally) no(c, 'leaderThrough:' + p.id); break; }
            if (bad) continue;
            for (const k of keep) if (k.id !== it.id && segDist(seg, k.x, k.y) < k.r) { bad = true; if (tally) no(c, 'leaderDisc:' + k.id); break; }
            if (bad) continue;
            if (relax < 1) for (const l of leaders) if (segsCross(seg, l.seg)) { bad = true; if (tally) no(c, 'leaderCross:' + l.id); break; }
            if (bad) continue;
          }
          // an earlier label's leader never runs through this box, whatever this label is (a region's name has no leader of its own: the right atrium's leader ran through RIGHT ATRIUM, phone play-test 20 Nov)
          for (const l of leaders) if (crosses(l.seg[0], l.seg[1], l.seg[2], l.seg[3], box)) { bad = true; if (tally) no(c, 'underLeader:' + l.id); break; }
          if (bad) continue;
          let lineHits = 0;
          grid.some(box.x0, box.y0, box.x1, box.y1, 0, (l) => { if (onLine(l, box, 0)) lineHits++; return false; });
          // a far spot of the wide search stands clear of the vessels, as 2D's (`clear: true` on every ring: "farther out on a leader, wholly on the stage"); only the last resort may stand on one.
          // (A line cost of 8 against a form's 50 had Lower IVC's wide form, with its change chip, 97 px up a leader on the varices' line in Compare on a phone, when its shorter form stood clear
          // nearer: every spot past the near ring, the wide gaps as much as the rings, is clear of the lines, and the narrower form is what gives. A callout and a region's name are placed by their own rules.)
          if (c.cost >= NEAR_COST && relax < 2 && lineHits > 0 && !it.region && !it.looseFar) { if (tally) no(c, 'line'); continue; }
          if (it.offVessels && lineHits > 0 && !it.region) { if (tally) no(c, 'line'); continue; }
          if (it.face) {
            const vx = (box.x0 + box.x1) / 2 - it.face.cx, vy = (box.y0 + box.y1) / 2 - it.face.cy, l = Math.hypot(vx, vy) || 1;
            if ((vx * it.face.ux + vy * it.face.uy) / l < FACE_COS) pen += FACE_CLASH;
          }
          if (!offOrgans && it.otherShare) pen += OTHER_COST * it.otherShare(box);
          const cost = fi * FORM_COST + c.cost - bonus + pen + lineHits * (it.region ? REGION_LINE_COST : LINE_COST);
          if (!best || cost < best.cost) best = { cost, form: fi, c, box, leader, seg, hits: lineHits };
        }
      }
    }
    if (!best) return false;
    if (tally) { tally['@relax'] = relax; tally['@form'] = best.form; tally['@lineHits'] = best.hits; tally['@spotCost'] = Math.round(best.c.cost); }
    placedBoxes.push({ id: it.id, box: best.box, air: grow(best.box, AIR_LABEL), near: grow(best.box, 1) });
    if (best.seg) leaders.push({ id: it.id, seg: best.seg });
    placed.push({ id: it.id, form: best.form, dx: best.c.dx, dy: best.c.dy, w: it.forms[best.form].w, h: it.forms[best.form].h, leader: best.leader, au: it.au });
    return true;
  };

  // While the picture still moves (stay Infinity) a label keeps the spot it stands at for as long as that spot is legal under the rules it stands by, the last resort's included: a `must` name on a
  // last-resort spot left it for a spot of the first rules the moment one opened, as the picture turned (Mac slow drag: the portal confluence's name hopped between two spots, both legal). At rest the
  // free solve below chooses again, with the tuned STAY.
  let held = new Set<string>();
  /** A name given way for a higher one (see the yield passes below): its dot marks nothing, so it holds no room. */
  let gone: ReadonlySet<string> = new Set<string>();
  const keeps = (it: Anchored): boolean => {
    if (stay !== Infinity || !it.was) return false;
    if (it.optional) return tryItem(it, 0, false, true, true, true);
    if (tryItem(it, 0, false, false, false, true)) return true;
    return !!it.must && (tryItem(it, 1, false, false, false, true) || tryItem(it, 2, false, false, false, true));
  };
  const pass = (order: readonly Anchored[]) => {
    placedBoxes = []; leaders = []; placed = []; dropped = []; skipped = []; held = new Set();
    for (const it of order) {
      if (keeps(it)) { held.add(it.id); continue; }
      if (it.optional) { if (!tryItem(it, 0, false, true, true)) skipped.push(it.id); continue; }
      if (it.region && it.onOther) { if (tryItem(it, 0, true) || tryItem(it, 0, false)) continue; dropped.push(it.id); continue; }
      if (it.clearLines && tryItem(it, 0, false, true)) continue;
      if (tryItem(it, 0)) continue;
      if (it.must && (tryItem(it, 1) || tryItem(it, 2))) continue;
      dropped.push(it.id);
    }
  };
  const byRank = [...items].sort(rank);
  pass(byRank);
  // A name the greedy order left out for want of room that a higher ranked name took (the sinusoids' name standing across the arteriole's place) is tried first, as 2D tries its orders (lobule-zoom-records.js
  // nextPerm), and the order kept when it leaves out less (by rank). Deterministic, at most DROP_ROUNDS more passes.
  const lost = (d: readonly string[]) => d.reduce((n, id) => { const it = items.find((o) => o.id === id)!; return n + (it.must ? 1e4 : 0) + it.pri; }, 0);
  // (While the picture moves, the names that kept their standing spot keep it ahead of the ones tried first: a name left out never comes back by pushing a name off a spot that is still legal, which moved
  //  the right sinusoids' name across the liver mid-flick for the right portal vein's.)
  let bestSol = { placed, dropped, boxes: placedBoxes, skipped };
  const standing = held;
  let order = byRank;
  for (let round = 0; round < DROP_ROUNDS && bestSol.dropped.length; round++) {
    const first = new Set(bestSol.dropped);
    order = [...order.filter((o) => standing.has(o.id)), ...items.filter((o) => first.has(o.id)).sort(rank), ...order.filter((o) => !first.has(o.id) && !standing.has(o.id))];
    pass(order);
    if (lost(dropped) < lost(bestSol.dropped)) bestSol = { placed, dropped, boxes: placedBoxes, skipped }; else break;
  }
  // A name left out because a lower ranked one holds the only clear spot near it: the lower one gives way instead (owner, 25 Nov: "a name never stands on vessels"; on a small figure the names with
  // no clear spot give way, lowest rank first, and the name he would look for first still shows wherever a clear place for it exists). The lowest ranked placed name that ranks under the left-out one
  // is left out in its place (its dot then marks nothing and holds no room), and the names are placed again in rank order; the answer is kept when it leaves out less (by rank), else the next one up
  // is tried. At rest only: while the picture moves no name is pushed off a legal spot. Only for a name kept off the vessels (`offVessels`): the lobule's names have their own orders (2D's), and a
  // tract name pushed last there stood on the wrong side of its tract.
  if (stay !== Infinity) {
    let tries = 0;
    for (let again = true; again && bestSol.dropped.length && tries < YIELD_TRIES;) {
      again = false;
      const out = new Set(bestSol.dropped);
      const ins = byRank.filter((o) => !out.has(o.id));
      for (const d of byRank.filter((o) => out.has(o.id) && o.offVessels)) {
        // (a name ranked under it stands after it, so only its dot can be in the way: a name whose dot is beyond the widest search of this one's spots cannot be what keeps it out)
        const reach = RING_REACH + Math.max(...d.forms.map((f) => f.w + f.h));
        const under = ins.filter((p) => rank(p, d) > 0 && !p.region && Math.abs(p.ax - d.ax) < reach && Math.abs(p.ay - d.ay) < reach);
        if (!under.length) continue;
        // (first, once, with every one of them given way: when even that leaves it out, no one of them can let it in, and the tries one by one are skipped)
        tries++;
        gone = new Set(under.map((p) => p.id));
        pass(byRank.filter((o) => o === d || rank(o, d) < 0));
        gone = new Set();
        if (!placed.some((q) => q.id === d.id)) continue;
        for (const p of [...under].reverse()) {
          if (tries >= YIELD_TRIES) break;
          tries++;
          gone = new Set([p.id]);
          pass(byRank.filter((o) => o !== p));
          gone = new Set();
          dropped.push(p.id);
          if (lost(dropped) < lost(bestSol.dropped)) { bestSol = { placed, dropped, boxes: placedBoxes, skipped }; again = true; break; }
        }
        if (again || tries >= YIELD_TRIES) break;
      }
    }
  }
  const at = new Map(byRank.map((o, i) => [o.id, i]));
  return { placed: [...bestSol.placed].sort((a, b) => at.get(a.id)! - at.get(b.id)!), dropped: bestSol.dropped, hidden, skipped: bestSol.skipped };
}

/** The box a placement occupies, given the dot's position now. */
export function boxOf(p: Pick<Placement, 'dx' | 'dy' | 'w' | 'h'>, ax: number, ay: number): Box {
  return { x0: ax + p.dx, y0: ay + p.dy, x1: ax + p.dx + p.w, y1: ay + p.dy + p.h };
}
