// Where the Tests card stands, as the 2D dock places it (dock.js): on a wide screen (Mac, an iPad held sideways) a tall card on the right with one fixed width
// (sideFixed: 30 % of the screen between 500 and 600 px); on a phone or an upright iPad a sheet over the bottom of the figure. The card is sized to its content up to the room
// it has; a pane that does not fit the room the card has scrolls (owner, 20 Nov 2026, for a phone's Half). Pure numbers: the scene frames the figure in what is left.
import type { DeviceClass, Rect, Viewport } from '../layout/device.ts';
import { isPhone } from '../layout/device.ts';
import { footHeight, usesBottomBar, topBarH, dockHeight, dockInset } from '../shell/room.ts';
import { M } from '../shell/metrics.ts';
import { clamp } from './copied/num.copied.js';
import { testsHalfPx, MIN_HALF } from './copied/stack-plan.copied.js';
import { sheetDockVars } from './copied/dock-vars.copied.js';

export const SIDE_W = 500, SIDE_W_WIDE = 600;
/** The side card's width on a screen W px wide (dock.js sideFixed): the fixed width, growing with a very large window. */
export const sideFixed = (W: number): number => Math.min(SIDE_W_WIDE, Math.max(SIDE_W, Math.round(W * 0.3)));
/** Where it gives way (dock.js sideWidth, not sideways): never more than 62 % of the stage. */
export const sideWidth = (W: number): number => Math.min(sideFixed(W), Math.max(360, W * 0.62));
/** A phone held sideways keeps its divider (the only card whose width is dragged): the remembered width, else 45 % of the stage, between 320 px and 62 % of it (dock.js sideWidth). */
export const sidewaysWidth = (W: number, widthPx: number | null): number => clamp(widthPx ?? Math.max(340, W * 0.45), 320, Math.max(360, W * 0.62));
/** The tallest a side card is on a Mac or an iPad on its side (app-07-floating.css --ws-max). */
export const SIDE_MAX_H = 760;
/** The sheet's two heights, Half and Full (dock-sheet.js stops): a phone's Half is one fixed 520 px (testsHalfPx), Full the room; a tablet held upright 45 % and 62 % of the screen. */
export const TESTS_HALF_PX = 520;
/** The sheet's third stop, Peek (owner, 20 Nov: swipe the instrument panel down out of the way to see more of the figure, and bring it back): the head row, tabs and grab handle only. */
export const PEEK_H = 72;
/** A phone's Half is 2D's (testsHalfPx: about 90 % of the room, 520 px at most) but never more than HALF_SHARE of the screen: tall enough for a pane's own content (owner, 20 Nov: cards not opening full, unlike 2D),
 *  low enough that it does not open high up. The figure is not zoomed out under it (panRoom) and is seen over it by pulling the card down to Peek. */
export const HALF_SHARE = 0.52;
export function sheetStops(device: DeviceClass, H: number, R: number, vesselCard = false): [number, number] {
  if (device === 'tablet-portrait') return [Math.round(Math.min(1, testsHalfPx(R, 0.45 * H, vesselCard) / R) * R), Math.round(Math.min(1, (0.62 * H) / R) * R)];
  const half = Math.min(Math.round(Math.min(0.9, testsHalfPx(R, TESTS_HALF_PX, vesselCard) / R) * R), Math.max(MIN_HALF, Math.round(HALF_SHARE * H)), Math.round(R));
  return [half, Math.round(R)];
}
/** The sizes a card on the right hands its panes (dock.js sizeObserver): the plots share the body's height, a square is the card's width less its padding. */
export const sideVars = (w: number, bodyH: number, count: number): { plot: number; square: number } => ({ plot: clamp(bodyH / Math.max(1, count) - 90, 190, 380), square: clamp(w - 80, 220, 380) });
/** The card's head row, tabs and the comparison line over the body, until the body is measured (the plot sizes follow the body's own height, dock.js sizeObserver). */
export const HEAD_H = 56;

export interface TestsPlace {
  kind: 'side' | 'sheet';
  rect: Rect;
  /** the tallest the card may be (its content scrolls nowhere: the panes size to this) */
  maxH: number;
  /** the two sizes the card hands its panes: a plot's height and a square's (dock.js sizeObserver; a sheet's are dock-vars.js) */
  vars: { plot: number; square: number };
  /** the card fills the screen (instrument-focus) */
  focus: boolean;
  /** the sheet's Half and Full heights (a side card has none) */
  stops: [number, number] | null;
}

export interface PlaceOpts {
  /** the remembered width of a sideways phone's card, px */
  widthPx?: number | null;
  /** the remembered height of a sheet that is not over the thumb dock, a share of the stage */
  heightRatio?: number | null;
  /** the phone's sheet: 0 Half, 1 Full, 2 Peek */
  sheetSize?: 0 | 1 | 2;
  /** instrument-focus: the card fills the screen */
  focus?: boolean;
  /** the body's measured height, px (the plot sizes follow it); the head's estimate until it is measured */
  bodyH?: number;
  /** how many instruments are up (a side card's plots share its height) */
  count?: number;
  /** the vessel's card is up above the sheet (its Half gives way, stack-plan.js) */
  vesselCard?: boolean;
  /** (a content height, px: a card that is shorter than its room) */
  contentH?: number;
}

export function testsPlace(vp: Viewport, device: DeviceClass, o: PlaceOpts = {}): TestsPlace {
  const barH = topBarH(vp, device), top = vp.safe.top + barH + 4;
  // (a phone held sideways has the laptop's bars, compacted, so its foot is the laptop's: shell.ts layoutClass(thumb) says the same to the figure)
  const bottom = vp.safe.bottom + footHeight(device === 'phone-landscape' ? 'desktop' : device);
  const room = Math.max(0, vp.h - top - bottom);
  const contentH = o.contentH ?? 0, count = Math.max(1, o.count ?? 1);
  const side = !usesBottomBar(device) || device === 'phone-landscape';
  const bodyOf = (h: number) => o.bodyH ?? Math.max(0, h - HEAD_H);
  if (o.focus) {
    // the instrument in focus (app-07-floating.css .app.instrument-focus .instrument-workspace): the whole screen but the bars, a gap in from each side
    const gap = device === 'desktop' ? M.gap : 8, y = vp.safe.top + barH + 4, h = Math.max(0, vp.h - bottom - y - gap);
    const w = Math.max(0, vp.w - vp.safe.left - vp.safe.right - 2 * gap);
    return { kind: side ? 'side' : 'sheet', rect: { x: vp.safe.left + gap, y, w, h }, maxH: h, vars: sideVars(w, bodyOf(h), count), focus: true, stops: null };
  }
  if (side) {
    // beside the figure: right-hand column (a phone held sideways docks on the right too, so the figure keeps the full height)
    const w = device === 'phone-landscape' ? sidewaysWidth(vp.w, o.widthPx ?? null) : sideWidth(vp.w);
    const maxH = device === 'phone-landscape' ? room : Math.min(SIDE_MAX_H, room);
    const h = contentH > 0 ? Math.min(contentH, maxH) : maxH;
    const x = vp.w - vp.safe.right - 12 - w;
    return { kind: 'side', rect: { x, y: top, w, h }, maxH, vars: sideVars(w, bodyOf(h), count), focus: false, stops: null };
  }
  // a sheet over the foot of the figure: the full width less the margins, rising from just above the bottom bars; Half or Full (dock-sheet.js)
  // (its foot is the dock's top edge less 8 px, 2D's --thumb-occ: the view pill over the dock goes with the card, so the sheet does not stand above the room it leaves, a 50 px gap over the dock, 20 Nov play-test)
  // (an upright iPad, 700 to 1100 px wide: 2D app-10-thumb-dock.css:175 sets the dock and the sheet to `left: 15%; right: 15%`, the 70 % column the cards of a talk keep; the tab row fits that width, so it
  //  shows the short names, where a full-width sheet cut "Endoscopy" to "Endosc…", 20 Nov play-test)
  const tab = device === 'tablet-portrait', margin = 8, w = tab ? Math.round(vp.w * 0.7) : vp.w - vp.safe.left - vp.safe.right - 2 * margin, x = tab ? Math.round(vp.w * 0.15) : vp.safe.left + margin, foot = vp.safe.bottom + dockInset(device) + dockHeight(device) + 8;
  const R = Math.max(1, vp.h - vp.safe.top - barH - foot - 22);
  const stops = sheetStops(device, vp.h, R, !!o.vesselCard);
  const maxH = stops[1];
  // (a sheet has its stops and nothing else: a remembered side-card ratio or a content height never sets it, so it never opens at some height in between, owner 20 Nov)
  const h = o.sheetSize === 2 ? PEEK_H : stops[o.sheetSize === 1 ? 1 : 0];
  return { kind: 'sheet', rect: { x, y: vp.h - foot - h, w, h }, maxH, vars: sheetDockVars(h, isPhone(device)), focus: false, stops };
}

/** The room the figure is FRAMED in while the card is up (owner, 20 Nov: opening a Tests card must not squeeze or zoom out the figure; it may pan to keep its middle in the free part): the same size as the
 *  full room, so the fit's zoom is unchanged, its centre moved to the centre of what the card leaves. */
export function panRoom(room: Rect, place: TestsPlace | null): Rect {
  const cut = roomWith(room, place);
  return { x: room.x + (cut.x + cut.w / 2 - (room.x + room.w / 2)), y: room.y + (cut.y + cut.h / 2 - (room.y + room.h / 2)), w: room.w, h: room.h };
}

/** How far the figure is moved, on top of panRoom, to bring the probe now up (the Doppler's gate, the FibroScan's tip) into the part the card leaves. `focus` is where the probe stands now on screen and `shift` the move already
 *  applied. The figure is NOT centred on the probe (owner, 20 Nov 2026, "the centering of fit with spleen fibroscan is insane": the spleen is at the figure's right, and centring it pushed the whole figure hard left, cut off,
 *  an empty middle beside the card): the picture stays where panRoom put it, centred in the free part, and moves only when the probe would stand in the card's edge strip or under it, and then only until it is a margin
 *  (MARGIN of the free part) clear. It is judged where the probe stands with no shift (focus less the shift), so the answer never depends on the earlier one: a probe that is clear needs none, and a stale shift goes. */
export const PROBE_MARGIN = 0.15, PROBE_SHIFT_MAX = 0.4;
export function probeShift(base: Rect, place: TestsPlace | null, focus: { x: number; y: number } | null, shift: { x: number; y: number }): { x: number; y: number } {
  if (!focus || !place) return { x: 0, y: 0 };
  const cut = roomWith(base, place), side = place.kind === 'side';
  const lim = PROBE_SHIFT_MAX * (side ? base.w : base.h);
  const at = side ? focus.x - shift.x : focus.y - shift.y, lo = (side ? cut.x : cut.y) + PROBE_MARGIN * (side ? cut.w : cut.h), hi = (side ? cut.x + cut.w : cut.y + cut.h) - PROBE_MARGIN * (side ? cut.w : cut.h);
  const d = Math.max(-lim, Math.min(lim, at < lo ? lo - at : at > hi ? hi - at : 0));
  return side ? { x: d, y: 0 } : { x: 0, y: d };
}

/** The room the figure keeps when the card is up: the screen less the card (the camera frames it there). */
export function roomWith(room: Rect, place: TestsPlace | null): Rect {
  if (!place) return room;
  const r = place.rect;
  if (place.kind === 'side') { const w = Math.max(0, Math.min(room.w, r.x - room.x - 8)); return { x: room.x, y: room.y, w, h: room.h }; }
  const h = Math.max(0, Math.min(room.h, r.y - room.y - 8));
  return { x: room.x, y: room.y, w: room.w, h };
}
