// THE label solver: one place decides where every label of the figure stands (parity plan B6: "one solver: labels never under cards").
// Pure numbers in, numbers out: no DOM, no three.js, no history. The same input always gives the same answer, so a reload, a replay or a
// slide jump never lays the figure out differently (2D lesson of 16 Nov: a solve that read its own past made labels differ per reload).
//
// Rules, in the order the 2D app's solver learned them:
//  1. A label never stands under a card, the presenter bar, the key or the strip (the blockers), and never off the view.
//  2. A label never overlaps another label, another station's dot, or a leader line; it avoids vessels (a soft cost).
//  3. A label with room beside its vessel has no leader; one that stands more than LEAD_ON px away gets one.
//  4. A crowded label shortens by forms (full name, then the abbreviation, then the number alone) before it is dropped.
//  5. A `must` label (a station the slide names, the picked vessel) is searched all the way round and is dropped last.
//  6. A station whose vessel is partly under a card slides its dot along the vessel to the middle of the part in view.
//
// Higher `pri` wins when space is short; ties break by id, so the order is total.

import { COMPASS, RING_SPOTS, type Box, type Dir, boxGap, crosses, grow, hits, nearestOn, offsetOf, segsCross, within } from './geometry.ts';

export interface Form { text: string; w: number; h: number }

export interface Item {
  id: string;
  /** The station's dot on the canvas now (CSS px), and where along `path` it stands (0..1; 0.5 = the vessel's middle). */
  ax: number; ay: number; au: number;
  /** The vessel's course on the canvas, evenly spaced along its length: the dot may slide along it (rule 6) and may be moved off a crowded neighbour. */
  path?: readonly (readonly [number, number])[];
  /** Widest form first. */
  forms: readonly Form[];
  pri: number;
  must?: boolean;
  /** Preferred sides, tried first in this order. */
  dirs?: readonly Dir[];
  /** A region's name (an organ) is drawn on what it names and never has a leader. */
  region?: boolean;
  /** Half the vessel's width on the canvas, so a label starts clear of it. */
  vw?: number;
  /** A reading card with a pointer whose tip is the dot (the catheter's FHVP / WHVP / HVPG): it stands below or above its point, leans, and keeps
   *  clear of the vessels round it (the 2D app's callout-room.js, ported). `below` is the side it prefers. */
  callout?: { below: boolean };
}

export interface SolveInput {
  items: readonly Item[];
  /** The canvas area labels may use (inside the safe areas). */
  view: Box;
  /** Everything a label may never touch: cards, the presenter bar, the strip, the key. */
  blockers: readonly Box[];
  /** The vessels' centrelines on the canvas, [x0, y0, x1, y1]: a label avoids standing on them (a cost, not a ban). */
  lines?: readonly (readonly [number, number, number, number])[];
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
  /** A callout's pointer: which edge of the card it leaves, and how far its tip (the dot) is from the card's centre, px. */
  tail?: { below: boolean; ax: number };
}

export interface Solved {
  placed: Placement[];
  /** Items with no clear spot at all (never a must item in the slice's framings; a test says so). */
  dropped: string[];
  /** Items whose vessel is wholly out of view or under a card: nothing to label. */
  hidden: string[];
}

// Tuning (px). One place, so a change is one change.
export const LEAD_ON = 12;
export const AIR_BLOCKER = 6;
export const AIR_LABEL = 4;
export const DOT_ROOM = 14;
export const VIEW_INSET = 8;
const SLIDE_INSET = 18;
const SHORT_LEAD = 45, LONG_LEAD = 140;
const WIDE_GAPS = [40, 58, 76, 96, 120];
const FORM_COST = 50;
const LINE_COST = 8;

type Seg = [number, number, number, number];

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
export function slideInView(path: readonly (readonly [number, number])[], view: Box, blockers: readonly Box[]): { u: number; x: number; y: number } | null {
  const STEPS = 100;
  let from = -1, b0 = -1, b1 = -1;
  for (let n = 0; n <= STEPS; n++) {
    const [x, y] = pointAlong(path, n / STEPS);
    if (clearPoint(x, y, view, blockers)) { if (from < 0) from = n; if (b0 < 0 || n - from > b1 - b0) { b0 = from; b1 = n; } } else from = -1;
  }
  if (b0 < 0) return null;
  const u = (b0 + b1) / 2 / STEPS, [x, y] = pointAlong(path, u);
  return { u, x, y };
}

// Dots kept apart: where two stations' dots stand closer than DOT_ROOM, the lower ranked slides along its own vessel to the nearest clear point.
const SLIDES = [0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
function spreadDots(items: Anchored[], view: Box, blockers: readonly Box[]): void {
  const near = (it: Anchored, x: number, y: number) => items.some((o) => o !== it && Math.hypot(o.ax - x, o.ay - y) < DOT_ROOM);
  for (const it of [...items].sort(rank).reverse()) {
    if (!near(it, it.ax, it.ay) || !it.path) continue;
    for (const u of SLIDES) {
      const [x, y] = pointAlong(it.path, u);
      if (!near(it, x, y) && clearPoint(x, y, view, blockers)) { it.ax = x; it.ay = y; it.au = u; break; }
    }
  }
}

type Anchored = Item & { ax: number; ay: number; au: number };
const rank = (a: Item, b: Item) => (Number(!!b.must) - Number(!!a.must)) || (b.pri - a.pri) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Cand { dx: number; dy: number; cost: number; tail?: { below: boolean; ax: number } }

// A callout's pointer (callout-ptr.js): it reaches PTR past the card's edge, stays KEEP from the card's sides, and leans at most SLANT px per px of length.
export const PTR = 11, KEEP = 28;
// (14 and 16 are the squeezed gaps, tried at a cost: on a phone's narrow band between two cards a reading card with 18 px between it and its point
// does not fit by a few px, and a card a little closer to its point beats no card)
export const CALL_MIN_GAP = 14;
const ROOM_BASE = 18, CALL_GAPS = [18, 24, 32, 42, 54, 68, 84, 100, 16, CALL_MIN_GAP], SLANT = 1.3;
const CALL_LEANS = Array.from({ length: 27 }, (_, i) => i * 0.04);

function calloutCands(f: Form, below: boolean): Cand[] {
  const out: Cand[] = [];
  const w = f.w, h = f.h;
  for (const side of [below, !below]) for (const g of CALL_GAPS) for (const l of CALL_LEANS) for (const sg of l ? [1, -1] : [1]) {
    const ax = l * w * sg;
    const len = PTR + g - ROOM_BASE, base = Math.max(KEEP - w / 2, Math.min(w / 2 - KEEP, ax));
    if (Math.abs(ax - base) > SLANT * len + 14) continue;
    out.push({ dx: -ax - w / 2, dy: side ? g : -g - h, cost: (g < ROOM_BASE ? (ROOM_BASE - g) * 6 + 4 : (g - ROOM_BASE) * 0.8) + (Math.abs(ax) / w) * 16 + (side === below ? 0 : 10), tail: { below: side, ax } });
  }
  return out;
}

function candidates(it: Anchored, f: Form, wide: boolean): Cand[] {
  if (it.callout) return calloutCands(f, it.callout.below);
  const out: Cand[] = [];
  if (it.region) { const [dx, dy] = offsetOf('C', f.w, f.h, 0); return [{ dx, dy, cost: 0 }]; }
  const gap0 = Math.max(12, (it.vw ?? 3) + 8);
  const order: Dir[] = [...(it.dirs ?? []), ...COMPASS.filter((d) => !(it.dirs ?? []).includes(d))];
  order.forEach((d, i) => { const [dx, dy] = offsetOf(d, f.w, f.h, gap0); out.push({ dx, dy, cost: i * 2 }); });
  WIDE_GAPS.forEach((g, gi) => order.forEach((d, i) => { const [dx, dy] = offsetOf(d, f.w, f.h, g + (it.vw ?? 0)); out.push({ dx, dy, cost: 20 + gi * 8 + i }); }));
  if (wide) RING_SPOTS.forEach(([cx, cy], i) => out.push({ dx: cx - f.w / 2, dy: cy - f.h / 2, cost: 100 + i * 0.2 }));
  return out;
}

export function solve(input: SolveInput): Solved {
  const { view, lines = [] } = input;
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
      const s = it.path ? slideInView(it.path, view, input.blockers) : null;
      if (!s) { hidden.push(it.id); continue; }
      it.ax = s.x; it.ay = s.y; it.au = s.u;
    }
    items.push(it);
  }
  spreadDots(items, view, input.blockers);

  const placedBoxes: { id: string; box: Box }[] = [];
  const leaders: { id: string; seg: Seg }[] = [];
  const placed: Placement[] = [];
  const dropped: string[] = [];

  const tryItem = (it: Anchored, relax: 0 | 1 | 2) => {
    const blockers = relax >= 2 ? blockersRaw : blockersAir;
    let best: { cost: number; form: number; c: Cand; box: Box; leader: boolean; seg: Seg | null } | null = null;
    for (let fi = 0; fi < it.forms.length; fi++) {
      const f = it.forms[fi];
      {
        for (const c of candidates(it, f, !!it.must || relax > 0)) {
          const box: Box = { x0: it.ax + c.dx, y0: it.ay + c.dy, x1: it.ax + c.dx + f.w, y1: it.ay + c.dy + f.h };
          if (!within(box, inner)) continue;
          let bad = false;
          for (const b of blockers) if (hits(box, b)) { bad = true; break; }
          if (bad) continue;
          for (const p of placedBoxes) if (hits(box, grow(p.box, AIR_LABEL))) { bad = true; break; }
          if (bad) continue;
          if (relax < 2) for (const o of items) if (o !== it && boxGap(box, o.ax, o.ay) < 9) { bad = true; break; }
          if (bad) continue;
          // the dot's own place: a label never covers its own dot (a region's name, drawn on what it names, has none)
          if (!it.region && boxGap(box, it.ax, it.ay) < 3) continue;
          // (measured from the vessel's edge as drawn, not from its middle: a label hugging a fat vein has no line)
          const gap = it.region ? 0 : boxGap(box, it.ax, it.ay) - (it.vw ?? 0);
          const leader = !it.region && !it.callout && gap > LEAD_ON;
          let seg: Seg | null = null;
          let pen = 0;
          if (leader) {
            const [px, py] = nearestOn(box, it.ax, it.ay);
            seg = [it.ax, it.ay, px, py];
            const len = Math.hypot(px - it.ax, py - it.ay);
            if (len > LONG_LEAD + (it.vw ?? 0) + 10 && c.cost < 100) continue;
            if (len > SHORT_LEAD) pen += (len - SHORT_LEAD) * 0.2;
            for (const b of blockers) if (crosses(seg[0], seg[1], seg[2], seg[3], b)) { bad = true; break; }
            if (bad) continue;
            for (const p of placedBoxes) if (crosses(seg[0], seg[1], seg[2], seg[3], grow(p.box, 1))) { bad = true; break; }
            if (bad) continue;
            if (relax < 1) for (const l of leaders) if (segsCross(seg, l.seg)) { bad = true; break; }
            if (bad) continue;
            // a later label's leader must not run through an earlier label: checked above; an earlier leader through this box:
            for (const l of leaders) if (crosses(l.seg[0], l.seg[1], l.seg[2], l.seg[3], box)) { bad = true; break; }
            if (bad) continue;
          }
          let lineHits = 0;
          for (const l of lines) if (crosses(l[0], l[1], l[2], l[3], box)) lineHits++;
          const cost = fi * FORM_COST + c.cost + pen + lineHits * LINE_COST;
          if (!best || cost < best.cost) best = { cost, form: fi, c, box, leader, seg };
        }
      }
    }
    if (!best) return false;
    placedBoxes.push({ id: it.id, box: best.box });
    if (best.seg) leaders.push({ id: it.id, seg: best.seg });
    placed.push({ id: it.id, form: best.form, dx: best.c.dx, dy: best.c.dy, w: it.forms[best.form].w, h: it.forms[best.form].h, leader: best.leader, au: it.au, ...(best.c.tail ? { tail: best.c.tail } : {}) });
    return true;
  };

  for (const it of [...items].sort(rank)) {
    if (tryItem(it, 0)) continue;
    if (it.must && (tryItem(it, 1) || tryItem(it, 2))) continue;
    dropped.push(it.id);
  }
  return { placed, dropped, hidden };
}

/** The box a placement occupies, given the dot's position now. */
export function boxOf(p: Pick<Placement, 'dx' | 'dy' | 'w' | 'h'>, ax: number, ay: number): Box {
  return { x0: ax + p.dx, y0: ay + p.dy, x1: ax + p.dx + p.w, y1: ay + p.dy + p.h };
}
