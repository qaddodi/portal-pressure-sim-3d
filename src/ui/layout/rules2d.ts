// The 2D app's card rules, ported as pure functions (owner, 19 Nov 2026: how cards are laid out and behave on iPhone, landscape iPhone, iPad and Mac
// must be the same as the 2D app, or better). Sources, in qaddodi/portal-pressure-simulator at the commit tests/fixtures/parity-2d.json names:
//   src/ui/util.js (the media queries), src/ui/card-scale.js (the type roles), src/ui/card-type.js (the steps, phonePlan, figFloorOf),
//   src/ui/card-shuffle.js (the wallet's numbers), styles/app-04-presenter.css (--pz-b, --pz-cm, --pz-cp, --pz-cw), app-05-presenter-cards.css (the stack).
// tests/ui-parity-2d.test.ts runs these against the 2D modules and the 2D stylesheet's own formulas for every 2D device size.
// Nothing here reads a page. Where the 3D app does better than the 2D one (the words never take a smaller size; a pair that cannot stack goes beside), it says so.

export type Layout = 'wide' | 'short' | 'stack' | 'tab';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ── which layout a screen gets (util.js: STACK_MQ, SHORT_SIDE_MQ, TABLET_UP_MQ, SIDEWAYS_MQ; presenter-ladders.js: phone(), short) ──
export const SHORT_H = 860;           // a wider screen this tall or less takes the compact layout (.pz.short)
export const SIDEWAYS_MAX_H = 500;    // a screen this short on its side is a phone held sideways: the wallet
export const GRIP = 34;               // a closed data card's edge on a phone (presenter-zoom.js)

/** CSS `orientation: portrait` is height ≥ width. */
const portraitOf = (w: number, h: number) => h >= w;
/** (max-width: 767px), (max-width: 1100px) and portrait. */
export const isStackMQ = (w: number, h: number) => w <= 767 || (w <= 1100 && portraitOf(w, h));
/** (orientation: landscape) and (max-height: 500px). */
export const isShortSide = (w: number, h: number) => !portraitOf(w, h) && h <= SIDEWAYS_MAX_H;
/** (min-width: 700px) and (max-width: 1100px) and portrait. */
export const isTabletUp = (w: number, h: number) => w >= 700 && w <= 1100 && portraitOf(w, h);
/** A phone held sideways: the wallet column (the 2D app gives it the Mac and iPad landscape layout, the compact one, and a wallet for a pair). */
export const isSideways = (w: number, h: number) => isShortSide(w, h) && w <= 1023;

/** phone() in presenter-zoom.js: the stacked layouts; every other screen floats its cards (short under 860 px tall). */
export function layoutOf(w: number, h: number): Layout {
  if (isStackMQ(w, h) && !isShortSide(w, h)) return isTabletUp(w, h) ? 'tab' : 'stack';
  return h <= SHORT_H ? 'short' : 'wide';
}

/** --pzh in px (app-01-chrome.css): 1vh, and on an upright tablet the smaller of that and .75vw. */
export function pzh(vw: number, vh: number): number { return vw >= 700 && vh >= vw ? Math.min(vh / 100, 0.75 * vw / 100) : vh / 100; }

/** --pz-b (app-04-presenter.css): the teaching card's body on a wide screen; the cards' geometry follows it. */
export const bodyB = (vw: number, vh: number, ts = 1) => clamp(2.311 * pzh(vw, vh), 17, 28) * ts;

// ── the card geometry of a floating card (wide, short; sideways takes the phone's own margins) ──
export function margin(vw: number, vh: number, layout: Layout, ts = 1): number {
  if (layout === 'stack' || layout === 'tab') return 8;
  if (isSideways(vw, vh)) return 10;
  return clamp(Math.min(0.026 * vw, 1.8 * bodyB(vw, vh, ts)), 16, 60);
}
export function padding(vw: number, vh: number, layout: Layout, ts = 1): number {
  if (isSideways(vw, vh)) return 14;
  return clamp(1.4 * bodyB(vw, vh, ts), 18, 40);
}
/** One card width: about 40 characters of body text (--pz-cw); a phone on its side, 340 at most (the wallet widens it, shufCol); stacked, the screen less its margins (an upright iPad, 70 %). */
export function cardWidth(vw: number, vh: number, layout: Layout, ts = 1): number {
  if (layout === 'stack') return vw - 16;
  if (layout === 'tab') return vw * 0.7;
  if (isSideways(vw, vh)) return Math.min(340, 0.42 * vw + 28);
  return Math.min(clamp(Math.min(0.38 * vw, 23.5 * bodyB(vw, vh, ts)), 340, 640), 0.42 * vw);
}
/** The corner radius of a floating card (--pz-r); a stacked card has 18. */
export const radius = (vw: number, vh: number, layout: Layout) => (layout === 'stack' || layout === 'tab' ? 18 : clamp(2.2 * pzh(vw, vh), 16, 28));
/** The gap between the words' card and the data card under it: 0.6 of the margin (presenter-ladders.js). */
export const pairGap = (vw: number, vh: number, layout: Layout, ts = 1) => Math.round(0.6 * margin(vw, vh, layout, ts));

// ── the type roles (card-scale.js) ──
type Role = 'cap' | 'lab' | 'body' | 'val' | 'big' | 'title';
export type Roles = Record<Role, number> & { sm: number; num: number; chCap: number; chLab: number; fs12: number; fs14: number };
const ROLE: Record<Role, [number, number, number]> = { cap: [12, 1.733, 21], lab: [14, 2.022, 24.5], body: [17, 2.311, 28], val: [20, 3.178, 38.5], big: [28, 4.622, 56], title: [32, 6.356, 77] };
const NAMES = Object.keys(ROLE) as Role[];
const T: Record<Role, (m: number) => number> = {
  cap: () => 12,
  lab: (m) => Math.min(14, Math.max(12, 12 + (m - 390) * 0.00392)),
  body: (m) => Math.min(16, Math.max(14, 14 + (m - 390) * 0.00392)),
  val: (m) => Math.min(22, Math.max(16, 16 + (m - 390) * 0.01176)),
  big: (m) => Math.min(32, Math.max(20, 20 + (m - 390) * 0.02353)),
  title: (m) => Math.min(44, Math.max(28, 28 + (m - 390) * 0.03137)),
};
type Rec = Record<Role, number>;
const wide = (h: number, ts: number, pk = 1, k = 1): Rec => { const o = {} as Rec; for (const n of NAMES) { const [lo, a, hi] = ROLE[n]; o[n] = clamp(a * h, lo, hi) * ts * pk * k; } return o; };
const tok = (m: number, ts: number, pk = 1): Rec => { const o = {} as Rec; for (const n of NAMES) o[n] = T[n](m) * ts * pk; return o; };
const pick = <K extends Role>(o: Rec, ks: K[]): Pick<Rec, K> => { const r = {} as Pick<Rec, K>; for (const k of ks) r[k] = o[k]; return r; };
const shortRoles = (m: number, ts: number, base: Rec): Rec => ({ ...base, ...pick(tok(m, ts), ['cap', 'body', 'val', 'big']), lab: Math.max(12, T.lab(m) * ts) });

export interface ScaleIn { vw: number; vh: number; layout: Layout; part: 'text' | 'panel' | 'data' | 'table' | 'grid' | 'cell'; card?: boolean; ts?: number; bk?: number; tk?: number }

/** The card's sizes at this place, px: the same numbers the 2D stylesheet computes (its --s-cap … --s-title). */
export function cardScale(inp: ScaleIn): Roles {
  const { vw, vh, part, layout } = inp;
  const card = inp.card ?? false, ts = inp.ts ?? 1, bk = inp.bk ?? 1, tk = inp.tk ?? 1;
  const h = pzh(vw, vh), m = Math.min(vw, vh);
  const stack = layout === 'stack' || layout === 'tab', short = layout === 'short';
  const landSmall = vw > vh && vh <= 500;
  const tp = stack ? (layout === 'tab' ? 1.39 : 1.45) : landSmall ? 1.3 : 1;   // --pk on the words and the panel
  let r: Rec;
  if (part === 'text') {
    if (stack) r = tok(m, ts, tp);
    else if (card) { r = wide(h, ts, tp, bk); r.cap = Math.max(12, r.cap); r.title = clamp(5.546 * h, 32, 67) * ts * tp * tk; }
    else r = wide(h, ts, tp);
  } else if (part === 'panel') r = stack ? tok(m, ts, tp) : short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);
  else if (part === 'table') {
    if (stack) r = tok(m, ts);
    else if (landSmall) r = { ...wide(h, ts, tp), ...pick(wide(h, ts), ['cap', 'lab', 'body', 'val']) };
    else r = short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);
  } else if (part === 'grid' || part === 'cell') {
    r = stack ? { ...tok(m, ts, 1.15), title: tok(m, ts).title } : short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);
  } else if (stack) { r = tok(m, ts); const k = layout === 'tab' ? 1.3 : 1.15; r.cap *= k; r.lab *= k; }
  else r = short ? shortRoles(m, ts, wide(h, ts)) : wide(h, ts);
  const sm = stack ? r.cap : Math.max(12, r.cap * 0.74);
  const chCap = stack ? r.cap : Math.max(12, r.cap * 0.74);
  return { ...r, sm, num: r.val * 1.08, chCap, chLab: stack ? r.lab : chCap * 1.5, fs12: Math.max(r.cap, 12), fs14: Math.max(r.cap * 1.12, 12.5) };
}

// ── card-type.js ──
/** A title stays clearly a title: at least this many times the words. */
export const TITLE_RATIO = 1.4;
export const WIDE = { title: 0.8, words: 0.88, tight: 0.62 } as const;
export const titleFloorK = (titlePx: number, bodyPx: number) => (titlePx > 0 && bodyPx > 0 ? Math.min(1, Math.max(WIDE.tight, TITLE_RATIO * bodyPx / titlePx)) : WIDE.tight);
export const dkFloorOf = (labelPx: number) => (labelPx > 12 ? 12 / labelPx : 1);

/** The figure's usual share of a phone's height, between the data card and the words (presenter-ladders.js). */
export const FIG_MIN = (H: number) => Math.round(Math.max(170, 0.3 * H));
/** The least a phone's figure gives way to. */
export const figFloorOf = (H: number) => Math.min(Math.round(Math.max(150, 0.22 * H)), Math.round(Math.max(170, 0.3 * H)));

export interface PhonePlanIn { room: number; dtop: number; data: number; dmax?: number; lip?: number; regular: number; mine: number; grip: number; figMin: number; figFloor: number; gone?: boolean; hasData?: boolean }
/** A phone's stack, planned from measured heights: the words keep Regular; the figure's share gives way first, then the data card comes in closed. */
export function phonePlan({ room, dtop, data, dmax = Infinity, lip = 0, regular, mine, grip, figMin, figFloor, gone = false, hasData = true }: PhonePlanIn) {
  let both = room - dtop - figMin, fig = figMin;
  const short = regular - (both - data);
  if (!gone && short > 0 && short <= figMin - figFloor) { both += short; fig = figMin - short; }
  const shut = !gone && hasData && (both - data < regular || data - lip > dmax + 0.5);
  const cap = shut
    ? Math.min(room - grip, Math.max(Math.min(mine, room - dtop - Math.min(data, dmax + lip)), regular))
    : Math.min(room - dtop - data, Math.max(Math.min(mine, both - data), regular));
  return { cap: Math.max(120, cap), shut, fig };
}

// ── card-shuffle.js: the wallet ──
export const SHUF = Object.freeze({
  strip: 48, gapTight: 6, colsUsual: 3, edge: 14, gap: 14,
  /** the wallet's card widths: min(px, share of the screen's width), narrowest first; a slide that needs more height takes the next (fewer lines of the same type) */
  cols: [[400, 0.62], [460, 0.62], [520, 0.62], [580, 0.72], [640, 0.76], [720, 0.84], [800, 0.92]] as ReadonlyArray<readonly [number, number]>,
});
export const shufCol = (i: number, vw: number) => { const [px, share] = SHUF.cols[Math.max(0, Math.min(SHUF.cols.length - 1, i))]; return Math.min(px, share * vw); };
/** The tallest a card in front can be: centred, with the strip and its gap below it (and the same above, so it stays centred). */
export const shufMaxH = (H: number, room = 0) => Math.max(0, room >= 2 ? H - SHUF.edge - SHUF.strip - SHUF.gapTight : H - 2 * (SHUF.strip + (room === 1 ? SHUF.gapTight : SHUF.gap)));
/** Where a card h tall stands (top): centred, and where too tall to be centred it stands as high as `edge`, its foot always above the strip. */
export const shufTop = (H: number, h: number, edge: number = SHUF.edge, k = 1) => Math.max(edge, Math.min((H - h) / 2, H - (SHUF.strip + SHUF.gapTight) * k - h));

/** The wallet's search order (presenter-ladders.js): the first three widths in each of the two tighter rooms, every width in the last. A slide takes the first step where the words alone and the data card fit. */
export const WALLET_STEPS: ReadonlyArray<{ room: number; col: number }> = [0, 1, 2].flatMap((room) => Array.from({ length: room < 2 ? SHUF.colsUsual : SHUF.cols.length }, (_, col) => ({ room, col })));

/** A card's inner padding (px): the 2D app's --pz-cp on a floating card; a stacked card's words stand 13 px in, its data card 10 by 12. */
export function cardPad(vw: number, vh: number): { x: number; y: number } {
  const layout = layoutOf(vw, vh);
  if (layout === 'stack' || layout === 'tab') return { x: 14, y: 12 };
  const p = Math.round(padding(vw, vh, layout));
  return { x: p, y: p };
}
