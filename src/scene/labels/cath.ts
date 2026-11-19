// The catheter's readings on the figure, as the 2D app draws them: a glass card with its pointer (FHVP at the tip, WHVP ahead of it), then,
// when the result is in, the two readings stacked with a bracket joining them, the HVPG they give beside it, and a thin leader from each
// reading to where it was taken (stage-cath.js, callout.js, cath-pill.js, cath-place.js; app.css .cath-label, .cath-sum).
//
// Nothing here is a number of this file's own. The sizes, paddings, type, gaps, bracket, leader, delays and curves are LABEL_STYLE.CATH
// (names.copied.ts, read from the 2D source by scripts/copy-label-names.mjs); the card's outline and the places of the readings are the 2D
// app's own code, copied whole (cath2d/*.copied.js). What is written here is the sums that join them to a screen of the 3D figure:
// how big a card is (the 2D app asks the page; here it is worked out from the text's width, so node can judge it), where the stack's rows
// stand, and the leaders' paths. Pure: no DOM, no three.js.
import { LS, rolePx, type Vp } from './type.ts';
import type { Box } from './geometry.ts';
import { outline } from './cath2d/callout-outline.copied.js';
import { PTR, KEEP } from './cath2d/callout-ptr.copied.js';
import { PILL_GAP, placePillsInto, pillsClear } from './cath2d/cath-pill.copied.js';
import { placeBeside } from './cath2d/cath-place.copied.js';

const C = LS.CATH;
export { PTR, KEEP, PILL_GAP };

export type CalloutKind = 'f' | 'w' | 's';
/** The reading's colour: the free vein's blue, the wedged vein's, or the band the HVPG falls in. */
export type Tone = 'free' | 'wedge' | 'ok' | 'caution' | 'danger';
export interface Reading { kicker: string; value: string; unit: string; tone: Tone }
export interface Rect { x: number; y: number; w: number; h: number }
export type Measure = (text: string, size: number, weight: number, trackPx?: number) => number;
export type Pt = readonly [number, number];

const ceil2 = (n: number) => Math.ceil(n * 100) / 100;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const isResult = (t: Tone) => t === 'ok' || t === 'caution' || t === 'danger';

// ── the type and the card ──

/** Inter's vertical metrics (the app's UI face). The 2D app lets the browser lay a card out (`line-height: normal`); a card here is sized in node, so
 *  the one number it needs from the face is how tall a line of it is: 1.21 em, ascent 0.969 and descent 0.241. */
export const INTER = { asc: 0.96875, desc: 0.2412 } as const;
const normal = (px: number) => px * (INTER.asc + INTER.desc);

export interface CathType { padTop: number; padX: number; padBottom: number; radius: number; border: number; gap: number; name: number; num: number; unit: number }
/** The card's paddings, radius and type at this screen, as a presentation sets them (app.css `.app.presenting .cath-label`: the label size, up to its cap; the roles at this size). */
export function cathType(vp: Vp): CathType {
  const P = C.PRESENTING, k = Math.min(LS.LABEL_K, P.cap);
  return { padTop: P.padTop * k, padX: P.padX * k, padBottom: P.padBottom * k, radius: P.radius * k, border: C.CARD.border, gap: C.CARD.gap, name: rolePx('lab', vp), num: rolePx('big', vp), unit: rolePx('lab', vp) };
}

/** The custom properties a layer carries so the stylesheet holds no number of its own for these cards. */
export function cathVars(vp: Vp): Record<string, string> {
  const t = cathType(vp), px = (n: number) => `${Math.round(n * 100) / 100}px`, T = C.STACK.tightRow;
  return {
    '--cl-pad': `${px(t.padTop)} ${px(t.padX)} ${px(t.padBottom)}`, '--cl-r': px(t.radius), '--cl-border': px(t.border), '--cl-gap': px(t.gap),
    '--cl-name': px(t.name), '--cl-name-w': String(C.NAME.weight), '--cl-track': `${C.NAME.track}em`, '--cl-track-result': `${C.NAME.resultTrack}em`,
    '--cl-num': px(t.num), '--cl-num-w': String(C.NUMBER.weight), '--cl-num-line': String(C.NUMBER.line),
    '--cl-unit': px(t.unit), '--cl-unit-w': String(C.UNIT.weight), '--cl-unit-lift': px(C.UNIT.lift),
    '--cl-tpad': `${px(T.padTop)} ${px(T.padX)} ${px(T.padBottom)}`, '--cl-tr': px(T.radius), '--cl-tgap': px(T.gap), '--cl-tnum': px(T.numberSize),
    '--cl-lead-w': String(C.LEAD.stroke), '--cl-dot-w': String(C.LEAD.dotStroke), '--cl-brace-w': String(C.BRACE.stroke),
    '--cl-caution-mix': `${C.CAUTION_MIX}%`,
  };
}

/** How far each reading's colour steps toward the text colour in its ink, per look (tokens.css: :root, [data-theme="soft"], and the dark looks, which keep the trace colour). */
const INK = {
  light: { tr: 62, ok: 88, caution: 70, danger: 88 },
  soft: { tr: 55, ok: 80, caution: 70, danger: 80 },
  dark: { tr: 100, ok: 88, caution: 70, danger: 88 },
} as const;
const inkVars = (look: string): Record<string, string> => {
  const k = INK[look === 'light' || look === 'soft' ? look : 'dark'], mix = (c: string, n: number) => (n >= 100 ? `var(${c})` : `color-mix(in srgb, var(${c}) ${n}%, var(--cl-text))`);
  return { '--cl-hv-ink': mix('--cl-hv', k.tr), '--cl-wedge-ink': mix('--cl-wedge', k.tr), '--cl-ok-ink': mix('--cl-ok', k.ok), '--cl-caution-ink': mix('--cl-caution', k.caution), '--cl-danger-ink': mix('--cl-danger', k.danger) };
};

/** The ink and glass of a look for these cards (the look's own tokens, copied): the free and wedged tones, the bands, the glass tint and its hairline. */
export function cathLook(look: string): Record<string, string> {
  const t = (LS.LOOKS as Record<string, Record<string, string>>)[look];
  if (!t) throw new Error(`no label ink for the look "${look}"`);
  return {
    '--cl-hv': t['tr-hv'], '--cl-wedge': t['tr-wedge'], '--cl-ok': t['ok'], '--cl-caution': t['caution'], '--cl-danger': t['danger'],
    '--cl-text': t['text'], '--cl-text3': t['text-3'], '--cl-edge': t['hairline'], '--cl-surface': t['surface'],
    // the words' ink: the colour a step toward the text colour so it clears 4.5:1 (tokens.css --tr-hv-ink, --ok-ink… per look)
    ...inkVars(look),
  };
}

/** A reading card's size (border box): the widest of its name, its number and its unit, and the three lines stacked; a tight card (a short free band)
 *  keeps all three on one line. A number counts every digit as one width (the figures are tabular), so a value counting up keeps its box. */
export function pillSize(t: CathType, r: Reading, measure: Measure, tight: boolean): { w: number; h: number } {
  const trackEm = isResult(r.tone) ? C.NAME.resultTrack : C.NAME.track;
  const wName = measure(r.kicker, t.name, C.NAME.weight, trackEm * t.name);
  const shape = r.value.replace(/\d/g, '0');
  const wUnit = measure(r.unit, t.unit, C.UNIT.weight);
  if (!tight) {
    const wNum = measure(shape, t.num, C.NUMBER.weight);
    const w = Math.max(wName, wNum, wUnit) + 2 * t.padX + 2 * t.border;
    const h = t.padTop + t.padBottom + 2 * t.border + normal(t.name) + t.gap + t.num * C.NUMBER.line + t.gap + normal(t.unit) + C.UNIT.lift;
    return { w: ceil2(w), h: ceil2(h) };
  }
  const R = C.STACK.tightRow, n = R.numberSize;
  const wNum = measure(shape, n, C.NUMBER.weight);
  const w = wName + R.gap + wNum + R.gap + wUnit + 2 * R.padX + 2 * t.border;
  // a row of baseline-aligned words: the number's line is 1.1 tall, so its half-leading is negative
  const half = (n * C.NUMBER.line - normal(n)) / 2;
  const asc = Math.max(INTER.asc * t.name, INTER.asc * n + half, INTER.asc * t.unit), desc = Math.max(INTER.desc * t.name, INTER.desc * n + half, INTER.desc * t.unit);
  return { w: ceil2(w), h: ceil2(R.padTop + R.padBottom + 2 * t.border + asc + desc) };
}

// ── a card's one glass shape (callout.js: the card and its pointer are one outline) ──

export type Dir = 'top' | 'bottom' | 'none';
export interface Glass { /** relative to the card's own corner */ left: number; top: number; w: number; h: number; /** where the pointer leaves the card, from its left edge */ px: number; /** the outline, in the glass's own frame */ d: string }

/** The shape of a card w × h (border box) with its pointer on its `dir` edge, the point it names `ax` px from the card's centre (positive: to the right).
 *  The pointer's base stays KEEP from the card's sides and leans no more than 0.4 of the card's width (callout.js update, not leaning). */
export function pillGlass(w: number, h: number, r: number, dir: Dir, ax: number): Glass {
  const want = w / 2 + Math.max(-0.4 * w, Math.min(0.4 * w, ax));
  const px = Math.max(KEEP, Math.min(w - KEEP, want)), up = dir === 'top' ? PTR : 0;
  const gh = +(h + (dir === 'none' ? 0 : PTR)).toFixed(2);
  return { left: 0, top: up ? -up : 0, w, h: gh, px, d: outline(w, h, Math.min(r, h / 2), up, px, dir, PTR, px, 0) };
}

// ── where the readings stand ──

/** The room the readings stand in, canvas px: the figure's view (under the top bar, inside the safe areas). */
export type Band = Box;
export interface Side { above: boolean; dx: number }
export interface PillIn { id: string; x: number; y: number; w: number; h: number; /** the side it prefers: the free reading above its point, the wedged one below */ prefer: boolean; was: Side | null }
export interface PillOut {
  id: string; side: Side;
  /** the card's corner, canvas px */ x0: number; y0: number;
  /** the pointer is on the card's bottom edge (the card is above its point) or on its top */ dir: 'top' | 'bottom';
  /** the card and its pointer's run to the point, a box a station's name keeps clear of */ box: Box;
}

const shiftBox = (b: Box, dx: number): Box => ({ x0: b.x0 - dx, y0: b.y0, x1: b.x1 - dx, y1: b.y1 });

/** The two readings' places, together (cath-pill.js placePillsInto, the 2D app's own): above or below their points and slid sideways so neither stands on a
 *  card, the stage's edge or the other. A reading keeps its place while it stays clear (cath-pill.js pillsClear), and only then; the card is kept in the band
 *  with its pointer on the point (stage-cath.js cathLabels). */
export function placePills(items: readonly PillIn[], band: Band, blockers: readonly Box[]): PillOut[] {
  if (!items.length) return [];
  const W = band.x1 - band.x0, top = band.y0 + C.BAND.top, lim = band.y1 - C.BAND.bottom;
  const recs = items.map((i) => ({ x: i.x - band.x0, y: i.y, w: i.w, h: i.h, prefer: i.prefer, was: i.was }));
  const q = { pills: recs, W, top, lim, blockers: blockers.map((b) => shiftBox(b, band.x0)) };
  const sides: Side[] = recs.map(() => ({ above: true, dx: 0 }));
  if (items.some((i) => !i.was) || !pillsClear(q)) placePillsInto(q, sides);
  else items.forEach((i, n) => { sides[n].above = i.was!.above; sides[n].dx = i.was!.dx; });
  return items.map((it, n) => {
    const side = sides[n], r = recs[n], half = r.w / 2;
    // kept inside the stage: the box moves in and its pointer stays on the point; and inside the band the cards leave
    const bTop = band.y0 + C.BAND.top, bBot = Math.max(bTop, band.y1 - C.BAND.bottom - r.h);
    const cx = clamp(r.x + side.dx, Math.min(half + 8, W / 2), Math.max(W - half - 8, W / 2)), cy = clamp(side.above ? r.y - PILL_GAP - r.h : r.y + PILL_GAP, bTop, bBot);
    const above = cy + r.h / 2 < r.y;
    const x0 = cx - half + band.x0;
    const box = above ? { x0, y0: cy, x1: x0 + r.w, y1: Math.max(r.y, cy + r.h) } : { x0, y0: Math.min(r.y, cy), x1: x0 + r.w, y1: cy + r.h };
    return { id: it.id, side: { above: side.above, dx: side.dx }, x0, y0: cy, dir: above ? 'bottom' : 'top', box };
  });
}

/** The stack's rows, whichever order they stand in: the lower point's reading is the lower row (stage-cath.js). A near tie keeps the order it had. */
export const swapOf = (tipY: number, aheadY: number, was: boolean): boolean => {
  const dy = aheadY - tipY, s = C.STACK.swapDy;
  return dy > s ? true : dy < -s ? false : was;
};
/** Whether the stack keeps each reading to one line: a short free band takes them on one line each so the stack fits beside the vein. */
export const tightFor = (band: Band): boolean => band.y1 - stackTop(band) < C.STACK.tightBelow;
const stackTop = (band: Band) => Math.max(C.STACK.top, band.y0 + C.STACK.topPad);

export interface SumGeom {
  /** the box round the stack, its bracket and the HVPG */ w: number; h: number;
  /** the two readings' rows, in the order they were given (WHVP, FHVP), and the HVPG's card, in the box's own frame */ rows: [Rect, Rect]; calc: Rect;
  brace: { x: number; w: number; h: number; d: string };
  tight: boolean; swap: boolean;
}

/** The stack box's least height, px. The 2D app draws the bracket as an `<svg>` with no height until it has measured the box, and an svg with no height is
 *  150 px tall (the replaced-element default), so its box (`.cath-sum-box`, items centred) is never shorter than that: on a phone the two one-line
 *  readings (about 75 px) stand centred in a 150 px box, which is what the placing and the leaders' room are worked from. Copied, not corrected. */
export const STACK_MIN_H = 150;

/** The stack: two readings in a column (stretched to the widest), the bracket, then the HVPG, centred on the column's height. */
export function sumLayout(t: CathType, rows: readonly [Reading, Reading], calc: Reading, measure: Measure, tight: boolean, swap: boolean): SumGeom {
  const S = C.STACK, gap = tight ? S.tightGap : S.gap;
  const sz = [pillSize(t, rows[0], measure, tight), pillSize(t, rows[1], measure, tight)], cs = pillSize(t, calc, measure, tight);
  const colW = Math.max(sz[0].w, sz[1].w), colH = sz[0].h + sz[1].h + gap, h = Math.max(colH, cs.h, STACK_MIN_H);
  const R: [Rect, Rect] = [{ x: 0, y: 0, w: colW, h: sz[0].h }, { x: 0, y: 0, w: colW, h: sz[1].h }];
  let y = (h - colH) / 2;
  for (const j of swap ? [1, 0] : [0, 1]) { R[j].y = y; y += sz[j].h + gap; }
  const B = C.BRACE, braceX = colW + S.beside, calcX = braceX + B.width + S.beside;
  const m0 = R[0].y + R[0].h / 2, m1 = R[1].y + R[1].h / 2, ys0 = Math.min(m0, m1), ys1 = Math.max(m0, m1);
  const f = (n: number) => +n.toFixed(2);
  return {
    w: ceil2(calcX + cs.w), h: ceil2(h), rows: R, calc: { x: calcX, y: (h - cs.h) / 2, w: cs.w, h: cs.h },
    brace: { x: braceX, w: B.width, h: ceil2(h), d: `M${B.x0} ${f(ys0)} H${B.x1} V${f(ys1)} H${B.x2} M${B.x3} ${f((ys0 + ys1) / 2)} H${B.x4}` },
    tight, swap,
  };
}

/** The stack's top-left (cath-place.js placeBeside, the 2D app's own): beside the points, above or below them, clear of the cards and of the vein between the
 *  points, whichever covers least. Canvas px in and out. */
export function placeStack(tip: Pt, ahead: Pt, bw: number, bh: number, band: Band, blockers: readonly Box[]): { x: number; y: number } {
  const S = C.STACK, W = band.x1 - band.x0, top = stackTop(band), lim = band.y1;
  const A = { tip: [tip[0] - band.x0, tip[1]], ahead: [ahead[0] - band.x0, ahead[1]] };
  const seg = (x0: number, y0: number, x1: number, y1: number) => ({ x0: x0 - 8, y0: y0 - 8, x1: x1 + 8, y1: y1 + 8 });
  // the two points and the stretch of vein between them: the stack never stands on it
  const keep = [seg(Math.min(A.tip[0], A.ahead[0]), Math.min(A.tip[1], A.ahead[1]), Math.max(A.tip[0], A.ahead[0]), Math.max(A.tip[1], A.ahead[1])), seg(A.ahead[0], A.ahead[1], A.ahead[0], A.ahead[1])];
  const p = placeBeside({ A, bw, bh, W, top, lim, off: S.off, blockers: blockers.map((b) => shiftBox(b, band.x0)), keep });
  return { x: p.x + band.x0, y: p.y };
}

/** A leader from each reading's row to its point (stage-cath.js): beside the points, straight out of the row's left edge; else the nearer row from its edge and the
 *  other round the stack's side. Paths in the box's own frame, with the points the dots stand on. */
export function leadersOf(boxAt: Pt, geom: SumGeom, points: readonly [Pt, Pt], tip: Pt, ahead: Pt): { d: [string, string]; dots: [Pt, Pt] } {
  const [x, y] = boxAt, R = geom.rows, bh = geom.h;
  const below = (tip[1] + ahead[1]) / 2 > y + bh / 2;
  const rTop = R[1].y < R[0].y ? 1 : 0, rBot = R[1].y > R[0].y ? 1 : 0, near = below ? rBot : rTop;
  const colTop = y + R[rTop].y, colBot = y + R[rBot].y + R[rBot].h;
  const beside = x >= Math.max(tip[0], ahead[0]) + C.STACK.besideAt;
  const f = (n: number) => (n - 0).toFixed(1);
  const d = ['', ''] as [string, string];
  for (let j = 0; j < 2; j++) {
    const [px, py] = points[j];
    const rx0 = x + R[j].x, ry0 = y + R[j].y, rx1 = rx0 + R[j].w, ry1 = ry0 + R[j].h, my = (ry0 + ry1) / 2;
    const ox = (n: number) => f(n - x), oy = (n: number) => f(n - y);
    if (beside) d[j] = `M${ox(rx0)} ${oy(my)} L${ox(px)} ${oy(py)}`;
    else if (j === near) d[j] = `M${ox(clamp(px, rx0 + 12, rx1 - 12))} ${oy(below ? ry1 : ry0)} L${ox(px)} ${oy(py)}`;
    else { const ex = rx0 - 12, ey = below ? colBot + 14 : colTop - 14; d[j] = `M${ox(rx0)} ${oy(my)} H${ox(ex)} V${oy(ey)} L${ox(px)} ${oy(py)}`; }
  }
  return { d, dots: [[points[0][0] - x, points[0][1] - y], [points[1][0] - x, points[1][1] - y]] };
}

// ── how they come ──

/** A CSS cubic-bezier, solved: the 2D app's own curves (tokens.css --ease-move, --ease-arrive). */
export function bezier([x1, y1, x2, y2]: readonly number[]): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (u: number) => {
    if (u <= 0) return 0; if (u >= 1) return 1;
    let lo = 0, hi = 1, t = u;
    for (let i = 0; i < 24; i++) { const x = X(t); if (Math.abs(x - u) < 1e-5) break; if (x < u) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
export const easeMove = bezier(C.EASE_MOVE), easeArrive = bezier(C.EASE_ARRIVE);

/** How the summary comes, `u` ms after the result arrives (app.css `.cath-sum`, cath-flip.js): the readings travel from where their cards stood into their rows over a
 *  surface step (a result with no cards before it rises 6 px and fades in instead); the bracket and the leaders follow after 650 ms and the HVPG, with a small rise, after 750. */
export const SUM_MS = { travel: C.MS.surface, brace: C.MS.braceDelay, calc: C.MS.calcDelay, total: C.MS.calcDelay + C.MS.surface } as const;
export interface Flow { /** what is left of the travel, 1 → 0 */ flip: number; /** the stack's own rise (no travel), px */ rise: number; lead: number; calc: number; calcRise: number }
export function sumFlow(u: number, travels: boolean): Flow {
  const k = (a: number, b: number) => clamp((u - a) / b, 0, 1);
  const calc = easeArrive(k(SUM_MS.calc, SUM_MS.travel));
  return {
    flip: travels ? 1 - easeMove(k(0, SUM_MS.travel)) : 0,
    rise: travels ? 0 : C.RISE * (1 - easeArrive(k(0, SUM_MS.travel))),
    lead: easeArrive(k(SUM_MS.brace, SUM_MS.travel)), calc, calcRise: C.RISE * (1 - calc),
  };
}
