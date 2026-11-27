// Where a panel stands on a wide screen (menu unification, stage 2: reports/menu-unification.md 3.2 "Float placement"). One rule for every panel in float mode, in place of
// a fixed CSS box per panel (History 460 px, Compare 400, Why 440, Treat 400 from the 2D --card-treat, the action card 340 under its own top, the stop card 400) and Treat's own
// step-left beside Tests (treat/beside.ts, folded in here).
//   column  from the surface table (kinds.ts SURFACES): the left holds what you are looking at (the action card, the stop card), the right the tools you opened.
//   width   the right column's standard width is one token, PANEL_STD (420 px, owner 27 Nov, section 6 question 3; CSS --panel-std), narrower only where the screen is
//           (38 % of it, never under 290: a phone held sideways, 321 px at 844); Tests keeps its own 500 to 600 px rule as the column's wide tier (tests/place.ts).
//           The left column is M.sideCardW (340 px).
//   top     one gap under the top bar (room.ts topBarH, the --top-safe the 2D sheets read).
//   height  fitted to the content up to the room, which ends at the foot (the dock and the view pill over it, room.ts footHeight: the figure's own foot); History is tall.
//   step    the right column holds up to two panels side by side, any two, when both fit and leave the figure FIGURE_MIN px (fitsTogether); the one opened first keeps
//           the right edge and the next stands left of it with one gap (columnSteps), gliding there by a translate. No two panels ever overlap.
// A phone held sideways is float mode (owner, 27 Nov, section 6 question 5): its right column ends left of the toolbar's rail, as the Tests card does.
// Pure numbers, so node judges every screen (tests/panel-place.test.ts).
import type { DeviceClass, Rect, Viewport } from '../layout/device.ts';
import { M } from '../shell/metrics.ts';
import { footHeight, layoutClass, topBarH } from '../shell/room.ts';
import { RAIL_W, SIDEWAYS_GAP, testsPlace, type TestsPlace } from '../tests/place.ts';
import { SURFACES, type Column, type PanelId } from './kinds.ts';

/** The right column's standard width, px (--panel-std): Treat, History, Compare and Why. */
export const PANEL_STD = 420;
/** The narrowest a right-hand panel gets, and the share of the screen it may take where 420 px is too much of it (a phone held sideways). */
export const PANEL_MIN = 290, PANEL_SHARE = 0.38;
/** The gap a panel keeps from the screen's edge and from the panel beside it (the 2D --gap). */
export const PANEL_GAP = 12;
/** The gap under the top bar. */
export const PANEL_TOP_GAP = 4;
/** How far a panel comes in from its column's edge as it opens (and goes back as it leaves): --panel-in. */
export const PANEL_IN = 12;
/** The panels that stand as tall as the room whatever they hold (History's list scrolls inside it, approved for that card, 26 Nov). */
export const TALL: ReadonlySet<PanelId> = new Set<PanelId>(['history']);
/** A panel's own ceiling under the room, px: the action card keeps its 500 (app-03-layouts.css `.action-card`). */
export const CAP: Partial<Record<PanelId, number>> = { action: 500 };

/** The right column's standard width on a screen `W` px wide. */
export const stdWidth = (W: number): number => Math.min(PANEL_STD, Math.max(PANEL_MIN, Math.round(W * PANEL_SHARE)));

/** The band every float panel stands in: under the top bar, over the foot, inside the edges (a phone held sideways: left of the rail). */
export function panelBand(vp: Viewport, device: DeviceClass): { top: number; bottom: number; left: number; right: number; gap: number } {
  // (float mode has the laptop's bars, compacted on a phone held sideways: the figure's room reads the same class, shell/room.ts layoutClass)
  const d = layoutClass(false), sideways = device === 'phone-landscape';
  const top = vp.safe.top + topBarH(vp, d) + PANEL_TOP_GAP, bottom = vp.h - vp.safe.bottom - footHeight(d);
  const right = vp.w - vp.safe.right - (sideways ? SIDEWAYS_GAP + RAIL_W : PANEL_GAP);
  return { top, bottom: Math.max(top, bottom), left: vp.safe.left + PANEL_GAP, right, gap: sideways ? SIDEWAYS_GAP : PANEL_GAP };
}

export interface PanelPlace {
  column: Column;
  /** the panel's box at rest before its step (h: the room it may take; a fitted panel is as tall as its content up to it) */
  rect: Rect;
  maxH: number;
  tall: boolean;
  /** px the panel steps left of its place, beside a Tests card in the right column (0 with none) */
  step: number;
}

/** The least of the figure the right column leaves between itself and the left column (or the screen's left edge with that column empty), px: two right-hand
 *  panels stand side by side only when both fit with this much left (coordinator, 27 Nov, the owner's Mac report). */
export const FIGURE_MIN = 400;

/** A right-hand panel's width: Tests' own (tests/place.ts, the column's wide tier: `testsW` when it is placed, the remembered width of a phone held sideways), the standard for the rest. */
export const columnWidth = (id: PanelId, vp: Viewport, device: DeviceClass, testsW?: number): number =>
  (id === 'tests' ? testsW ?? testsPlace(vp, device).rect.w : stdWidth(vp.w));

/** Whether panels of these widths stand side by side in the right column and leave the figure FIGURE_MIN px (`leftOpen`: the left column holds a card). */
export function fitsTogether(vp: Viewport, device: DeviceClass, widths: readonly number[], leftOpen = false): boolean {
  if (widths.length <= 1) return true;
  const b = panelBand(vp, device), used = widths.reduce((s, w) => s + w, 0) + b.gap * (widths.length - 1);
  const leftEdge = leftOpen ? b.left + M.sideCardW : vp.safe.left;
  return b.right - used - leftEdge >= FIGURE_MIN;
}

/** The right-column panels in `order` (oldest first), each with the px it steps left of the column's right edge: the panel opened first keeps the edge, each later one stands
 *  left of every older one with one gap between (treat/beside.ts, generalised). When one closes the order shortens and the others glide right to fill. */
export function columnSteps(order: readonly PanelId[], widthOf: (id: PanelId) => number, gap: number): Partial<Record<PanelId, number>> {
  const out: Partial<Record<PanelId, number>> = {};
  let at = 0;
  for (const id of order) {
    if (SURFACES[id].column !== 'right') continue;
    out[id] = at;
    at += widthOf(id) + gap;
  }
  return out;
}

/** A Tests card's place moved `step` px left in the column (a side card; a sheet or an instrument in focus stands where it is). */
export function steppedPlace(place: TestsPlace, step: number): TestsPlace {
  if (!step || place.kind !== 'side' || place.focus) return place;
  return { ...place, rect: { ...place.rect, x: place.rect.x - step } };
}

export interface PanelPlaceOpts {
  /** px the panel steps left of the column's edge (columnSteps) */
  step?: number;
  /** the Tests card's place now (tests/room.ts) */
  tests?: TestsPlace | null;
}

/** Where panel `id` stands in float mode. Tests' own rule is tests/place.ts (the right column's wide tier); the timeline chart spans the band. */
export function panelPlace(id: PanelId, vp: Viewport, device: DeviceClass, o: PanelPlaceOpts = {}): PanelPlace {
  const column = SURFACES[id].column, b = panelBand(vp, device), room = b.bottom - b.top, step = o.step ?? 0;
  if (id === 'tests') {
    const t = o.tests ?? testsPlace(vp, device);
    return { column, rect: t.rect, maxH: t.maxH, tall: true, step };
  }
  const maxH = Math.max(0, Math.min(room, CAP[id] ?? room)), tall = TALL.has(id);
  if (column === 'full') return { column, rect: { x: b.left, y: b.top, w: Math.max(0, b.right - b.left), h: room }, maxH: room, tall: true, step: 0 };
  if (column === 'left') return { column, rect: { x: b.left, y: b.top, w: M.sideCardW, h: maxH }, maxH, tall, step: 0 };
  const w = stdWidth(vp.w);
  return { column, rect: { x: b.right - w, y: b.top, w, h: maxH }, maxH, tall, step };
}

/** The box a placed panel takes on the screen at rest, `h` px tall (its measured height; a tall panel's is the room): what it publishes to the room channel (surface/room.ts). */
export const placedBox = (p: PanelPlace, h: number): Rect => ({ x: p.rect.x - p.step, y: p.rect.y, w: p.rect.w, h: p.tall ? p.maxH : Math.min(Math.max(0, h), p.maxH) });
