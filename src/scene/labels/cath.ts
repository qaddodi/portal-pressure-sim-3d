// The catheter's readings on the figure: a tag (words with a halo, "FHVP 8.1 mmHg" on one line, the station labels' own look) with a leader and a dot to the point
// it was taken at (FHVP at the tip, WHVP ahead of it), then, when the result is in, the two readings stacked with a bracket joining them, the HVPG they give beside
// it, and a thin leader from each reading to where it was taken (the 2D app's stage-cath.js, cath-pill.js, cath-place.js; app.css .cath-sum). There is no card, no
// glass and no pointer: 2D's speech-bubble outline is not copied here at all (Mohammad, 22 and 23 Nov).
//
// Nothing here is a number of this file's own. The sizes, gaps, bracket, leader, delays and curves are LABEL_STYLE (names.copied.ts, read from the 2D source by
// scripts/copy-label-names.mjs); the places of the readings are the 2D app's own code, copied whole (cath2d/*.copied.js). What is written here is the sums that
// join them to a screen of the 3D figure: how big a tag is (worked out from the text's width, so node can judge it), where the stack's rows stand, and the leaders'
// paths. Pure: no DOM, no three.js.
import { LS, fontPx, rolePx, type Vp } from './type.ts';
import { DEVICE_TOKENS } from '../procedures/copied/device-tokens.copied.ts';
import type { Box } from './geometry.ts';
import { PILL_GAP, placePillsInto, pillsClear } from './cath2d/cath-pill.copied.js';
import { placeBeside } from './cath2d/cath-place.copied.js';
import { planStack } from './cath2d/cath-leads.copied.js';

const C = LS.CATH;
export { PILL_GAP };

export type CalloutKind = 'f' | 'w' | 's' | 'm';
/** The reading's colour: the free vein's blue, the wedged vein's, the portal vein's (the EUS needle's), or the band the HVPG falls in. */
export type Tone = 'free' | 'wedge' | 'pv' | 'ivc' | 'ok' | 'caution' | 'danger';
export interface Reading { kicker: string; value: string; unit: string; tone: Tone }
export interface Rect { x: number; y: number; w: number; h: number }
export type Measure = (text: string, size: number, weight: number, trackPx?: number) => number;
export type Pt = readonly [number, number];

const ceil2 = (n: number) => Math.ceil(n * 100) / 100;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const isResult = (t: Tone) => t === 'ok' || t === 'caution' || t === 'danger';

// ── the type and the tag ──

/** The air round a tag's words in its box, px (a mark's, 2D's own MARK_AIR). */
export const TAG_AIR = 2;
/** A reading's type at this screen: the station labels' own roles (a name, a number, a unit), so "FHVP 8.1 mmHg" reads as "Varices 17.7" does. */
export interface TagType { name: number; num: number; unit: number; /** the portal blood's split headline only (the 2D 'big' role) */ big: number; /** name to number, number to unit, px */ gapVal: number; gapUnit: number; air: number; /** the tag's line, px */ line: number }
export function tagType(vp: Vp): TagType {
  const k = LS.LABEL_K, name = fontPx(LS.NAME.size, vp), num = fontPx(LS.VALUE.size, vp), unit = fontPx(LS.UNIT.size, vp);
  return { name, num, unit, big: rolePx('big', vp), gapVal: LS.NAME_TO_VALUE * k, gapUnit: LS.UNIT.gap * k, air: TAG_AIR, line: Math.max(name, num, unit) * LS.LINE_H };
}

/** The custom properties a layer carries so the stylesheet holds no number of its own for these tags (the leader's and the bracket's strokes; the tags' own type is the station labels': typeVars). */
export function cathVars(vp: Vp): Record<string, string> {
  void vp;
  return {
    '--cl-air': `${TAG_AIR}px`, '--cl-lead-w': String(C.LEAD.stroke), '--cl-dot-w': String(C.LEAD.dotStroke), '--cl-brace-w': String(C.BRACE.stroke),
    '--cl-caution-mix': `${C.CAUTION_MIX}%`,
  };
}

/** How far each reading's colour steps toward the text colour in its ink, per look (tokens.css: :root, [data-theme="soft"], and the dark looks, which keep the trace colour). A reading is words with a halo now,
 *  with no card behind it, so each ink is held to 4.5:1 (WCAG AA) against its halo over the worst the figure can put under it, black or white (tests/no-bubble-callouts.test.ts computes every one): the amber, green
 *  and red of the light looks stepped further toward the text than they did on a card (62, 88 and 70 were measured at 4.2 to 4.4 over black). `tr` is the blue and teal traces, `wedge` the amber one. */
const INK = {
  light: { tr: 60, wedge: 56, pv: 60, ok: 82, caution: 62, danger: 82 },
  soft: { tr: 54, wedge: 44, pv: 54, ok: 80, caution: 70, danger: 80 },
  dark: { tr: 100, wedge: 100, pv: 92, ok: 88, caution: 70, danger: 88 },
} as const;
const inkVars = (look: string): Record<string, string> => {
  const k = INK[look === 'light' || look === 'soft' ? look : 'dark'], mix = (c: string, n: number) => (n >= 100 ? `var(${c})` : `color-mix(in srgb, var(${c}) ${n}%, var(--cl-text))`);
  return { '--cl-hv-ink': mix('--cl-hv', k.tr), '--cl-wedge-ink': mix('--cl-wedge', k.wedge), '--cl-pv-ink': mix('--cl-pv', k.pv), '--cl-ivc-ink': mix('--cl-ivc', k.tr), '--cl-ok-ink': mix('--cl-ok', k.ok), '--cl-caution-ink': mix('--cl-caution', k.caution), '--cl-danger-ink': mix('--cl-danger', k.danger) };
};

/** The ink of a look for these tags (the look's own tokens, copied): the free and wedged tones, the bands, the text and the surface a leader's dot is ringed with. */
export function cathLook(look: string): Record<string, string> {
  const t = (LS.LOOKS as Record<string, Record<string, string>>)[look];
  if (!t) throw new Error(`no label ink for the look "${look}"`);
  return {
    '--cl-hv': t['tr-hv'], '--cl-wedge': t['tr-wedge'], '--cl-pv': (DEVICE_TOKENS as Record<string, { trPv: string }>)[look]?.trPv ?? t['tr-wedge'], '--cl-ivc': (DEVICE_TOKENS as Record<string, { trIvc: string }>)[look]?.trIvc ?? t['tr-hv'], '--cl-ok': t['ok'], '--cl-caution': t['caution'], '--cl-danger': t['danger'],
    '--cl-text': t['text'], '--cl-text3': t['text-3'], '--cl-surface': t['surface'],
    // the words' ink: the colour a step toward the text colour so it clears 4.5:1 (tokens.css --tr-hv-ink, --ok-ink… per look)
    ...inkVars(look),
  };
}

/** A reading's size (its box): the name, the number and the unit on one line, as the station labels set them, and a breath of air round. A number counts every digit as one width (the figures are
 *  tabular), so a value counting up keeps its box. A name alone (a caliper's "7.3 mm", a bracket's "PPG 6.2") is the same tag without a number. */
export function tagSize(t: TagType, r: Reading, measure: Measure): { w: number; h: number } {
  const wName = r.kicker ? measure(r.kicker, t.name, LS.NAME.weight, 0) : 0;
  const wNum = r.value ? measure(r.value.replace(/\d/g, '0'), t.num, LS.VALUE.weight) : 0;
  const wUnit = r.unit ? measure(r.unit, t.unit, LS.UNIT.weight) : 0;
  let w = wName;
  if (wNum) w += (w ? t.gapVal : 0) + wNum;
  if (wUnit) w += (w ? t.gapUnit : 0) + wUnit;
  return { w: ceil2(w + 2 * t.air), h: ceil2(t.line + 2 * t.air) };
}

// ── where the readings stand ──

/** The room the readings stand in, canvas px: the figure's view (under the top bar, inside the safe areas). */
export type Band = Box;
export interface Side { above: boolean; dx: number }
export interface PillIn { id: string; x: number; y: number; w: number; h: number; /** the side it prefers: the free reading above its point, the wedged one below */ prefer: boolean; was: Side | null;
  /** The side it must stand on (the EUS-PPG's pair: the upper point's reading above it, the lower one's below, so the calculation fits between them). Absent: the free choice. */ force?: boolean }
export interface PillOut {
  id: string; side: Side;
  /** the card's corner, canvas px */ x0: number; y0: number;
  /** the tag stands above its point (else below it) */ above: boolean;
  /** the tag and its leader's run to the point, a box a station's name keeps clear of */ box: Box;
}

const shiftBox = (b: Box, dx: number): Box => ({ x0: b.x0 - dx, y0: b.y0, x1: b.x1 - dx, y1: b.y1 });

/** The two readings' places, together (cath-pill.js placePillsInto, the 2D app's own): above or below their points and slid sideways so neither stands on a
 *  card, the stage's edge or the other. A reading keeps its place while it stays clear (cath-pill.js pillsClear), and only then; the tag is kept in the band
 *  with its leader on the point (stage-cath.js cathLabels). */
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
    if (items[n]!.force !== undefined) side.above = items[n]!.force!;
    // kept inside the stage: the box moves in and its leader stays on the point; and inside the band the cards leave
    const bTop = band.y0 + C.BAND.top, bBot = Math.max(bTop, band.y1 - C.BAND.bottom - r.h);
    const cx = clamp(r.x + side.dx, Math.min(half + 8, W / 2), Math.max(W - half - 8, W / 2)), cy = clamp(side.above ? r.y - PILL_GAP - r.h : r.y + PILL_GAP, bTop, bBot);
    const above = cy + r.h / 2 < r.y;
    const x0 = cx - half + band.x0;
    const box = above ? { x0, y0: cy, x1: x0 + r.w, y1: Math.max(r.y, cy + r.h) } : { x0, y0: Math.min(r.y, cy), x1: x0 + r.w, y1: cy + r.h };
    return { id: it.id, side: { above: side.above, dx: side.dx }, x0, y0: cy, above, box };
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
export function sumLayout(t: TagType, rows: readonly [Reading, Reading], calc: Reading, measure: Measure, tight: boolean, swap: boolean): SumGeom {
  const S = C.STACK, gap = tight ? S.tightGap : S.gap;
  const sz = [tagSize(t, rows[0], measure), tagSize(t, rows[1], measure)], cs = tagSize(t, calc, measure);
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

/** The stack's order of rows and its leaders as the 2D app plans them (cath-leads.js, copied): the order that follows the points (the reading whose point stands lower is
 *  the lower row; a near tie keeps `kept`), the other order only when the first crosses its leaders or runs one through the other row and the other does not.
 *  The rows' sizes come from `geom`, whatever order it was laid out in; the leaders leave straight out of their rows (beside the points), from the edge that faces
 *  them, or round the column's far end. Paths in the box's own frame, with the dots on the points; `swap` is the order to lay the rows out in, `clean` whether nothing crosses. */
export function planLeaders(boxAt: Pt, geom: SumGeom, points: readonly [Pt, Pt], kept: boolean): { swap: boolean; clean: boolean; d: [string, string]; dots: [Pt, Pt] } {
  const [x, y] = boxAt, R = geom.rows.map((r) => [r.x, r.y, r.w, r.h]);
  const S = planStack(points.map((p) => [p[0], p[1]]), R, x, y, geom.w, geom.h, kept, false);
  const f = (n: number) => n.toFixed(1), d = ['', ''] as [string, string];
  for (let j = 0; j < 2; j++) {
    const L = S.lead[j] as Float64Array;
    for (let k = 0; k < S.n[j]; k++) d[j] += `${k ? ' L' : 'M'}${f(L[k * 2] - x)} ${f(L[k * 2 + 1] - y)}`;
  }
  return { swap: S.swap as boolean, clean: S.clean as boolean, d, dots: [[points[0][0] - x, points[0][1] - y], [points[1][0] - x, points[1][1] - y]] };
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
