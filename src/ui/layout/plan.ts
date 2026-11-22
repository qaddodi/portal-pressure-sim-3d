// Room first: where each card goes on each kind of screen, and the room the cards leave free for the figure.
// Pure numbers in, numbers out (no DOM): the cards measure their own height and hand it in, the scene's camera takes `free`
// and frames the subject there by shifting its projection (docs/look-and-feel.md section 8).
//
// The places are the 2D app's (owner, 19 Nov 2026: iPhone, iPhone on its side, iPad and Mac "should all be the same if not better"); the numbers are in
// rules2d.ts and tests/ui-parity-2d.test.ts holds them to the 2D app's:
//   Mac, iPad on its side (wide, short): the words' card at the top left, the data card UNDER it at the same width, a gap of 0.6 margin; a pair a little too
//     tall rises into the top margin (never closer than 4 px). Where it still does not fit the pair stays stacked (the 2D app shrinks the data card's blocks;
//     here nothing shrinks, so the words page). The Back / Next pill stands at the lower right of the screen.
//   iPhone upright, iPad upright (stack, tab): the data card on top, the figure between, the words' card at the foot (the pill stands inside it), planned from measured heights
//     (phonePlan): the figure's share gives way first, then the data card comes in closed (a strip at the top; a tap opens it and shuts the words).
//   iPhone on its side: the wallet. One column centred on the screen (400 px, wider only for a slide that needs the height), the card in front at its own
//     height, the other card a 48 px strip at the foot; a swipe or a tap swaps them.

import type { DeviceClass, Rect, Viewport } from './device.ts';
import { deviceClass } from './device.ts';
import {
  layoutOf, isSideways, margin, cardWidth, pairGap, FIG_MIN, figFloorOf, phonePlan, GRIP, SHUF, WALLET_STEPS, shufCol, shufMaxH, shufTop, type Layout,
} from './rules2d.ts';

export type CardId = 'title' | 'case' | 'teach' | 'ladder' | 'table' | 'check' | 'visual';
/** `words` is the left or top card (title, case, teaching line, quick check); `data` is the card of numbers. */
export type Slot = 'words' | 'data';

export interface Need { id: CardId; slot: Slot; /** a `visual` card's 2D visual (table, plane, walls…): its width is that kind's */ visual?: string; /** natural height at this plan's width for it (px); 0 until measured */ h: number }
export interface Placed { id: CardId; slot: Slot; rect: Rect }
export interface Strip { id: CardId; slot: Slot; rect: Rect }
export interface Plan {
  device: DeviceClass;
  layout: Layout;
  sideways: boolean;
  cards: Placed[];
  /** The card that is not showing, as a 48 px strip (the wallet: iPhone on its side, or an iPhone upright whose data card is closed). */
  strip: Strip | null;
  /** The data card is closed to a strip because the figure and the words need the room (iPhone upright). */
  shut: boolean;
  /** The reader put the data card away (2D's dock: a swipe up on it, a tap on its edge brings it back): it stands as a GRIP-px edge at the top and the figure has the room it left (a phone or an upright iPad, both cards up). */
  docked: boolean;
  /** Where the data card stands in its own place while it is docked (it stays up, slid away to its edge by a translate: ui/cards/dock.ts), so a drag brings it back from there. */
  tucked: Rect | null;
  /** The largest empty rectangle the cards leave: the figure's room. */
  free: Rect;
  /** Cards taller than the room they have; the card pages itself (never shrinks, never scrolls). */
  overflow: CardId[];
  /** Largest height a card of each slot may have here. */
  maxH: Record<Slot, number>;
  /** Where the presenter bar stands. */
  bar: BarPlace;
}

export const STRIP_H = 48;
const GAP = 16;       // room kept between a card and the figure's free rectangle
/** The Back / Next pill (the 2D app's .pz-bar): 44 px tall; back, the count, next, the settings and Exit (an iPhone on its side: the count, the settings and Exit). */
export const BAR_H = 44;
/** The band the shell's top bar takes above the figure (labels and the free-room solver keep clear of it). */
export const BAR = 56;
export const PILL_W = 272;
/** An iPhone's pill (Mohammad, 20 Nov: smaller, in the card's lower right corner): 32 px tall, each button's 44 px tap box reaching over its edge (deck-ui.css), about this wide. */
export const BAR_H_PHONE = 32, PILL_W_PHONE = 188, PILL_CORNER = 14;
export const PILL_W_SIDE = 156;   // (iPhone on its side: the count, the settings and Exit, as 2D's phone pill; a swipe moves the talk)
/** A stacked words card keeps this much of its own foot clear for the pill that stands inside it (2D: the card's bottom is 65 px under its text). */
export const FOOT_ZONE = 62;
/** An iPhone's credit stands in a row of its own at the foot of the words card (2D app-05 `.pz-cred`: "no bare spot at 12 px on most slides, 15 Oct"), so a card's words never run under it: the row is part of the card's foot,
 *  the pill and the key stand this much higher, and the card's foot padding (deck-ui.css) is this much deeper. A short phone (600 px tall or less) has no room for the row: there the credit floats (shell/Credit.tsx). */
export const CRED_ROW = 20;
export const credRow = (vp: Viewport): number => (layoutOf(vp.w, vp.h) === 'stack' && vp.h > 600 ? CRED_ROW : 0);
/** The corner radius of an iPhone's own screen (a phone whose page reaches the home-bar inset has rounded corners; the older models, whose page has no bottom inset, are square). */
export const screenRadius = (vp: Viewport): number => (layoutOf(vp.w, vp.h) === 'stack' && vp.safe.bottom > 0 ? (vp.w <= 376 ? 44 : vp.w <= 390 ? 47 : 55) : 0);
/** The gap an iPhone's bottom card keeps from the screen's edge on its three sides: its corners are the screen's own, inset by this (concentric). */
export const CARD_INSET = 8;
/** The bottom corners of the words card on a rounded iPhone: the screen's radius less the inset it keeps, so the card's corners and the screen's run parallel (null: the card's usual radius). */
export const footRadius = (vp: Viewport): number | null => { const r = screenRadius(vp); return r > 0 ? r - CARD_INSET : null; };
/** The room under a stacked screen's words card: its margin, and on an iPhone with rounded corners only that margin (the card reaches down to the corner, the home bar over it; the text keeps its own clear foot), else the safe area too. */
export const footReserve = (vp: Viewport) => (screenRadius(vp) > 0 ? CARD_INSET : Math.max(vp.safe.bottom, 0) + 8);
/** How far the card's foot is lower than the safe-area rule had it (what things standing beside the pill follow). */
export const footDrop = (vp: Viewport) => Math.max(vp.safe.bottom, 0) + 8 - footReserve(vp);

/** ONE geometry for the gaps between cards, strips, the pill and the screen's edges (Plan 37: several literals for one gap, some ignoring the safe areas, put the words over the data strip,
 *  the data card over the words strip, the pill on the strip and a card under the home bar). Every top is `topEdge`, every bottom `footEdge`; the strip's lift and the cards' caps derive from them. */
export const CARD_GAP = 8;   // least room between two cards, or a card and a strip
export const PILL_GAP = 6;   // least room between a strip and the pill
export const topEdge = (vp: Viewport, m: number): number => Math.max(m, vp.safe.top);
export const footEdge = (vp: Viewport, m: number): number => vp.h - Math.max(m, vp.safe.bottom);

export interface BarPlace { edge: 'foot' | 'card'; rect: Rect }
/** Where the pill stands: lower right of a wide screen (2D `pzb-pill`), centred in the foot of the words' card on a phone, at its lower right on an upright iPad. */
export function barOf(vp: Viewport): BarPlace {
  const { safe } = vp;
  const layout = layoutOf(vp.w, vp.h);
  if (layout === 'stack' || layout === 'tab') {
    const cardBottom = vp.h - footReserve(vp) + 0;
    const phone = layout === 'stack', bh = phone ? BAR_H_PHONE : BAR_H, bw = phone ? PILL_W_PHONE : PILL_W, inset = phone ? PILL_CORNER : 13;
    const y = cardBottom - (phone ? PILL_CORNER : 12) - bh - credRow(vp);
    const w = Math.round(vp.w * (layout === 'tab' ? 0.7 : 1) - (layout === 'tab' ? 0 : 16));
    const left = layout === 'tab' ? Math.round((vp.w - w) / 2) : Math.max(8, safe.left);
    // the lower right corner of the words card, inside it (an iPhone, as an upright iPad: Mohammad, 20 Nov)
    return { edge: 'card', rect: { x: left + w - inset - bw, y, w: bw, h: bh } };
  }
  const sideways = isSideways(vp.w, vp.h);
  const cm = margin(vp.w, vp.h, layout), w = sideways ? PILL_W_SIDE : PILL_W;
  const x = vp.w - Math.max(safe.right, cm) - w, y = vp.h - Math.max(cm, safe.bottom + 8) - BAR_H;
  return { edge: 'foot', rect: { x, y, w, h: BAR_H } };
}

/** The words strip an iPhone (or upright iPad) shows under its data card: its foot stands PILL_GAP above the Back / Next pill, whatever the credit row or the safe area make of the pill's place. */
export function stripRect(vp: Viewport, x: number, w: number): Rect {
  return { x, y: barOf(vp).rect.y - PILL_GAP - STRIP_H, w, h: STRIP_H };
}
/** The tallest the words card may be while the data card stands shut as a strip at the top: from CARD_GAP under the strip to the card's foot. */
export const shutWordsCap = (bottom: number, dtop: number): number => bottom - (dtop + STRIP_H + CARD_GAP);

/** The cards that stand alone in the middle of the screen (2D: the outline's and the quick check's `.pz-panel`, a case's `.pz-case`): they have no data card beside them and the page behind them is veiled.
 *  Measures are 2D's own CSS (styles app-04-presenter.css .pz-panel, .pz-case; app-05 .pz.stack .pz-panel), worked out from the screen. */
export type CentredKind = 'panel' | 'case';
export const centredKind = (id: CardId): CentredKind | null => (id === 'title' || id === 'check' || id === 'visual' ? 'panel' : id === 'case' ? 'case' : null);
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 2D's `--pzh`: 1vh, and on a portrait screen 700 px or wider the smaller of 1vh and .75vw. */
export const pzhOf = (vp: Viewport) => (vp.h > vp.w && vp.w >= 700 ? Math.min(vp.h / 100, (0.75 * vp.w) / 100) : vp.h / 100);
/** The 2D visual a centred panel is (its width is that kind's): the outline, the quick check, or a visual slide's own. */
export const panelVisual = (n: { id: CardId; visual?: string }): string => (n.id === 'title' ? 'outline' : n.id === 'check' ? 'check' : n.visual || 'table');
export function centredBox(vp: Viewport, kind: CentredKind, visual = 'outline'): { w: number; maxH: number; top: number; room: number } {
  const layout = layoutOf(vp.w, vp.h), pzh = pzhOf(vp), { safe } = vp;
  const stack = layout === 'stack' || layout === 'tab';
  if (kind === 'case') {
    const w = layout === 'tab' ? 0.7 * vp.w : Math.min(vp.w - 32 - 2 * Math.max(safe.left, safe.right), 920);
    return { w: Math.round(w), maxH: Math.round(vp.h - 2 * Math.max(84, 0.11 * vp.h)), top: 0, room: vp.h };
  }
  if (stack) {
    // a phone's panel: 8 px from the top, 64 px (and the home bar) clear at the foot, centred between; an upright iPad's is 70% wide
    const sb = Math.max(safe.bottom, 0), w = layout === 'tab' ? 0.7 * vp.w : vp.w - 16;
    return { w: Math.round(w), maxH: Math.round(vp.h - 72 - sb), top: 8, room: vp.h - 72 - sb };
  }
  const m = clampN(4 * pzh, 16, 56);
  let w = Math.min(1560, vp.w - 2 * Math.max(clampN(0.03 * vp.w, 16, 64), safe.left, safe.right));   // (a phone held sideways keeps the whole width: 2D's `.pz.low`)
  if (!isSideways(vp.w, vp.h)) {
    // a wide screen's reading widths (app-09 .pz-rw-*): the outline, the table, the quick check, a chart, a plane, in the teaching card's body size B
    const B = clampN(2.311 * pzh, 17, 28), at = (n: number, share: number) => Math.min(n * B, share * vp.w);
    // (the six ladders, 2D's `.pz-panel.fill`, keep the screen's width: every other panel is a reading width)
    if (visual !== 'ladders') w = visual === 'outline' ? at(50, 0.82) : visual === 'check' ? at(42, 0.82) : visual === 'plane' ? at(48, 0.74) : at(54, 0.82);
  }
  return { w: Math.round(w), maxH: Math.round(vp.h - 2 * m), top: m, room: vp.h - 2 * m };
}

/** The wallet's steps that fit across this screen (a column never reaches under the pill). */
export function walletSteps(vp: Viewport) {
  const room = barOf(vp).rect.x - 8 - Math.max(vp.safe.left, 10);
  return WALLET_STEPS.filter((s, i) => i === 0 || shufCol(s.col, vp.w) <= room);
}

/** How many widths a card may take on this screen: a pair on its side has the wallet's steps; words alone have their own 340 px first, then the wallet's columns; every other screen has one. */
export function stepsFor(vp: Viewport, pair: boolean): number {
  if (!isSideways(vp.w, vp.h)) return 1;
  return pair ? walletSteps(vp).length : 1 + new Set(walletSteps(vp).map((s) => s.col)).size;
}

/** The width of every card on this screen (px): one width for both cards, as in the 2D app. `step` is the wallet's step (iPhone on its side): a slide whose words
 *  need more height takes a wider column (fewer lines of the same type), never a smaller type. */
export function widthOf(vp: Viewport, pair = false, step = 0): number {
  const layout = layoutOf(vp.w, vp.h);
  if (isSideways(vp.w, vp.h)) {
    const st = walletSteps(vp);
    if (pair) return Math.round(shufCol(st[Math.min(step, st.length - 1)].col, vp.w));
    if (step > 0) { const cols = [...new Set(st.map((s) => s.col))]; return Math.round(shufCol(cols[Math.min(step - 1, cols.length - 1)], vp.w)); }
  }
  return Math.round(cardWidth(vp.w, vp.h, layout));
}

/** The top of a group of cards `total` px tall (the words, the gap and the data card, or one card) on a screen `H` tall: the group is centred top to bottom as ONE, so the room above it equals the room below
 *  (2D presenter-ladders.js, "the stacked pair shorter than the screen is centred top to bottom as one (equal room above and below, never closer than one margin to the top or the controls)":
 *  `max(0, min((H - stackH) / 2 - top0, foot - top0 - stackH))`). `top0` is the least room above, `foot` the lowest the group may reach (the screen's margin, or the pill's top when the column runs over it). A group too
 *  tall for that stays at `top0` (the caller lets it rise into the margin). Root of "the stack sits high with a big gap below" (Mohammad, 20 Nov): the planner used to start every wide pair at the top margin. */
export const pairTop = (H: number, total: number, top0: number, foot: number): number => top0 + Math.max(0, Math.min((H - total) / 2 - top0, foot - top0 - total));

/** Where the cards go. `active` is the wallet's showing card (iPhone: the other becomes the strip). `step` is the wallet's step on its side. */
export function planLayout(vp: Viewport, needs: Need[], active: Slot = 'words', step = 0, dock = false): Plan {
  const device = deviceClass(vp.w, vp.h);
  const layout = layoutOf(vp.w, vp.h);
  const sideways = isSideways(vp.w, vp.h);
  const { safe } = vp;
  const words = needs.find((n) => n.slot === 'words') ?? null;
  const data = needs.find((n) => n.slot === 'data') ?? null;
  const placed: Placed[] = [];
  let bar = barOf(vp);
  let strip: Strip | null = null, shut = false, docked = false, tucked: Rect | null = null;
  const maxH: Record<Slot, number> = { words: 0, data: 0 };
  let bounds: Rect;
  const extra: Rect[] = [];

  const alone = words && !data ? centredKind(words.id) : null;
  if (alone) {
    // the outline, the quick check and a case: one card in the middle, as tall as its words need (never past its room), the figure framed whole behind the veil
    const c = centredBox(vp, alone, panelVisual(words!)), h = Math.min(words!.h, c.maxH);
    maxH.words = maxH.data = c.maxH;
    const x = Math.round((vp.w - c.w) / 2), y = Math.round(c.top + (c.room - h) / 2);
    placed.push({ id: words!.id, slot: 'words', rect: { x, y: alone === 'case' ? Math.round((vp.h - h) / 2) : y, w: c.w, h } });
    bounds = { x: safe.left, y: safe.top, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - safe.bottom };
    return { device, layout, sideways, cards: placed, strip: null, shut: false, docked: false, tucked: null, free: bounds, overflow: words!.h > c.maxH + 0.5 ? [words!.id] : [], maxH, bar };
  } else if (sideways) {
    const steps = walletSteps(vp);
    const st = steps[Math.min(step, steps.length - 1)];
    const w = widthOf(vp, !!(words && data), step);
    const lo = Math.max(safe.left, 10), hi = bar.rect.x - 8 - w;
    const x = Math.round(Math.max(lo, Math.min((vp.w - w) / 2, hi)));
    if (words && data) {
      const shown = active === 'data' ? data : words, other = shown === data ? words : data;
      // the wallet stands between the top safe edge and the home bar: its numbers are the 2D wallet's for a screen that tall
      const top = topEdge(vp, 0), room = footEdge(vp, 0) - top;
      maxH.words = maxH.data = shufMaxH(room, st.room);
      const h = shown.h;
      placed.push({ id: shown.id, slot: shown.slot, rect: { x, y: Math.round(top + shufTop(room, h, SHUF.edge)), w, h } });
      strip = { id: other.id, slot: other.slot, rect: { x, y: footEdge(vp, 0) - STRIP_H, w, h: STRIP_H } };
    } else if (words || data) {
      const only = (words ?? data)!;
      const top = topEdge(vp, 10), foot = footEdge(vp, 10);
      maxH.words = maxH.data = foot - top;
      placed.push({ id: only.id, slot: only.slot, rect: { x, y: Math.round(pairTop(vp.h, only.h, top, foot)), w, h: only.h } });
    }
    bounds = { x: safe.left, y: safe.top, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - safe.bottom };
    extra.push(bar.rect);
  } else if (layout === 'stack' || layout === 'tab') {
    const w = widthOf(vp), x = layout === 'tab' ? Math.round((vp.w - w) / 2) : Math.max(8, safe.left);
    const foot = footReserve(vp);
    const dtop = safe.top + 8;
    const bottom = vp.h - foot;
    const room = vp.h - foot - 16;
    const wh = words?.h ?? 0, dh = data?.h ?? 0;
    const dmax = Math.round(0.42 * vp.h);
    const plan = phonePlan({ room, dtop, data: dh, dmax, lip: 0, regular: wh, mine: Math.round(0.62 * vp.h), grip: GRIP, figMin: FIG_MIN(vp.h), figFloor: figFloorOf(vp.h), gone: !data, hasData: !!data });
    shut = plan.shut && !!data && !!words;
    const stripAt = stripRect(vp, x, w);
    if (!shut) {
      maxH.words = Math.round(plan.cap);
      maxH.data = dmax;
      // 2D's dock: the reader's choice (kept from slide to slide) puts the data card away to its edge at the top; the words stay where they are
      docked = dock && !!data && !!words;
      if (data && !docked) placed.push({ id: data.id, slot: 'data', rect: { x, y: dtop, w, h: dh } });
      if (data && docked) { strip = { id: data.id, slot: 'data', rect: { x, y: dtop, w, h: GRIP } }; tucked = { x, y: dtop, w, h: dh }; }   // (2D's closed data card: its edge, GRIP px; the card itself stays up under it)
      if (words) placed.push({ id: words.id, slot: 'words', rect: { x, y: Math.round(bottom - wh), w, h: wh } });
    } else {
      const shown = active === 'data' ? data! : words!, other = shown === data ? words! : data!;
      // 2D's `room - grip` assumes a 34 px edge at the top; the strip here is STRIP_H and starts at dtop, so the words end CARD_GAP under it
      maxH.words = Math.round(Math.min(plan.cap, shutWordsCap(bottom, dtop)));
      maxH.data = Math.round(stripAt.y - CARD_GAP - dtop);
      if (shown === data) { placed.push({ id: data.id, slot: 'data', rect: { x, y: dtop, w, h: dh } }); strip = { id: other.id, slot: 'words', rect: stripAt }; }
      else { placed.push({ id: words!.id, slot: 'words', rect: { x, y: Math.round(bottom - wh), w, h: wh } }); strip = { id: other.id, slot: 'data', rect: { x, y: dtop, w, h: STRIP_H } }; }
    }
    bounds = { x: safe.left, y: safe.top, w: vp.w - safe.left - safe.right, h: bottom - safe.top };
  } else {
    // Mac, iPad on its side: words top left, the data card under it at the same width.
    const cm = margin(vp.w, vp.h, layout);
    const w = widthOf(vp);
    const x = Math.max(cm, safe.left);
    const top0 = Math.max(cm, safe.top + 8);
    const limit = vp.h - Math.max(cm, safe.bottom);
    const gap = pairGap(vp.w, vp.h, layout);
    const wh = words?.h ?? 0, dh = data?.h ?? 0;
    const overBar = x + w > bar.rect.x - 12;   // the column reaches the pill: the pair ends above it
    const foot = overBar ? bar.rect.y - 8 : limit;
    const total = wh + dh + (words && data ? gap : 0);
    // a pair a few px too tall rises into the top margin, never nearer than 4 px; past that it stays stacked (2D shrinks the data card's blocks, here the words page)
    const rise = Math.max(0, Math.min(top0 + total - foot, top0 - topEdge(vp, 4)));
    const y0 = rise > 0 ? top0 - rise : pairTop(vp.h, total, top0, foot);
    // The room a card has is what the pair could take standing at its highest (the top margin, or where it rose to), NOT where it stands now: the pair is centred by its own height, so
    // a cap measured from the centred top shrank with the data card (a chart that had drawn its small map left less room, which kept it the small map: the algorithm cards showed the iPhone
    // map on a Mac, 21 Nov). 2D's cap is `foot - top0 - the other card`, whatever the pair's height.
    const capTop = rise > 0 ? y0 : top0;
    maxH.words = Math.round(foot - capTop - (data ? gap + dh : 0));
    maxH.data = Math.round(foot - capTop - (words ? gap + wh : 0));
    if (words) placed.push({ id: words.id, slot: 'words', rect: { x, y: Math.round(y0), w, h: wh } });
    if (data) placed.push({ id: data.id, slot: 'data', rect: { x, y: Math.round(y0 + wh + (words ? gap : 0)), w, h: dh } });
    bounds = { x: safe.left, y: safe.top + 8, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - 8 };
    extra.push(bar.rect);
  }

  const blockers = placed.map((p) => p.rect).concat(strip ? [strip.rect] : [], extra);
  const overflow = placed.filter((p) => p.rect.h > maxH[p.slot] + 0.5).map((p) => p.id);
  return { device, layout, sideways, cards: placed, strip, shut, docked, tucked, free: largestFreeRect(bounds, blockers, layout === 'stack' || layout === 'tab' ? 4 : GAP), overflow, maxH, bar };
}

/** The width over height of the figure's box (the whole body plate is taller than wide): a free rectangle is judged by the tallest figure it holds. */
export const FIGURE_ASPECT = 0.62;

/** The free rectangle inside `bounds` that touches no blocker (each grown by `gap`) and holds the tallest figure of `aspect` (width over height); a wide
 *  sliver under a card holds less than the column between two cards. Few blockers, so every grid rectangle is tried. */
export function largestFreeRect(bounds: Rect, blockers: Rect[], gap = 0, aspect = FIGURE_ASPECT): Rect {
  const bx1 = bounds.x + bounds.w, by1 = bounds.y + bounds.h;
  const grown = blockers.map((r) => ({ x0: r.x - gap, y0: r.y - gap, x1: r.x + r.w + gap, y1: r.y + r.h + gap }));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const xs = [...new Set([bounds.x, bx1, ...grown.flatMap((g) => [g.x0, g.x1])].map((v) => clamp(v, bounds.x, bx1)))].sort((a, b) => a - b);
  const ys = [...new Set([bounds.y, by1, ...grown.flatMap((g) => [g.y0, g.y1])].map((v) => clamp(v, bounds.y, by1)))].sort((a, b) => a - b);
  let best: Rect = { x: bounds.x, y: bounds.y, w: 0, h: 0 }, score = -1, area = -1;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
    const x0 = xs[i], x1 = xs[j], y0 = ys[k], y1 = ys[l];
    if (grown.some((g) => g.x0 < x1 && g.x1 > x0 && g.y0 < y1 && g.y1 > y0)) continue;
    const w = x1 - x0, h = y1 - y0, a = w * h, sc = Math.min(h, w / aspect);
    if (sc > score + 0.5 || (Math.abs(sc - score) <= 0.5 && a > area)) { score = sc; area = a; best = { x: x0, y: y0, w, h }; }
  }
  return best;
}
