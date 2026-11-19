// The cards a slide stands on the figure besides the station names: a mark's words ("Clot", "Covered stent"), a site's reading ("Portal vein 12.3 mmHg", the portal
// blood's split), the numbered steps and the calipers' lines and readings. They are the 2D app's callout card (the catheter's: cath.ts pillSize and pillGlass, one glass shape
// with its pointer, callout-ptr.copied.js) pointing at a place on the figure. The place is named, not projected: a vessel (its middle), a station, a point of the 2D plate, so the
// layer follows the camera by itself. Layout (`placeCards`) is pure and judged in node; `FigureCards` builds the DOM once and writes only transform and opacity per frame.
// Like every label here the cards fade out while the picture moves and come back FADE.settleMs after it is still.
import { Vector3 } from 'three';
import { FADE } from './alpha.ts';
import { type Box, hits, within } from './geometry.ts';
import { PTR, PILL_GAP, cathType, pillGlass, pillSize, INTER, type CathType, type Reading, type Measure, type Glass } from './cath.ts';
import { makeCard, words, shape, fade, place, size, show, type Card } from './cath-dom.ts';
import { LS, type Vp } from './type.ts';
import { stationById, curveOf, nodeZ, ORGAN_FRONT } from './stations.ts';
import { NODE_POS_2D } from '../vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { x3, y3 } from '../frame2d.ts';

/** Where a card points: a vessel's middle, a station, a point of the 2D plate (organs, the spleen's ends), or a node of the 2D figure. */
export type Anchor = { edge: string } | { station: string } | { at2d: readonly [number, number] } | { node: string } | { lobule: string };

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
}
export interface FigCaliper {
  id: string;
  /** A spleen's long axis (the 2D plate's two ends, scaled about its centre by the spleen's size), or a line across a vessel at its middle. */
  line: { ends: readonly [readonly [number, number], readonly [number, number]] } | { across: string };
  text: string;
}

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

export interface CardIn { id: string; /** the point it names, canvas px */ x: number; y: number; w: number; h: number; below?: boolean }
export interface CardOut { id: string; x0: number; y0: number; dir: 'top' | 'bottom' | 'none'; /** the point it names, from the card's centre */ ax: number; box: Box; /** false: no clear place in the view (the card waits) */ ok: boolean }

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Where each card stands (the 2D callout rule: above its point, or below it, slid sideways until it clears the cards, the view's edges and the others; the first clear
 *  spot in that order wins, and a card with none takes the one that covers least). In order, so the first of a slide has its pick. */
export function placeCards(items: readonly CardIn[], view: Box, blockers: readonly Box[]): CardOut[] {
  const placed: Box[] = [], out: CardOut[] = [];
  for (const it of items) {
    if (it.w >= view.x1 - view.x0) { out.push({ id: it.id, x0: it.x - it.w / 2, y0: it.y, dir: 'none', ax: 0, box: { x0: it.x - it.w / 2, y0: it.y, x1: it.x + it.w / 2, y1: it.y + it.h }, ok: false }); continue; }
    const sides: boolean[] = it.below ? [false, true] : [true, false];
    let best: { cost: number; o: CardOut } | null = null;
    const steps = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5].map((k) => k * it.w);
    // a step's circle and the plain "none" cards stand diagonally off the point instead of straight above or below it
    for (const above of sides) for (const dx of steps) {
      const cx = it.x + dx, x0 = Math.min(Math.max(cx - it.w / 2, view.x0 + 4), view.x1 - it.w - 4), y0 = above ? it.y - PILL_GAP - it.h : it.y + PILL_GAP;
      const box: Box = { x0, y0, x1: x0 + it.w, y1: y0 + it.h };
      const reach: Box = above ? { x0, y0, x1: box.x1, y1: Math.max(it.y, box.y1) } : { x0, y0: Math.min(it.y, y0), x1: box.x1, y1: box.y1 };
      let cost = Math.abs(dx) * 0.01 + (above === sides[0] ? 0 : 0.5);
      if (!within(box, view)) cost += 1e6;
      for (const b of blockers) if (hits(box, b)) cost += 1e4 + overlap(box, b);
      for (const b of placed) if (hits(reach, b)) cost += 1e4 + overlap(reach, b);
      const o: CardOut = { id: it.id, x0, y0, dir: above ? 'bottom' : 'top', ax: it.x - (x0 + it.w / 2), box: reach, ok: cost < 1e6 };
      if (!best || cost < best.cost) best = { cost, o };
      if (cost < 1) break;
    }
    placed.push(best!.o.box);
    out.push(best!.o);
  }
  return out;
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
}

/** The point a card names, scene units; null when the 3D figure does not have it. */
export function anchorPoint(a: Anchor, out: Vector3, lobule?: CardDeps['lobule']): Vector3 | null {
  if ('lobule' in a) return lobule ? lobule(a.lobule, out) : null;
  if ('edge' in a) { const c = curveOf(a.edge); return c ? c.getPointAt(0.5, out) : null; }
  if ('station' in a) { const s = stationById(a.station); return s ? s.at(0.5, out) : null; }
  if ('at2d' in a) return out.set(x3(a.at2d[0]), y3(a.at2d[1]), ORGAN_FRONT);
  const p = NODE_POS_2D[a.node];
  if (!p) return null;
  try { return out.set(x3(p[0]), y3(p[1]), nodeZ(a.node)); } catch { return null; }
}

interface Rec { card: Card; spec: FigCard; a: number; box: CardOut | null; sig: string; root: HTMLElement; split?: { n: HTMLElement; lt: HTMLElement; l: HTMLElement; s: HTMLElement } }
interface CalRec { root: HTMLElement; line: HTMLElement; ticks: [HTMLElement, HTMLElement]; tickTx: string; card: Card; spec: FigCaliper; a: number; tx: string; box: CardOut | null }

export class FigureCards {
  private cards: FigCard[] = [];
  private calipers: FigCaliper[] = [];
  private readonly recs = new Map<string, Rec>();
  private readonly cals = new Map<string, CalRec>();
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
  set(cards: readonly FigCard[], calipers: readonly FigCaliper[] = [], t0 = this.deps.now()): void {
    this.cards = [...cards]; this.calipers = [...calipers]; this.t0 = t0; this.dirty = true;
  }
  markDirty(): void { this.dirty = true; }

  private make(spec: FigCard): Rec {
    const split = spec.kind === 'split';
    const card = makeCard(this.parent, split ? 'cath-label site split' : spec.kind === 'step' ? 'cl cl-step' : 'cl cl-pill cl-fig');
    card.root.dataset.fig = spec.kind;
    const rec: Rec = { card, spec, a: 0, box: null, sig: '', root: card.root };
    if (split) {
      // the 2D portal-blood label, its own markup (stage-sites-paint.js SPLIT_B): the number and "bypasses the liver", the caption, the bar split into the liver's and the shunts' share
      card.glass.remove(); card.k.remove(); card.n.remove(); card.u.remove();
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

  /** One frame (the clock's tags phase). Returns true while cards still need frames (fading, or waiting to return). */
  tick(): boolean {
    const d = this.deps, now = d.now(), dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const vp = d.vp(), t = cathType(vp), view = d.view();
    // the cards of this slide: made once each, gone with the slide
    const want = new Set(this.cards.map((c) => c.id));
    for (const [id, r] of this.recs) if (!want.has(id) && r.a <= 0) { r.root.remove(); this.recs.delete(id); }
    for (const c of this.cards) {
      let r = this.recs.get(c.id);
      if (!r) { r = this.make(c); this.recs.set(c.id, r); }
      r.spec = c;
    }
    const wantCal = new Set(this.calipers.map((c) => c.id));
    for (const [id, r] of this.cals) if (!wantCal.has(id) && r.a <= 0) { r.root.remove(); r.card.root.remove(); this.cals.delete(id); }
    for (const c of this.calipers) { let r = this.cals.get(c.id); if (!r) { r = this.makeCaliper(c); this.cals.set(c.id, r); } r.spec = c; }

    // where each named place stands now; any that moved hides the cards until the picture is still
    let moved = d.cameraMoving();
    const anchors = new Map<string, { x: number; y: number }>();
    for (const c of this.cards) {
      const p = anchorPoint(c.anchor, this.p, d.lobule);
      if (!p) continue;
      const a = d.project(p, { x: 0, y: 0 });
      anchors.set(c.id, a);
      const was = this.anchors.get(c.id);
      if (!was || Math.abs(was.x - a.x) > 0.35 || Math.abs(was.y - a.y) > 0.35) moved = true;
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
    this.anchors = anchors;
    if (moved) this.lastMove = now;
    const hold = now - this.lastMove < FADE.settleMs;

    // solve once the picture is still and something changed
    const blockers = d.blockers();
    const sig = [this.cards.map((c) => c.id + c.text + (c.value ?? '')).join(','), this.calipers.map((c) => c.id + c.text).join(','), view.x0, view.y0, view.x1, view.y1, blockers.map((b) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`).join(';'), vp.w, vp.h].join('|');
    if (!hold && (this.dirty || sig !== this.sig)) {
      this.sig = sig; this.dirty = false;
      const ins: CardIn[] = [];
      for (const c of this.cards) { const a = anchors.get(c.id); if (!a) continue; const s = cardSize(c, t, d.measure); ins.push({ id: c.id, x: a.x, y: a.y, w: s.w, h: s.h, below: c.below }); }
      for (const c of this.calipers) {
        const e = ends.get(c.id); if (!e) continue;
        const w = ceil2(d.measure(c.text, t.name, LS.CATH.NAME.weight, LS.CATH.NAME.track * t.name) + 2 * t.padX + 2 * t.border), h = ceil2(t.padTop + t.padBottom + 2 * t.border + normal(t.name));
        ins.push({ id: 'cal:' + c.id, x: (e[0] + e[2]) / 2, y: (e[1] + e[3]) / 2, w, h, below: false });
      }
      const outs = placeCards(ins, view, blockers);
      const by = new Map(outs.map((o) => [o.id, o]));
      for (const [id, r] of this.recs) { r.box = by.get(id) ?? null; r.sig = ''; }
      for (const [id, r] of this.cals) r.box = by.get('cal:' + id) ?? null;
      this.boxes = outs.filter((o) => o.ok).map((o) => o.box);
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
    // a step that has not come yet keeps frames coming until it does
    for (const c of this.cards) if ((c.at ?? 0) > age) busy = true;
    return busy || hold || this.dirty;
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
    if (r.a <= 0 || !box || !a) { if (r.root.hasAttribute('data-on')) { show(r.card, false); r.root.style.opacity = '0'; fadeKids(r.card, 0); } return; }
    show(r.card, true);
    if (c.kind === 'split') { this.paintSplit(r, box); return; }
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
  }

  private paintSplit(r: Rec, box: CardOut): void {
    const c = r.spec, sp = r.split!;
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

  destroy(): void {
    for (const r of this.recs.values()) r.root.remove();
    for (const r of this.cals.values()) { r.root.remove(); r.card.root.remove(); }
    this.recs.clear(); this.cals.clear();
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
