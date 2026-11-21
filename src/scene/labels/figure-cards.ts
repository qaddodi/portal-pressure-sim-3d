// The cards a slide stands on the figure besides the station names: a mark's words ("Clot", "Covered stent"), a site's reading ("Portal vein 12.3 mmHg", the portal
// blood's split), the numbered steps and the calipers' lines and readings. They are the 2D app's callout card (the catheter's: cath.ts pillSize and pillGlass, one glass shape
// with its pointer, callout-ptr.copied.js) pointing at a place on the figure. The place is named, not projected: a vessel (its middle), a station, a point of the 2D plate, so the
// layer follows the camera by itself. Layout (`placeCards`) is pure and judged in node; `FigureCards` builds the DOM once and writes only transform and opacity per frame.
// Like every label here the cards fade out while the picture moves and come back FADE.settleMs after it is still.
import { Vector3 } from 'three';
import { FADE } from './alpha.ts';
import { type Box, hits, within } from './geometry.ts';
import { PTR, PILL_GAP, cathType, pillGlass, pillSize, INTER, type CathType, type Reading, type Measure, type Glass } from './cath.ts';
import { calloutClaims } from './callout-claims.ts';
import { makeCard, words, shape, fade, place, size, show, type Card } from './cath-dom.ts';
import { LS, type Vp } from './type.ts';
import { stationById, curveOf, nodeZ, ORGAN_FRONT } from './stations.ts';
import { NODE_POS_2D } from '../vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { x3, y3 } from '../frame2d.ts';
import { spanOf, spanStrokes } from './span-math.ts';
import { TIP_FADE_2D } from '../vessels/fades.copied.ts';

/** Where a card points: a vessel's middle, a station, a point of the 2D plate (organs, the spleen's ends), or a node of the 2D figure. */
export type Anchor = { edge: string } | { edges: readonly string[] } | { station: string } | { at2d: readonly [number, number] } | { node: string } | { lobule: string };

/** A bracket on the Circuit between two stations (a slide's `span`): its words, as printed, standing under its middle. */
export interface FigSpan { id: string; from: string; to: string; text: string }
export type CardKind = 'mark' | 'site' | 'step' | 'split';
export interface FigCard {
  id: string; kind: CardKind;
  /** The words (a mark's label, a site's kicker), the reading and its unit (a site, a caliper). */
  text: string; value?: string; unit?: string;
  /** The colour token (2D: 'pv', '--tour-sys', 'accent'), or one of the card tones: block (danger), treat (accent), note (the quiet ink). */
  tone: string;
  anchor: Anchor;
  /** The card stands below its point (a site that hangs under its station). */
  below?: boolean;
  /** ms after the slide lands (a glow step). */
  at?: number;
  /** The portal blood's split: percent to the liver, percent through shunts, the band. */
  split?: { liver: number; shunt: number; rate: string };
  /** The number in a step's circle. */
  n?: number;
  /** A step: the vessel's half width on screen is read live; a group's number stands between its vessels with a leader to the middle of each (2D stage-label-solve.js, `fans`). */
  group?: readonly string[];
}
export interface FigCaliper {
  id: string;
  /** A spleen's long axis (the 2D plate's two ends, scaled about its centre by the spleen's size), or a line across a vessel at its middle. */
  line: { ends: readonly [readonly [number, number], readonly [number, number]] } | { across: string };
  text: string;
}

/** A slide's ring on the figure (2D lobule-zoom-labels.js RING_STROKE, RING_GAP): its stroke, the air a label keeps off it, its least radius, px. */
export const RING_STROKE = 4, RING_AIR = RING_STROKE / 2 + 8;
const ringPx = (r: number) => Math.max(10, Math.round(r * 10) / 10);
/** The label of a ring stands this far (px) off the leader's end, so the line never runs in under the letters (2D CALL_GAP). */
export const RING_LABEL_GAP = 7;

/** A leader from a ring's edge to its label: it starts on the ring (at its radius, on the line to the label's centre) and stops RING_LABEL_GAP short of the label's box, where that line enters it.
 *  null when the label stands too close for a line to show. */
export function ringLeader(at: { x: number; y: number }, r: number, box: Box): [number, number, number, number] | null {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, dx = cx - at.x, dy = cy - at.y, len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  // where the line from the ring's centre to the label's centre enters the label's box grown by the gap (the slab test, per axis)
  const g = RING_LABEL_GAP, lo = [box.x0 - g, box.y0 - g], hi = [box.x1 + g, box.y1 + g], from = [at.x, at.y], d = [dx, dy];
  let t0 = 0;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]!) < 1e-9) { if (from[i]! < lo[i]! || from[i]! > hi[i]!) return null; continue; }
    const a = (lo[i]! - from[i]!) / d[i]!, b = (hi[i]! - from[i]!) / d[i]!;
    t0 = Math.max(t0, Math.min(a, b));
  }
  const end = Math.min(t0, 1) * len;
  if (end - r < 4) return null;
  return [at.x + (dx / len) * r, at.y + (dy / len) * r, at.x + (dx / len) * end, at.y + (dy / len) * end];
}

/** How near its point a step's number may stand, at least (2D STEP_LEAD_GAP), px. */
export const STEP_LEAD_GAP = 10;
const normal = (px: number) => px * (INTER.asc + INTER.desc);
const ceil2 = (n: number) => Math.ceil(n * 100) / 100;

/** A card's size (border box) and its Reading: a mark is one line of words; a site is the catheter's three lines (name, number, unit). */
export function cardSize(c: FigCard, t: CathType, measure: Measure): { w: number; h: number } {
  const C = LS.CATH;
  if (c.kind === 'mark') {
    const w = measure(c.text, t.name, C.NAME.weight, C.NAME.track * t.name) + 2 * t.padX + 2 * t.border;
    return { w: ceil2(w), h: ceil2(t.padTop + t.padBottom + 2 * t.border + normal(t.name)) };
  }
  if (c.kind === 'step') { const d = Math.round(t.name * 1.9); return { w: d, h: d }; }
  if (c.kind === 'split') return { w: ceil2(t.name * 12.6 + 8), h: ceil2(t.num * 1.1 + t.name * 3.6 + 6) };
  return pillSize(t, { kicker: c.text, value: c.value ?? '', unit: c.unit ?? '', tone: 'free' }, measure, false);
}

export interface CardIn { id: string; /** a slide's ring on the figure (2D's lobule pointer): its radius with its stroke and air, px; the card stands clear of it, the leader runs from its edge */ ring?: number; /** the point it names, canvas px */ x: number; y: number; w: number; h: number; below?: boolean; /** a step's number: how far its edge stands from the point it names, px (2D `near`); it stands off the point, on a leader to it */ near?: number }
export interface CardOut { id: string; x0: number; y0: number; dir: 'top' | 'bottom' | 'none'; /** the point it names, from the card's centre */ ax: number; box: Box; /** false: no clear place in the view (the card waits) */ ok: boolean }

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The directions a step's number tries, in 2D's order (stage-label-solve.js placeMulti: NE, NW, SE, SW, N, S, E, W): the first that is clear wins. */
export const STEP_DIRS: readonly (readonly [number, number])[] = [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]].map(([x, y]) => { const n = Math.hypot(x!, y!); return [x! / n, y! / n] as const; });

/** A step's number (a circle) by the point it names: its edge `near` px from the point, off the vessel, in the first of eight directions that is in view and clear of the cards; where none is, the
 *  one that covers least. The point stands on a leader from the circle (stepLeader). Before, the circle stood straight above or below the point at the callout gap, on the vessel it numbered or far from it. */
export function placeStep(it: CardIn, view: Box, blockers: readonly Box[], placed: readonly Box[]): CardOut {
  const r = it.w / 2, d = r + (it.near ?? 10);
  let best: { cost: number; o: CardOut } | null = null;
  STEP_DIRS.forEach(([ux, uy], i) => {
    const cx = it.x + ux * d, cy = it.y + uy * d, box: Box = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
    let cost = i * 0.01;
    if (!within(box, view)) cost += 1e6;
    for (const b of blockers) if (hits(box, b)) cost += 1e4 + overlap(box, b);
    for (const b of placed) if (hits(box, b)) cost += 1e4 + overlap(box, b);
    const o: CardOut = { id: it.id, x0: box.x0, y0: box.y0, dir: 'none', ax: 0, box, ok: cost < 1e6 };
    if (!best || cost < best.cost) best = { cost, o };
  });
  return best!.o;
}

/** A leader from a step's circle to a point it names: it starts on the circle's edge, on the line to the point, and ends at the point. null when the point stands inside the circle. */
export function stepLeader(circle: { cx: number; cy: number; r: number }, to: { x: number; y: number }): [number, number, number, number] | null {
  const dx = to.x - circle.cx, dy = to.y - circle.cy, len = Math.hypot(dx, dy);
  if (len <= circle.r + 1) return null;
  return [circle.cx + (dx / len) * circle.r, circle.cy + (dy / len) * circle.r, to.x, to.y];
}

/** Where each card stands (the 2D callout rule: above its point, or below it, slid sideways until it clears the cards, the view's edges and the others; the first clear
 *  spot in that order wins, and a card with none takes the one that covers least). In order, so the first of a slide has its pick. */
export function placeCards(items: readonly CardIn[], view: Box, blockers: readonly Box[]): CardOut[] {
  const placed: Box[] = [], out: CardOut[] = [];
  for (const it of items) {
    if (it.w >= view.x1 - view.x0) { const x0 = Math.max(it.x - it.w / 2, view.x0 + 4); out.push({ id: it.id, x0, y0: it.y, dir: 'none', ax: 0, box: { x0, y0: it.y, x1: x0 + it.w, y1: it.y + it.h }, ok: false }); continue; }
    if (it.near != null) { const o = placeStep(it, view, blockers, placed); placed.push(o.box); out.push(o); continue; }
    const sides: boolean[] = it.below ? [false, true] : [true, false];
    const gap = it.ring ?? PILL_GAP, hold = it.ring ? [...blockers, { x0: it.x - it.ring, y0: it.y - it.ring, x1: it.x + it.ring, y1: it.y + it.ring }] : blockers;
    let best: { cost: number; o: CardOut } | null = null;
    const steps = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5].map((k) => k * it.w);
    // a step's circle and the plain "none" cards stand diagonally off the point instead of straight above or below it
    for (const above of sides) for (const dx of steps) {
      const cx = it.x + dx, x0 = Math.min(Math.max(cx - it.w / 2, view.x0 + 4), view.x1 - it.w - 4), y0 = above ? it.y - gap - it.h : it.y + gap;
      const box: Box = { x0, y0, x1: x0 + it.w, y1: y0 + it.h };
      const reach: Box = above ? { x0, y0, x1: box.x1, y1: Math.max(it.y, box.y1) } : { x0, y0: Math.min(it.y, y0), x1: box.x1, y1: box.y1 };
      let cost = Math.abs(dx) * 0.01 + (above === sides[0] ? 0 : 0.5);
      if (!within(box, view)) cost += 1e6;
      for (const b of hold) if (hits(box, b)) cost += 1e4 + overlap(box, b);
      for (const b of placed) if (hits(reach, b)) cost += 1e4 + overlap(reach, b);
      const o: CardOut = { id: it.id, x0, y0, dir: above ? 'bottom' : 'top', ax: it.x - (x0 + it.w / 2), box: reach, ok: cost < 1e6 };
      if (!best || cost < best.cost) best = { cost, o };
      if (cost < 1) break;
    }
    // No clear spot in the sweep above (a talk's cards and the key leave only a pocket far from the point): the nearest clear place anywhere in the view, rather than the one under a card.
    if (best!.cost >= 1e4) {
      const f = freeSpot(it, view, hold, placed);
      if (f) best = { cost: 0, o: f };
    }
    placed.push(best!.o.box);
    out.push(best!.o);
  }
  return out;
}

/** The clear place nearest a card's point: its box on a grid over the view, clear of every blocker and of the cards placed before it (the tail runs to the point). null when the view holds none. */
export function freeSpot(it: CardIn, view: Box, blockers: readonly Box[], placed: readonly Box[]): CardOut | null {
  const STEP = 8, AIR = 2;
  let best: { d: number; x0: number; y0: number } | null = null;
  for (let y0 = view.y0 + 4; y0 + it.h <= view.y1 - 4; y0 += STEP) {
    for (let x0 = view.x0 + 4; x0 + it.w <= view.x1 - 4; x0 += STEP) {
      const box: Box = { x0: x0 - AIR, y0: y0 - AIR, x1: x0 + it.w + AIR, y1: y0 + it.h + AIR };
      const d = Math.hypot(x0 + it.w / 2 - it.x, y0 + it.h / 2 - it.y);
      if (best && d >= best.d) continue;
      if (blockers.some((b) => hits(box, b)) || placed.some((b) => hits(box, b))) continue;
      best = { d, x0, y0 };
    }
  }
  if (!best) return null;
  const { x0, y0 } = best, x1 = x0 + it.w, y1 = y0 + it.h, above = y0 + it.h / 2 < it.y;
  const reach: Box = above ? { x0, y0, x1, y1: Math.max(it.y, y1) } : { x0, y0: Math.min(it.y, y0), x1, y1 };
  return { id: it.id, x0, y0, dir: above ? 'bottom' : 'top', ax: it.x - (x0 + it.w / 2), box: reach, ok: true };
}

export interface CardDeps {
  project(p: Vector3, out: { x: number; y: number }): { x: number; y: number };
  cameraMoving(): boolean;
  view(): Box;
  blockers(): Box[];
  vp(): Vp & { w: number; h: number };
  measure: Measure;
  now(): number;
  /** The spleen's size now (1: normal); the caliper along its axis grows with it. */
  spleenScale(): number;
  /** A place of the lobule view ('triad:0', 'centre', 'zone:2'), scene point; null when that view is not the figure now. */
  lobule(name: string, out: Vector3): Vector3 | null;
  /** The point on the ring a lobule callout draws round that place (one ring radius from it, along the plate): its pixels are measured from the camera. */
  lobuleRing(name: string, out: Vector3): Vector3 | null;
  /** The Circuit once it is the figure: pixels one map unit covers, and a map point (units) on the canvas; null while another view is. */
  circuit(): { k: number; project(x: number, y: number, out: { x: number; y: number }): { x: number; y: number } } | null;
}

/** Where along a vessel a step's number points (2D stage-label-solve.js: arcMid at 0.5, and for a vein that fades in from its start (TIP_FADE over half its length) the middle of its solid
 *  stretch, which the fade leaves, not the middle of the whole, which is faint). */
export const stepMidOf = (edge: string): number => { const f = TIP_FADE_2D[edge] ?? 0; return f > 0.5 ? (1 + f) / 2 : 0.5; };

/** The point a card names, scene units; null when the 3D figure does not have it. */
export function anchorPoint(a: Anchor, out: Vector3, lobule?: CardDeps['lobule'], at = 0.5): Vector3 | null {
  if ('lobule' in a) return lobule ? lobule(a.lobule, out) : null;
  if ('edge' in a) { const c = curveOf(a.edge); return c ? c.getPointAt(at, out) : null; }
  if ('edges' in a) {
    let n = 0; const sum = { x: 0, y: 0, z: 0 }, q = new Vector3();
    for (const e of a.edges) { const c = curveOf(e); if (!c) continue; c.getPointAt(stepMidOf(e), q); sum.x += q.x; sum.y += q.y; sum.z += q.z; n++; }
    return n ? out.set(sum.x / n, sum.y / n, sum.z / n) : null;
  }
  if ('station' in a) { const s = stationById(a.station); return s ? s.at(0.5, out) : null; }
  if ('at2d' in a) return out.set(x3(a.at2d[0]), y3(a.at2d[1]), ORGAN_FRONT);
  const p = NODE_POS_2D[a.node];
  if (!p) return null;
  try { return out.set(x3(p[0]), y3(p[1]), nodeZ(a.node)); } catch { return null; }
}

interface Lead { root: HTMLElement; lines: HTMLElement[]; dots: HTMLElement[]; tx: string[] }
interface Ring { root: HTMLElement; ring: HTMLElement; line: HTMLElement; tx: string; key: string; ltx: string }
interface Rec { card: Card; spec: FigCard; a: number; box: CardOut | null; sig: string; root: HTMLElement; lead?: Lead; co?: Ring; split?: { n: HTMLElement; lt: HTMLElement; l: HTMLElement; s: HTMLElement } }
interface SpanRec { root: HTMLElement; segs: HTMLElement[]; tx: string[]; card: Card; spec: FigSpan; a: number; box: CardOut | null }
interface CalRec { root: HTMLElement; line: HTMLElement; ticks: [HTMLElement, HTMLElement]; tickTx: string; card: Card; spec: FigCaliper; a: number; tx: string; box: CardOut | null }

export class FigureCards {
  private cards: FigCard[] = [];
  private calipers: FigCaliper[] = [];
  private spans: FigSpan[] = [];
  private readonly recs = new Map<string, Rec>();
  private readonly cals = new Map<string, CalRec>();
  private readonly spanRecs = new Map<string, SpanRec>();
  private t0 = 0;
  private lastMove = -1e9;
  private last = -1;
  private sig = '';
  private dirty = true;
  private readonly p = new Vector3();
  private readonly q = new Vector3();
  private readonly pt = { x: 0, y: 0 };
  private readonly pt2 = { x: 0, y: 0 };
  private anchors = new Map<string, { x: number; y: number }>();
  /** The boxes the cards take now (the station names keep clear of them). */
  boxes: Box[] = [];
  private readonly parent: HTMLElement;
  private readonly deps: CardDeps;
  constructor(parent: HTMLElement, deps: CardDeps) { this.parent = parent; this.deps = deps; }

  /** The slide's cards (replacing the last slide's: what it stood leaves with it). `t0` is when the slide landed (the steps count from it). */
  set(cards: readonly FigCard[], calipers: readonly FigCaliper[] = [], t0 = this.deps.now(), spans: readonly FigSpan[] = []): void {
    this.cards = [...cards]; this.calipers = [...calipers]; this.spans = [...spans]; this.t0 = t0; this.dirty = true;
  }
  markDirty(): void { this.dirty = true; }

  private make(spec: FigCard): Rec {
    const split = spec.kind === 'split';
    const card = makeCard(this.parent, split ? 'cath-label site split' : spec.kind === 'step' ? 'cl cl-step' : 'cl cl-pill cl-fig');
    card.root.dataset.fig = spec.kind;
    const rec: Rec = { card, spec, a: 0, box: null, sig: '', root: card.root };
    if (spec.kind === 'mark' && 'lobule' in spec.anchor) {
      // a slide's pointer at the lesion (2D lobule-zoom.js callEl, callLine, callRing): a thick ring on the place, a leader of the same stroke from the ring to its words, the words in the ring's colour, no card
      card.root.dataset.fig = 'callout';
      const root = document.createElement('div'); root.className = 'lz-co'; this.parent.appendChild(root);
      const ring = document.createElement('i'); ring.className = 'lz-co-ring'; const line = document.createElement('i'); line.className = 'lz-co-line';
      root.append(line, ring);
      rec.co = { root, ring, line, tx: '', key: '', ltx: '' };
    }
    if (spec.kind === 'step') {
      // the leader to the vessel the number names (2D: a dot on the vessel and a thin line to the chip; a group's number a line to each of its vessels)
      const root = document.createElement('div'); root.className = 'cl-lead'; this.parent.appendChild(root);
      rec.lead = { root, lines: [], dots: [], tx: [] };
    }
    if (split) {
      // the 2D portal-blood label, its own markup (stage-sites-paint.js SPLIT_B): the number and "bypasses the liver", the caption, the bar split into the liver's and the shunts' share
      card.glass.remove(); card.ring.remove(); card.k.remove(); card.n.remove(); card.u.remove();
      const b = document.createElement('b');
      b.innerHTML = '<span class="sp-h"><em class="sp-n"></em><em class="sp-pc">%</em><span class="sp-w">bypasses the liver</span></span><span class="sp-cap"><em class="sp-k">Portal blood</em><em class="sp-lt"></em><em class="sp-st"></em></span><span class="sp-bar"><i class="sp-l"></i><i class="sp-s"></i></span>';
      card.root.appendChild(b);
      card.root.style.setProperty('--lo', '1');
      rec.split = { n: b.querySelector('.sp-n')!, lt: b.querySelector('.sp-lt')!, l: b.querySelector('.sp-l')!, s: b.querySelector('.sp-s')! };
    }
    return rec;
  }

  private makeCaliper(spec: FigCaliper): CalRec {
    const root = document.createElement('div'); root.className = 'cl-cal'; this.parent.appendChild(root);
    const line = document.createElement('i'); line.className = 'cl-cal-line'; root.appendChild(line);
    const ticks: [HTMLElement, HTMLElement] = [document.createElement('i'), document.createElement('i')];
    for (const k of ticks) { k.className = 'cl-cal-tick'; root.appendChild(k); }
    const card = makeCard(this.parent, 'cl cl-pill cl-fig');
    card.root.dataset.fig = 'caliper';
    return { root, line, ticks, tickTx: '', card, spec, a: 0, tx: '', box: null };
  }

  private makeSpan(spec: FigSpan): SpanRec {
    const root = document.createElement('div'); root.className = 'cl-span'; this.parent.appendChild(root);
    const segs = [0, 1, 2].map(() => { const k = document.createElement('i'); k.className = 'cl-span-seg'; root.appendChild(k); return k; });
    const card = makeCard(this.parent, 'cl cl-pill cl-fig');
    card.root.dataset.fig = 'span';
    return { root, segs, tx: ['', '', ''], card, spec, a: 0, box: null };
  }

  /** A reading's card size: one line of words in the card's own type. */
  private textSize(text: string, t: CathType): { w: number; h: number } {
    return { w: ceil2(this.deps.measure(text, t.name, LS.CATH.NAME.weight, LS.CATH.NAME.track * t.name) + 2 * t.padX + 2 * t.border), h: ceil2(t.padTop + t.padBottom + 2 * t.border + normal(t.name)) };
  }

  /** One frame (the clock's tags phase). Returns true while cards still need frames (fading, or waiting to return). */
  tick(): boolean {
    const d = this.deps, now = d.now(), dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const vp = d.vp(), t = cathType(vp), view = d.view();
    // the cards of this slide: made once each, gone with the slide
    const want = new Set(this.cards.map((c) => c.id));
    for (const [id, r] of this.recs) if (!want.has(id) && r.a <= 0) { r.root.remove(); r.lead?.root.remove(); r.co?.root.remove(); this.recs.delete(id); }
    for (const c of this.cards) {
      let r = this.recs.get(c.id);
      if (!r) { r = this.make(c); this.recs.set(c.id, r); }
      r.spec = c;
    }
    const wantCal = new Set(this.calipers.map((c) => c.id));
    for (const [id, r] of this.cals) if (!wantCal.has(id) && r.a <= 0) { r.root.remove(); r.card.root.remove(); this.cals.delete(id); }
    for (const c of this.calipers) { let r = this.cals.get(c.id); if (!r) { r = this.makeCaliper(c); this.cals.set(c.id, r); } r.spec = c; }

    const wantSpan = new Set(this.spans.map((c) => c.id));
    for (const [id, r] of this.spanRecs) if (!wantSpan.has(id) && r.a <= 0) { r.root.remove(); r.card.root.remove(); this.spanRecs.delete(id); }
    for (const c of this.spans) { let r = this.spanRecs.get(c.id); if (!r) { r = this.makeSpan(c); this.spanRecs.set(c.id, r); } r.spec = c; }

    // where each named place stands now; any that moved hides the cards until the picture is still
    let moved = d.cameraMoving();
    const anchors = new Map<string, { x: number; y: number }>();
    const put = (key: string, a: { x: number; y: number }) => {
      anchors.set(key, a);
      const was = this.anchors.get(key);
      if (!was || Math.abs(was.x - a.x) > 0.35 || Math.abs(was.y - a.y) > 0.35) moved = true;
    };
    for (const c of this.cards) {
      // a step's number points at the middle of its vessel's solid stretch (stepMidOf); a group's at the middle of its vessels, with a leader to each (the fans)
      const p = anchorPoint(c.anchor, this.p, d.lobule, c.kind === 'step' && 'edge' in c.anchor ? stepMidOf(c.anchor.edge) : 0.5);
      if (!p) continue;
      const at = d.project(p, { x: 0, y: 0 });
      put(c.id, at);
      // a lobule callout's ring: its radius on the screen, from a point one ring radius off along the plate (it changes only as the camera does, so it hides the card like any other move)
      if ('lobule' in c.anchor) { const e = d.lobuleRing(c.anchor.lobule, this.q); if (e) { const b = d.project(e, this.pt2); put(c.id + '#r', { x: ringPx(Math.hypot(b.x - at.x, b.y - at.y)), y: 0 }); } }
      if (c.kind === 'step' && 'edges' in c.anchor) c.anchor.edges.forEach((e, i) => { const q = anchorPoint({ edge: e }, this.q, d.lobule, stepMidOf(e)); if (q) put(`${c.id}#${i}`, d.project(q, { x: 0, y: 0 })); });
    }
    // each caliper's two ends on the canvas
    const ends = new Map<string, [number, number, number, number]>();
    for (const c of this.calipers) {
      const e = this.caliperEnds(c);
      if (!e) continue;
      ends.set(c.id, e);
      const was = this.anchors.get('cal:' + c.id);
      const mid = { x: (e[0] + e[2]) / 2, y: (e[1] + e[3]) / 2 };
      anchors.set('cal:' + c.id, mid);
      if (!was || Math.abs(was.x - mid.x) > 0.35 || Math.abs(was.y - mid.y) > 0.35) moved = true;
    }
    // each bracket's three strokes on the canvas (the map's own points, so the turn and the camera carry it), and the middle of its line
    const circ = this.spans.length ? d.circuit() : null;
    const strokes = new Map<string, [number, number, number, number][]>();
    for (const c of this.spans) {
      const at = circ && spanOf(c.from, c.to, circ.k);
      if (!circ || !at) continue;
      const out = spanStrokes(at).map(([p, q]) => { const a = circ.project(p[0], p[1], { x: 0, y: 0 }), b = circ.project(q[0], q[1], { x: 0, y: 0 }); return [a.x, a.y, b.x, b.y] as [number, number, number, number]; });
      strokes.set(c.id, out);
      const l = out[0]!, mid = { x: (l[0] + l[2]) / 2, y: (l[1] + l[3]) / 2 };
      for (const [k, p] of [['m', mid], ['a', { x: l[0], y: l[1] }], ['b', { x: l[2], y: l[3] }]] as const) {
        const key = `span:${c.id}:${k}`, was = this.anchors.get(key);
        anchors.set(key, p);
        if (!was || Math.abs(was.x - p.x) > 0.35 || Math.abs(was.y - p.y) > 0.35) moved = true;
      }
    }
    this.anchors = anchors;
    // (a place that moved is placed again once the picture is still: the boxes were solved for where it stood)
    if (moved) { this.lastMove = now; this.dirty = true; }
    const hold = now - this.lastMove < FADE.settleMs;

    // solve once the picture is still and something changed
    const blockers = d.blockers();
    const sig = [this.cards.map((c) => c.id + c.text + (c.value ?? '')).join(','), this.calipers.map((c) => c.id + c.text).join(','), this.spans.map((c) => c.id + c.text + (strokes.has(c.id) ? 1 : 0)).join(','), view.x0, view.y0, view.x1, view.y1, blockers.map((b) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`).join(';'), vp.w, vp.h].join('|');
    if (!hold && (this.dirty || sig !== this.sig)) {
      this.sig = sig; this.dirty = false;
      const ins: CardIn[] = [];
      for (const c of this.cards) { const a = anchors.get(c.id); if (!a) continue; const s = cardSize(c, t, d.measure), rg = anchors.get(c.id + '#r'); ins.push({ id: c.id, x: a.x, y: a.y, w: s.w, h: s.h, below: c.below, ...(c.kind === 'step' ? { near: this.stepNear(c) } : null), ...(rg ? { ring: rg.x + RING_AIR } : null) }); }
      for (const c of this.calipers) {
        const e = ends.get(c.id); if (!e) continue;
        const w = ceil2(d.measure(c.text, t.name, LS.CATH.NAME.weight, LS.CATH.NAME.track * t.name) + 2 * t.padX + 2 * t.border), h = ceil2(t.padTop + t.padBottom + 2 * t.border + normal(t.name));
        ins.push({ id: 'cal:' + c.id, x: (e[0] + e[2]) / 2, y: (e[1] + e[3]) / 2, w, h, below: false });
      }
      // a bracket's reading stands under the middle of its line
      for (const c of this.spans) {
        const l = strokes.get(c.id)?.[0]; if (!l) continue;
        const s = this.textSize(c.text, t);
        ins.push({ id: 'span:' + c.id, x: (l[0] + l[2]) / 2, y: (l[1] + l[3]) / 2, w: s.w, h: s.h, below: true });
      }
      const outs = placeCards(ins, view, blockers);
      const by = new Map(outs.map((o) => [o.id, o]));
      for (const [id, r] of this.recs) { r.box = by.get(id) ?? null; r.sig = ''; }
      for (const [id, r] of this.cals) r.box = by.get('cal:' + id) ?? null;
      for (const [id, r] of this.spanRecs) r.box = by.get('span:' + id) ?? null;
      this.boxes = outs.filter((o) => o.ok).map((o) => o.box).concat(ins.filter((i) => i.ring).map((i) => ({ x0: i.x - i.ring!, y0: i.y - i.ring!, x1: i.x + i.ring!, y1: i.y + i.ring! })));
      calloutClaims.set(this.boxes);
    }

    // fades (linear, the label timings) and the paint
    const inn = dt / FADE.inMs, out = dt / FADE.outMs;
    let busy = false;
    const age = now - this.t0;
    for (const [id, r] of this.recs) {
      const live = want.has(id) && !!r.box?.ok && !hold && anchors.has(id) && age >= (r.spec.at ?? 0);
      const next = Math.min(1, Math.max(0, r.a + (live ? inn : -out)));
      if (next !== r.a) busy = true;
      r.a = next;
      this.paintCard(r, t, anchors.get(id));
    }
    for (const [id, r] of this.cals) {
      const live = wantCal.has(id) && !!r.box?.ok && !hold && ends.has(id);
      const next = Math.min(1, Math.max(0, r.a + (live ? inn : -out)));
      if (next !== r.a) busy = true;
      r.a = next;
      this.paintCaliper(r, t, ends.get(id));
    }
    for (const [id, r] of this.spanRecs) {
      const live = wantSpan.has(id) && !!r.box?.ok && !hold && strokes.has(id);
      const next = Math.min(1, Math.max(0, r.a + (live ? inn : -out)));
      if (next !== r.a) busy = true;
      r.a = next;
      this.paintSpan(r, t, strokes.get(id));
    }
    // a step that has not come yet keeps frames coming until it does
    for (const c of this.cards) if ((c.at ?? 0) > age) busy = true;
    return busy || hold || this.dirty;
  }

  /** How near its point a step's number may stand (2D STEP_LEAD_GAP and 4 + half the vessel's width): room for the dot's ring and a leader to the chip. An organ's, or a group's, stands close (4). */
  private stepNear(c: FigCard): number {
    if (!('edge' in c.anchor)) return 4;
    const curve = curveOf(c.anchor.edge), v = NETWORK_BY_ID.get(c.anchor.edge);
    if (!curve || !v) return 10;
    const at = stepMidOf(c.anchor.edge), d = this.deps;
    curve.getPointAt(at, this.p); curve.getPointAt(Math.min(1, at + 0.02), this.q);
    const a = d.project(this.p, this.pt), b = d.project(this.q, this.pt2), n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const per = n / (this.p.distanceTo(this.q) || 1);
    return Math.max(STEP_LEAD_GAP, 4 + Math.max(2, v.radius * per));
  }

  /** The leader of a step: a dot on each point the number names and a thin line to it from the circle's edge (transform and opacity only). */
  private paintLead(r: Rec, box: CardOut, a: number, dia: number): void {
    const lead = r.lead; if (!lead) return;
    const c = r.spec, pts: { x: number; y: number }[] = [];
    if ('edge' in c.anchor) { const p = this.anchors.get(c.id); if (p) pts.push(p); }
    else if ('edges' in c.anchor) c.anchor.edges.forEach((_, i) => { const p = this.anchors.get(`${c.id}#${i}`); if (p) pts.push(p); });
    const circle = { cx: box.x0 + dia / 2, cy: box.y0 + dia / 2, r: dia / 2 };
    while (lead.lines.length < pts.length) {
      const l = document.createElement('i'); l.className = 'cl-lead-line'; const dt = document.createElement('i'); dt.className = 'cl-lead-dot';
      lead.root.append(l, dt); lead.lines.push(l); lead.dots.push(dt); lead.tx.push('');
    }
    lead.lines.forEach((l, i) => {
      const p = pts[i], seg = p ? stepLeader(circle, p) : null;
      const on = !!p && r.box?.ok !== false;
      lead.dots[i]!.style.visibility = on ? 'visible' : 'hidden'; l.style.visibility = on && seg ? 'visible' : 'hidden';
      if (!p) return;
      const round = (n: number) => Math.round(n * 100) / 100;
      lead.dots[i]!.style.transform = `translate3d(${round(p.x)}px,${round(p.y)}px,0)`;
      if (seg) { const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]), ang = Math.atan2(seg[3] - seg[1], seg[2] - seg[0]); const tx = `translate3d(${round(seg[0])}px,${round(seg[1])}px,0) rotate(${ang.toFixed(4)}rad) scaleX(${round(len)})`; if (tx !== lead.tx[i]) { lead.tx[i] = tx; l.style.transform = tx; } }
    });
    lead.root.style.opacity = String(Math.round(a * 1000) / 1000);
  }

  /** A caliper's two ends on the canvas: the spleen's axis (2D `spleenCaliper`) or a line across a vessel, wall to wall at its middle. */
  private caliperEnds(c: FigCaliper): [number, number, number, number] | null {
    const d = this.deps;
    if ('ends' in c.line) {
      const k = d.spleenScale(), cx = (c.line.ends[0][0] + c.line.ends[1][0]) / 2, cy = (c.line.ends[0][1] + c.line.ends[1][1]) / 2;
      const pts = c.line.ends.map(([x, y]) => d.project(this.p.set(x3(cx + (x - cx) * k), y3(cy + (y - cy) * k), ORGAN_FRONT), { x: 0, y: 0 }));
      return [pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y];
    }
    const curve = curveOf(c.line.across), v = NETWORK_BY_ID.get(c.line.across);
    if (!curve || !v) return null;
    curve.getPointAt(0.5, this.p); curve.getPointAt(0.52, this.q);
    const a = d.project(this.p, this.pt), b = d.project(this.q, this.pt2);
    const tx = b.x - a.x, ty = b.y - a.y, n = Math.hypot(tx, ty) || 1;
    // the tube's radius on screen: its scene radius times the pixels one scene unit covers here
    const per = n / this.p.distanceTo(this.q), half = Math.max(2, v.radius * per);
    const nx = -ty / n, ny = tx / n;
    return [a.x - nx * half, a.y - ny * half, a.x + nx * half, a.y + ny * half];
  }

  private paintCard(r: Rec, t: CathType, a: { x: number; y: number } | undefined): void {
    const c = r.spec, box = r.box;
    if (r.a <= 0 || !box || !a) { if (r.lead) r.lead.root.style.opacity = '0'; if (r.co) r.co.root.style.opacity = '0'; if (r.root.hasAttribute('data-on')) { show(r.card, false); if (c.kind === 'split') r.root.style.opacity = '0'; fadeKids(r.card, 0); } return; }
    show(r.card, true);
    // (opacity lives on a card's children, never on the card: a hidden card used to keep a root opacity of 0 for good, so a number that came back after the picture moved stood invisible beside its leader)
    if (c.kind !== 'split' && r.root.style.opacity !== '') r.root.style.removeProperty('opacity');
    if (c.kind === 'split') { this.paintSplit(r, box, t); return; }
    const sz = cardSize(c, t, this.deps.measure);
    size(r.card, sz.w, sz.h);
    const key = `${c.kind}|${c.text}|${c.value ?? ''}|${c.unit ?? ''}|${c.tone}|${box.dir}|${Math.round(box.ax)}|${sz.w}`;
    if (r.sig !== key) {
      r.sig = key;
      const tone = toneOf(c.tone);
      if (c.kind === 'step') {
        r.card.k.textContent = String(c.n ?? ''); r.card.n.style.display = 'none'; r.card.u.style.display = 'none';
        r.root.style.setProperty('--cl-tone', 'var(--text)');
      } else {
        words(r.card, { kicker: c.text, value: c.value ?? '', unit: c.unit ?? '', tone: 'free' } as Reading);
        r.card.n.style.display = c.value ? '' : 'none'; r.card.u.style.display = c.unit ? '' : 'none';
        r.card.root.dataset.tone = tone.attr;
        if (tone.css) r.card.root.style.setProperty('--cl-tone', tone.css); else r.card.root.style.removeProperty('--cl-tone');
      }
      const g: Glass = c.kind === 'step' ? circleGlass(sz.w) : pillGlass(sz.w, sz.h, t.radius, box.dir === 'none' ? 'none' : box.dir, box.ax);
      shape(r.card, g, key);
    }
    place(r.card, box.x0, box.y0);
    fade(r.card, r.a);
    if (c.kind === 'step') this.paintLead(r, box, r.a, sz.w);
    if (r.co) this.paintRing(r, box, a, sz);
  }

  /** A slide's ring: it stands on its place at its radius, the leader runs from its edge to the words (both the stroke of 2D's `small.call`, in the callout's colour), and they fade with the words. Moved by
   *  transform and opacity; the radius and the colour are written when they change, which is while the picture is moving and the card hidden. */
  private paintRing(r: Rec, box: CardOut, a: { x: number; y: number }, sz: { w: number; h: number }): void {
    const co = r.co!, rg = this.anchors.get(r.spec.id + '#r');
    if (!rg) { co.root.style.opacity = '0'; return; }
    const rad = rg.x, tone = r.spec.tone === 'block' ? 'danger' : r.spec.tone === 'note' ? 'note' : 'accent';
    if (co.root.dataset.tone !== tone) co.root.dataset.tone = tone;
    if (r.root.dataset.co !== tone) r.root.dataset.co = tone;
    const key = String(rad);
    if (co.key !== key) { co.key = key; co.ring.style.width = co.ring.style.height = `${rad * 2 + RING_STROKE}px`; co.ring.style.margin = `${-(rad + RING_STROKE / 2)}px 0 0 ${-(rad + RING_STROKE / 2)}px`; }
    const round = (n: number) => Math.round(n * 100) / 100;
    const tx = `translate3d(${round(a.x)}px,${round(a.y)}px,0)`;
    if (tx !== co.tx) { co.tx = tx; co.ring.style.transform = tx; }
    const seg = ringLeader(a, rad, { x0: box.x0, y0: box.y0, x1: box.x0 + sz.w, y1: box.y0 + sz.h });
    co.line.style.visibility = seg ? 'visible' : 'hidden';
    if (seg) {
      const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]), ang = Math.atan2(seg[3] - seg[1], seg[2] - seg[0]);
      const ltx = `translate3d(${round(seg[0])}px,${round(seg[1])}px,0) rotate(${ang.toFixed(4)}rad) scaleX(${round(len)})`;
      if (ltx !== co.ltx) { co.ltx = ltx; co.line.style.transform = ltx; }
    }
    co.root.style.opacity = String(Math.round(r.a * 1000) / 1000);
  }

  private paintSplit(r: Rec, box: CardOut, t: CathType): void {
    const c = r.spec, sp = r.split!;
    // (its words are set in the card's own type size, the one cardSize measured the box in: 2D's CSS sets them at 12 px, which on a phone is wider than the box placed for it, so the words ran past the edge it was kept inside)
    const k = String(Math.round((t.name / 12) * 1000) / 1000);
    if (r.root.style.getPropertyValue('--label-scale') !== k) r.root.style.setProperty('--label-scale', k);
    const key = `${c.split?.liver}|${c.split?.shunt}`;
    if (r.sig !== key && c.split) {
      r.sig = key;
      sp.n.textContent = String(c.split.shunt);
      sp.lt.textContent = `To the liver ${c.split.liver}%`;
      r.root.style.setProperty('--sp-lf', String(c.split.liver / 100)); r.root.style.setProperty('--sp-sf', String(c.split.shunt / 100));
      r.root.style.setProperty('--sp-lm', c.split.liver ? '4px' : '0px'); r.root.style.setProperty('--sp-sm', c.split.shunt ? '4px' : '0px');
      r.root.dataset.rate = c.split.rate;
    }
    r.root.style.transform = `translate3d(${Math.round(box.x0 * 100) / 100}px,${Math.round(box.y0 * 100) / 100}px,0)`;
    r.root.style.opacity = String(Math.round(r.a * 1000) / 1000);
  }

  private paintCaliper(r: CalRec, t: CathType, e: [number, number, number, number] | undefined): void {
    if (r.a <= 0 || !e || !r.box) {
      if (r.root.hasAttribute('data-on')) { r.root.removeAttribute('data-on'); r.root.style.opacity = '0'; show(r.card, false); fadeKids(r.card, 0); }
      return;
    }
    r.root.setAttribute('data-on', '');
    const len = Math.hypot(e[2] - e[0], e[3] - e[1]), ang = Math.atan2(e[3] - e[1], e[2] - e[0]);
    const tx = `translate3d(${Math.round(e[0] * 100) / 100}px,${Math.round(e[1] * 100) / 100}px,0) rotate(${ang.toFixed(4)}rad) scaleX(${Math.round(len * 100) / 100})`;
    if (tx !== r.tx) {
      r.tx = tx; r.line.style.transform = tx;
      const at = (x: number, y: number) => `translate3d(${Math.round(x * 100) / 100}px,${Math.round(y * 100) / 100}px,0) rotate(${ang.toFixed(4)}rad)`;
      r.ticks[0].style.transform = at(e[0], e[1]); r.ticks[1].style.transform = at(e[2], e[3]);
    }
    r.root.style.opacity = String(Math.round(r.a * 1000) / 1000);
    show(r.card, true);
    const w = ceil2(this.deps.measure(r.spec.text, t.name, LS.CATH.NAME.weight, LS.CATH.NAME.track * t.name) + 2 * t.padX + 2 * t.border), h = ceil2(t.padTop + t.padBottom + 2 * t.border + normal(t.name));
    size(r.card, w, h);
    const key = `${r.spec.text}|${r.box.dir}|${Math.round(r.box.ax)}|${w}`;
    if (r.card.shape !== key) {
      words(r.card, { kicker: r.spec.text, value: '', unit: '', tone: 'free' } as Reading);
      r.card.n.style.display = 'none'; r.card.u.style.display = 'none'; r.card.root.dataset.tone = 'note';
      shape(r.card, pillGlass(w, h, t.radius, r.box.dir === 'none' ? 'none' : r.box.dir, r.box.ax), key);
    }
    place(r.card, r.box.x0, r.box.y0);
    fade(r.card, r.a);
  }

  /** A bracket: its line and the tick at each end (a thin ink line each, moved by transform), and its reading in the card's glass under it. */
  private paintSpan(r: SpanRec, t: CathType, st: [number, number, number, number][] | undefined): void {
    if (r.a <= 0 || !st || !r.box) {
      if (r.root.hasAttribute('data-on')) { r.root.removeAttribute('data-on'); r.root.style.opacity = '0'; show(r.card, false); fadeKids(r.card, 0); }
      return;
    }
    r.root.setAttribute('data-on', '');
    st.forEach((e, i) => {
      const len = Math.hypot(e[2] - e[0], e[3] - e[1]), ang = Math.atan2(e[3] - e[1], e[2] - e[0]);
      const tx = `translate3d(${Math.round(e[0] * 100) / 100}px,${Math.round(e[1] * 100) / 100}px,0) rotate(${ang.toFixed(4)}rad) scaleX(${Math.round(len * 100) / 100})`;
      if (tx !== r.tx[i]) { r.tx[i] = tx; r.segs[i]!.style.transform = tx; }
    });
    r.root.style.opacity = String(Math.round(r.a * 1000) / 1000);
    show(r.card, true);
    const { w, h } = this.textSize(r.spec.text, t);
    size(r.card, w, h);
    const key = `${r.spec.text}|${r.box.dir}|${Math.round(r.box.ax)}|${w}`;
    if (r.card.shape !== key) {
      words(r.card, { kicker: r.spec.text, value: '', unit: '', tone: 'free' } as Reading);
      r.card.n.style.display = 'none'; r.card.u.style.display = 'none'; r.card.root.dataset.tone = 'note';
      shape(r.card, pillGlass(w, h, t.radius, r.box.dir === 'none' ? 'none' : r.box.dir, r.box.ax), key);
    }
    place(r.card, r.box.x0, r.box.y0);
    fade(r.card, r.a);
  }

  destroy(): void {
    for (const r of this.recs.values()) { r.root.remove(); r.lead?.root.remove(); r.co?.root.remove(); }
    for (const r of this.cals.values()) { r.root.remove(); r.card.root.remove(); }
    for (const r of this.spanRecs.values()) { r.root.remove(); r.card.root.remove(); }
    this.recs.clear(); this.cals.clear(); this.spanRecs.clear();
    calloutClaims.set([]);
  }
}

const fadeKids = (c: Card, a: number) => fade(c, a);

/** A card tone: block is the danger red, treat the accent, note the quiet ink; any other token is a station colour. */
export function toneOf(tone: string): { attr: string; css: string | null } {
  if (tone === 'block') return { attr: 'danger', css: null };
  if (tone === 'note') return { attr: 'note', css: null };
  return { attr: 'custom', css: tone === 'treat' || tone === 'accent' ? 'var(--accent)' : tone.startsWith('--') ? `var(${tone})` : `var(--tr-${tone})` };
}

/** A step's round card: no pointer. */
function circleGlass(d: number): Glass {
  const r = d / 2, path = `M0 ${r}a${r} ${r} 0 1 0 ${d} 0a${r} ${r} 0 1 0 ${-d} 0z`;
  return { left: 0, top: 0, w: d, h: d, px: r, d: path };
}

export { PTR };
