// The plane chart's layout (2D: visual-plane.js). Every function that decides a place, a size or a word is the 2D file's own, copied by scripts/copy-chart-plane.mjs into
// layout.generated.js; this file adds the types and the one thing the 2D file does inside its DOM code: planeLayout(), the order in which draw() asks for the numbers, the
// points' names, the zones' words, the lines, the trail's names and the card's words (visual-plane.js planePlot().draw), as a pure function of the box and the data.
import {
  PLANES as PLANES0, planeOf as planeOf0, fitPlane as fitPlane0, zoneOf as zoneOf0, readKeys as readKeys0, shownReading as shownReading0, frame as frame0, bleed as bleed0, widen as widen0, scaler as scaler0,
  plotNumbers as plotNumbers0, cutNumbers as cutNumbers0, hasAxes as hasAxes0, axesFrame as axesFrame0, axesMarks as axesMarks0, cutSegs as cutSegs0, gapSegs as gapSegs0, diagOf as diagOf0, isoOf as isoOf0,
  layoutPlane as layoutPlane0, pointR as pointR0, wasAt as wasAt0, wasBoxes as wasBoxes0, leadBoxes as leadBoxes0, dotSize as dotSize0, dotBoxes as dotBoxes0, placeCardWords as placeCardWords0, trailBoxes as trailBoxes0,
  placeStopNames as placeStopNames0, zoneRect as zoneRect0, lineBoxes as lineBoxes0,
} from './layout.generated.js';
import { tileShown } from './shim.ts';
import { fullIsoNames } from './iso-names.ts';
import { TILE } from '../tiles.generated.ts';
import { fmt } from '../fmt.ts';
import { lcFirst } from '../../../engine/hales/portal/lc-first.js';

export type Box = [number, number, number, number];
export type Fp = Readonly<Record<string, number | null | undefined>>;
/** An axis: a fingerprint key with its range, ticks and names (2D: PLANES). */
export interface Axis { key: string; min?: number; max: number; ticks?: number[]; name?: string; short?: string; abbr?: string; only?: string; fullFrom?: number }
export interface Zone { when?: [string, '<' | '<=' | '>' | '>=', number][]; t: string; short?: string; tone?: string; at?: [number, number]; note?: string }
export interface PlaneDef {
  x: Axis; y: Axis; zones: Zone[]; boxes?: Zone[]; cuts?: { x?: number[]; y?: number[] }; noLine?: { x?: number[]; y?: number[] }; lineNames?: { x?: Record<string, string>; y?: Record<string, string> };
  look?: string; tickText?: Record<string, string>; rectsOf?: (x: [number, number], y: [number, number]) => { rate: string; x: [number, number]; y: [number, number] }[]; hatchOf?: (x: [number, number], y: [number, number]) => { x: [number, number]; y: [number, number] };
  source?: string; key?: false | 'never'; edges?: boolean; reserveCuts?: boolean; nameGap?: number; noWords?: boolean; /** words that stand in the reading's zone where the zones do not apply to the case (a presinusoidal patient on the cirrhosis plane) */ zoneNote?: string; compact?: boolean; fit?: boolean; axes?: boolean; axisNames?: boolean;
  diag?: boolean | { label?: string }; iso?: number[] | { rays: number[]; label?: string };
}
/** What a deck says of a plane: a named one ('csph', 'hvpg-ppg', 'flow-ppg'), or its own, filled from the named one it starts from (base). */
export type PlaneSpec = string | (Partial<Omit<PlaneDef, 'x' | 'y'>> & { x?: Axis | string; y?: Axis | string; base?: string; zones?: Zone[] | string });
/** A summary's point: its reading, where it started (from), its name and its site ('pre', 'presin', 'sin', 'postsin', 'post', 'cardiac'). */
export interface PlanePoint { f: Fp; from?: Fp | null; name: string; short?: string; site?: string }
export interface Stop { f: Fp; name: string }

export const PLANES = PLANES0 as unknown as Record<string, PlaneDef>;
export const planeOf = planeOf0 as (p: PlaneSpec | null | undefined) => PlaneDef | null;
export const fitPlane = fitPlane0 as (pl: PlaneDef, points: readonly { f?: Fp | null; from?: Fp | null }[]) => PlaneDef;
export const zoneOf = zoneOf0 as (pl: PlaneDef, f: Fp) => Zone | null;
export const readKeys = readKeys0 as (pl: PlaneDef) => string[];
export const shownReading = shownReading0 as (pl: PlaneDef, f: Fp) => Record<string, number>;
export const hasAxes = hasAxes0 as (pl: PlaneDef) => boolean;
export const pointR = pointR0 as (at: { x: number; y: number }[]) => number;
export const dotSize = dotSize0 as (fr: Fr) => { r: number; g: number };
export interface Fr { L: number; R: number; T: number; B: number; numBase?: number; nameBase?: number }
export interface Word { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; cls: string; box: Box }
export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface PlacedName { x: number; y: number; anchor: 'start' | 'middle' | 'end'; lines: string[]; box: Box; lead?: [number, number] | null; across?: boolean; forced?: boolean; fs?: number }
export interface ZoneWords { z: Zone; cls: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; lines: string[]; box: Box; fs?: number; onLine?: boolean }

/** The tile's printed number, 2D valOf. */
export const valOf = (k: string, v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : fmt(v * (TILE[k]?.x ?? 1), TILE[k]?.d ?? 1));
export const unitOf = (k: string) => TILE[k]?.u || '';
const word = (a: Axis) => (a.short || a.name || a.key).split(',')[0]!;
/** The case's reading under the card's plot: its two values and the zone they fall in (2D planeReading). */
export function planeReading(pl: PlaneDef, fp: Fp | null | undefined): string {
  if (!fp || !Number.isFinite(fp[pl.x.key]) || !Number.isFinite(fp[pl.y.key])) return '';
  // (The zone of the numbers printed beside it, as the tiles print them: "25.0 kPa" never reads "Indeterminate".)
  const f = shownReading(pl, fp), z = zoneOf(pl, f), u = (k: string) => (unitOf(k) ? ` ${unitOf(k)}` : '');
  return `${word(pl.x)} ${valOf(pl.x.key, f[pl.x.key])}${u(pl.x.key)} · ${word(pl.y)} ${valOf(pl.y.key, f[pl.y.key])}${u(pl.y.key)}${pl.zoneNote ? ` · ${pl.zoneNote}` : z ? ` · ${z.t}` : ''}`;
}
/** A tool's plane: its plane field, its own x, y and zones, or the CSPH plane (2D toolPlane). */
export const toolPlane = (t: { plane?: PlaneSpec; x?: Axis | string; y?: Axis | string; zones?: Zone[] | string; base?: string } | null | undefined): PlaneDef | null =>
  planeOf(t?.plane ?? (t?.x || t?.y || t?.zones ? ({ x: t.x, y: t.y, zones: t.zones, base: t.base } as PlaneSpec) : 'csph'));
/** The words of a plane's heading: "Stiffness and platelets" (2D planeTitle). */
export const planeTitle = (p: PlaneDef | null) => (p ? `${word(p.x)} and ${lcFirst(word(p.y))}` : 'Two readings');
/** The chart in a sentence (2D aria-label). */
export function planeWords(pl: PlaneDef, pts: readonly { f: Fp; name: string }[], ring: Fp | null | undefined): string {
  const rg = ring ? shownReading(pl, ring) : null;
  return `${pl.y.name} against ${pl.x.name}` + (pts.length ? ': ' + pts.filter((p) => Number.isFinite(p.f?.[pl.x.key]) && Number.isFinite(p.f?.[pl.y.key])).map((p) => { const f = shownReading(pl, p.f); return `${p.name}, ${valOf(pl.x.key, f[pl.x.key])} and ${valOf(pl.y.key, f[pl.y.key])}, ${zoneOf(pl, f)?.t || ''}`; }).join('; ') : '')
    + (rg && Number.isFinite(rg[pl.x.key]) && Number.isFinite(rg[pl.y.key]) ? `; this case ${valOf(pl.x.key, rg[pl.x.key])} ${unitOf(pl.x.key)} and ${valOf(pl.y.key, rg[pl.y.key])} ${unitOf(pl.y.key)}, ${zoneOf(pl, rg)?.t || ''}` : '');
}

// ── The plot's height for a width (2D app-11-deck-visuals.css, the stacked layout: a phone, an iPad's portrait card) ──
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A summary's plot: a box of aspect 1.15 (zones), .94 (axes) or 1.2 (compact), as .pz.stack gives it. A card's plot: 66 % of the width between 210 and 300 px (140 to 190, 44 %, when compact), a wider one under a card with a key of its own. */
/** A summary's plot on a wide or short screen, as 2D's CSS gives it (app-11 `.pze-plot`: `calc(44 * var(--pzh))`, at least 240 px; `.pze-short`, a compact plane: 34 pzh, at least 200 px): a height of the
 *  WINDOW, never of the card's width. The stacked rule (aspect 1.15 of the width, `plotHeightOf`) on a 1200 px panel made a 1000 px plot, taller than the card's room, so the card's fit zoomed
 *  the whole chart down (Mohammad, 20 Nov: "the card is insanely huge and the text is small"). undefined on a stacked screen, which keeps the aspect. */
export function summaryHeight(pl: PlaneDef, layout: string, pzh: number): number | undefined {
  if (layout === 'stack' || layout === 'tab') return undefined;
  return Math.round(Math.max(pl.compact ? 200 : 240, (pl.compact ? 34 : 44) * pzh));
}

export function plotHeightOf(pl: PlaneDef, W: number, card: boolean, o: { room?: number; wide?: boolean } = {}): number {
  if (card && pl.look === 'guide') {
    // (the guideline card's graph proportions: baveno-zones plotHeight, never taller than the card's room less the key and the reading under it)
    const ph = Math.round(W * (W < 420 ? 0.46 : 0.34));
    return o.room && o.room > 0 ? Math.min(ph, Math.max(110, Math.floor(o.room - 66))) : ph;
  }
  const hasAx = !card && hasAxes(pl);
  let h: number;
  if (!card) h = W / (hasAx ? 0.94 : pl.compact ? 1.2 : 1.15);
  else h = pl.compact ? clampN(0.44 * W, 140, 190) : clampN(0.66 * W, 210, 300);
  if (card && o.room && o.room > 0) h = Math.min(h, Math.max(card && pl.compact ? 110 : 150, o.room));
  return Math.round(h);
}


export interface LayoutIn {
  plane: PlaneDef;
  W: number; H: number; fs: number;
  card?: boolean;
  /** a summary's points */
  points?: readonly PlanePoint[];
  /** the card's case: its fingerprint */
  ring?: Fp | null;
  /** where the card's dot was (a fingerprint): the zones' words keep clear of its way */
  ringWas?: Fp | null;
  /** the card's trail: the stops before this slide, in order */
  stops?: readonly Stop[];
}
export interface PlaneLayout {
  pl: PlaneDef; fr: Fr; axed: boolean; guide: boolean; W: number; H: number; fs: number;
  X: (v: number) => number; Y: (v: number) => number;
  /** the zones to fill, back to front, in px (bled to the element's edge) */
  fills: { x: number; y: number; w: number; h: number; tone?: string; rate?: string }[];
  /** the guide's hatch, in px */
  hatch: { x: number; y: number; w: number; h: number } | null;
  ax: ReturnType<typeof axesMarks0> | null;
  boxes: { x: number; y: number; w: number; h: number }[];
  words: ZoneWords[];
  cuts: Seg[];
  lines: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' }[];
  diag: { seg: Seg; label: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null } | null;
  iso: { lines: { r: number; seg: Seg; label: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' } }[] } | null;
  nums: Word[];
  at: { f: Record<string, number>; x: number; y: number; name: string; short?: string; site?: string; was: { x: number; y: number } | null }[];
  names: (PlacedName | null)[];
  pr: number;
  /** the card's dot, in px, with its radius and the gap round it */
  dot: { x: number; y: number; r: number; g: number } | null;
  cardWords: ZoneWords[];
  trail: { stops: { x: number; y: number; name: string }[]; names: ({ x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box } | null)[] };
}

/** One plot's whole layout: 2D planePlot's draw(), in the order it asks for things, with the DOM taken out. */
export function planeLayout(inp: LayoutIn): PlaneLayout {
  const { W, H, fs, card = false } = inp, points = inp.points ?? [];
  const pl = card ? inp.plane : fitPlane(inp.plane, points);
  const rg = inp.ring ? shownReading(pl, inp.ring) : null;
  // (A scatter, a plane with no zones, draws axes of its own on a panel: hasAxes.)
  const axed = !card && hasAxes(pl), fr = (axed ? axesFrame0(pl, W, H, fs) : frame0(W, H)) as Fr, { X, Y } = scaler0(pl, fr) as { X: (v: number) => number; Y: (v: number) => number };
  const guide = pl.look === 'guide' && typeof pl.rectsOf === 'function';
  const rr = (a: { x: [number, number]; y: [number, number] }) => { const b = bleed0({ x1: X(a.x[0]), x2: X(a.x[1]), y1: Y(a.y[1]), y2: Y(a.y[0]) }, fr, W, H); return { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 }; };
  const lo = (a: Axis) => a.min ?? 0;
  const fills = axed ? [] : guide ? pl.rectsOf!([lo(pl.x), pl.x.max], [lo(pl.y), pl.y.max]).map((r) => ({ ...rr(r), rate: r.rate })) : [...pl.zones].reverse().map((z) => { const [x0, x1, y0, y1] = zoneRect0(pl, z); return { ...rr({ x: [x0, x1], y: [y0, y1] }), tone: z.tone || 'none' }; });
  const hatch = !axed && guide && pl.hatchOf ? rr(pl.hatchOf([lo(pl.x), pl.x.max], [lo(pl.y), pl.y.max])) : null;
  const ax = axed ? axesMarks0(pl, fr, X, Y, fs, W) : null;
  // The patients' names first, so every point keeps its name; the zones' words then take what room is left.
  const at = points.filter((p) => Number.isFinite(p.f?.[pl.x.key]) && Number.isFinite(p.f?.[pl.y.key])).map((p) => { const f = shownReading(pl, p.f); return { ...p, f, x: X(f[pl.x.key]!), y: Y(f[pl.y.key]!), was: wasAt0(pl, p.from, X, Y) }; });
  const pointBoxes: Box[] = at.flatMap((p) => [[p.x - 16, p.y - 16, p.x + 16, p.y + 16] as Box, ...(wasBoxes0(p) as Box[])]);
  const cardNums: Word[] = card ? plotNumbers0(pl, fr, X, Y, fs) : [], axisNames: Word[] = card || axed ? [] : plotNumbers0(pl, fr, X, Y, fs, pointBoxes, 'names');
  const numBoxes = cardNums.map((n) => n.box);
  const pr = axed ? pointR(at) : 8;
  const extra = [...axisNames.map((n) => n.box), ...(card || axed ? [] : (cutNumbers0(pl, fr, X, Y, fs, [...pointBoxes, ...axisNames.map((n) => n.box)]) as Box[]))].map((b) => widen0(b, (pl.nameGap || 3) - 3));
  const lay = card ? { names: [] as (PlacedName | null)[], words: [] as ZoneWords[], lines: [] as { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box }[] }
    : layoutPlane0(pl, fr, X, Y, fs, at, card, extra, pr, axed ? 3 : pl.nameGap || 0);
  const { names, words, lines } = lay;
  const nums: Word[] = card ? cardNums : axed ? [...ax!.nums, ...ax!.names] : [...axisNames, ...plotNumbers0(pl, fr, X, Y, fs, [...pointBoxes, ...axisNames.map((n) => n.box), ...names.filter(Boolean).map((n) => n!.box), ...words.map((w: ZoneWords) => w.box), ...lines.map((l: { box: Box }) => l.box)], 'ticks')];
  const boxes = (pl.boxes || []).map((b) => { const [x0, x1, y0, y1] = zoneRect0(pl, b); return { x: X(x0), y: Y(y1), w: X(x1) - X(x0), h: Y(y0) - Y(y1) }; });
  // The cut-off lines, broken 4 px clear of a name that sits across one, and of a number a line runs to.
  const cuts: Seg[] = guide ? [] : (gapSegs0(cutSegs0(pl, X, Y, fr, true), [...names.filter((n: PlacedName | null) => n?.across).map((n: PlacedName | null) => n!.box), ...nums.map((n) => n.box)]) as Seg[]).map((c) => bleed0(c, fr, W, H) as Seg);
  const dg = diagOf0(pl, X, Y, fs) as { seg: Seg; label: PlaneLayout['lines'][number] | null } | null;
  // (The rays' names last: everything else on the plot has its place first and they find room round it.)
  const isoAvoid: Box[] = [...pointBoxes, ...names.flatMap((n: PlacedName | null, i: number) => (n ? [n.box, ...(n.lead ? (leadBoxes0(at[i], n.lead) as Box[]) : [])] : [])), ...words.map((w: ZoneWords) => w.box), ...lines.map((l: { box: Box }) => l.box), ...nums.map((n) => n.box)];
  const io0 = isoOf0(pl, X, Y, fr, fs, isoAvoid) as PlaneLayout['iso'];
  const io = io0 && { ...io0, lines: fullIsoNames(io0.lines, pl, X, Y, fr, fs, isoAvoid) ?? io0.lines };
  // The slide's case: a dot in proportion to the plot, a gap in the card's colour around it.
  const { r, g } = dotSize(fr), has = rg && Number.isFinite(rg[pl.x.key]) && Number.isFinite(rg[pl.y.key]);
  const now = has ? { x: +X(rg![pl.x.key]!).toFixed(1), y: +Y(rg![pl.y.key]!).toFixed(1) } : null;
  const wasRg = inp.ringWas ? shownReading(pl, inp.ringWas) : null;
  const was = wasRg && Number.isFinite(wasRg[pl.x.key]) && Number.isFinite(wasRg[pl.y.key]) ? { x: X(wasRg[pl.x.key]!), y: Y(wasRg[pl.y.key]!) } : null;
  let cardWords: ZoneWords[] = [], trail: PlaneLayout['trail'] = { stops: [], names: [] };
  if (card) {
    const stops = (inp.stops ?? []).filter((s) => s?.f && Number.isFinite(s.f[pl.x.key]) && Number.isFinite(s.f[pl.y.key]));
    let tr: Box[] = [];
    if (stops.length) {
      // (The trail's rings and names first, the zones' words then keeping clear of them and of its line.)
      const avoid = [...numBoxes, ...(dotBoxes0(now, was, r + g) as number[][]).map((b) => [...b])];
      const st = stops.map((s) => { const f = shownReading(pl, s.f); return { x: X(f[pl.x.key]!), y: Y(f[pl.y.key]!), name: s.name }; });
      const bx = trailBoxes0(st, now) as number[][];
      const nm = placeStopNames0(st, fr, fs, [...avoid, ...bx, ...(lineBoxes0(pl, X, Y, fr, fs) as Box[])]) as PlaceStop[];
      trail = { stops: st, names: nm };
      tr = [...bx, ...nm.filter(Boolean).map((n) => n!.box)] as unknown as Box[];
    }
    // (Where the dot's whole way leaves a zone no room, its words keep clear of where the dot ends.)
    const dots = () => (dotBoxes0(now, was, r + g) as number[][]).map((b) => [...b]);
    cardWords = placeCardWords0(pl, fr, X, Y, fs, [...numBoxes, ...tr, ...dots()]) as ZoneWords[];
    if (cardWords.length < pl.zones.length) { const end = placeCardWords0(pl, fr, X, Y, fs, [...numBoxes, ...tr, ...(dotBoxes0(now, null, r + g) as number[][]).map((b) => [...b])]) as ZoneWords[]; if (end.length > cardWords.length) cardWords = end; }
  }
  return {
    pl, fr, axed, guide, W, H, fs, X, Y, fills, hatch, ax, boxes, words, cuts, lines, diag: dg ? { seg: dg.seg, label: dg.label } : null, iso: io, nums, at, names, pr,
    dot: now ? { x: now.x, y: now.y, r, g } : null, cardWords, trail,
  };
}
type PlaceStop = { x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box } | null;

// ── The dot's way (2D paintWalk) ──
/** The way the dot went since the slide came up: pairs in the plane's own units, kept by the card between its frames; armed once the dot has stood on the trail's last stop. */
export interface WalkState { walk: number[]; armed: boolean }
/** Move the dot to `cur` (px, the dot's place now) and keep its way: it starts where the dot stands on the last stop, drops back where the dot goes over its way again (a time-lapse played again or scrubbed back), and is thinned past 600 points. */
export function stepWalk(st: WalkState, L: PlaneLayout, stops: readonly Stop[], cur: { x: number; y: number } | null): void {
  const { pl, X, Y, fr } = L, lo = (a: Axis) => a.min ?? 0;
  const invX = (px: number) => lo(pl.x) + (px - fr.L) / (fr.R - fr.L) * (pl.x.max - lo(pl.x)), invY = (py: number) => lo(pl.y) + (fr.B - py) / (fr.B - fr.T) * (pl.y.max - lo(pl.y));
  const ns = stops.length;
  if (cur && ns) {
    const f = stops[ns - 1]!.f, lx = X(tileShown(pl.x.key, f[pl.x.key]!)), ly = Y(tileShown(pl.y.key, f[pl.y.key]!));
    // (The way is kept from the moment the dot stands on the last stop, where this slide's time-lapse starts; before that the line runs straight from the last stop to the dot.)
    if (Math.hypot(lx - cur.x, ly - cur.y) < 3) { st.armed = true; st.walk.length = 0; }
  }
  if (!cur || !st.armed) return;
  const w = st.walk, n = w.length >> 1;
  let back = -1;
  for (let i = 0; i < n - 2; i++) if (Math.hypot(X(w[2 * i]!) - cur.x, Y(w[2 * i + 1]!) - cur.y) < 3) { back = i; break; }
  if (back >= 0) w.length = 2 * (back + 1);
  const m = w.length >> 1;
  if (!m || Math.hypot(X(w[2 * m - 2]!) - cur.x, Y(w[2 * m - 1]!) - cur.y) >= 2) {
    w.push(invX(cur.x), invY(cur.y));
    if (w.length > 1200) { const cnt = w.length >> 1; let k = 0; for (let i = 0; i < cnt; i++) if (i % 2 === 0 || i === cnt - 1) { w[2 * k] = w[2 * i]!; w[2 * k + 1] = w[2 * i + 1]!; k++; } w.length = 2 * k; }
  }
}

// ── The key under the plot (2D: planeKey, planeCardKey, hatchKey; app-11-deck-visuals.css .pze-key, .pze-ckey, .pzc-key) ──
/** The zones and boxes a key names, in the order 2D lists them. */
export const keyEntries = (pl: PlaneDef): (Zone & { box?: boolean })[] => [...pl.zones, ...(pl.boxes || []).map((b) => ({ ...b, box: true }))];
