// The label controller: what is labelled now, where each dot stands on the canvas, when to solve and what to draw this frame.
// Everything it needs from outside comes in through `LabelDeps`, so node runs it with fakes (tests/labels-controller.test.ts) and the
// layer (LabelLayer.tsx) only feeds it the real camera and writes its answer to the DOM. Called once per frame in the clock's `tags` phase.
//
// One rule decides when labels are on screen: they are shown only while the picture is still. The camera in flight, a drag, a card sliding
// the room: any dot that moves hides every label at once (they fade, never slide) and they return FADE.settleMs after the picture stops.
// The exception is a hand on the picture (a tilt, a turn, a pan, a zoom): there each label keeps its place beside its vessel's own 3D point, re-projected every frame
// (its leader follows), and the names are placed again, only where they must change, once the picture has been still for FOLLOW_MS (Mohammad, 20 Nov: "the labels should know we're tilting and still call out the correct thing").
import { Vector3 } from 'three';
import { FADE, labelOpacity } from './alpha.ts';
import { LabelFader, type Want } from './fade.ts';
import { type Box, leaderGeom } from './geometry.ts';
import { type Form, type Item, type Placement, boxOf, solve } from './solver.ts';
import { STATIONS, ORGAN_FRONT, figureCourses, type Station } from './stations.ts';
import { silhouettes, onOtherOrgan, spotOffsets, type Silhouettes, type To2Screen } from './organ-screen.ts';
import { x3, y3 } from '../frame2d.ts';
import { fmtPressure } from '../../ui/text/line.ts';
import { LS, boxSize, organRun, stationRuns } from './type.ts';
import { dockKey, type Dock } from './key-dock.ts';
import type { Rect, Viewport } from '../../ui/layout/device.ts';
import type { CathState, ReadingKey } from '../../decks/schema.ts';
import type { ProcCards } from './store.ts';
import { CathShow, calloutsFor, type CathFrame, type CathText, type CalloutKind } from './cath-show.ts';

export interface LabelDeps {
  now(): number;
  /** A scene point on the canvas now, CSS px. */
  project(p: Vector3, out: { x: number; y: number }): { x: number; y: number };
  cameraMoving(): boolean;
  /** The figure's free room (the camera frames the subject there); the key docks at its lower right. */
  free(): Box;
  /** The area labels may use (the canvas inside the safe areas and below the presenter bar). */
  view(): Box;
  /** Cards, the strip, the key: boxes a label never stands under. */
  blockers(): Box[];
  /** Text width in px (the pill's font); called at build time only, never per frame. */
  measure(text: string, size: number, weight: number, track?: number): number;
  /** The screen (CSS px, with its safe insets): label type sizes follow its short side, as the 2D app's do, and the key docks by the screen's layout. */
  vp(): Viewport;
  /** The words' card, when one stands (the sideways phone's key keeps clear of it). */
  words(): Rect | null;
  /** Whether the blood in a vessel (a topology edge) runs backwards now: its station then carries the reversal mark. */
  reversed(edge: string): boolean;
  /** A station's pressure (mmHg) from the engine's newest frame, null when unknown. */
  pressure(node: string): number | null;
  /** The slide's headline readings (whvp, fhvp, hvpg…), the same numbers the cards print. */
  reading(key: ReadingKey): number | null;
  /** The catheter's tip and the point just ahead of it (the sinusoid side), scene points. Returns how far it has got: 0 not at its place yet,
   *  1 the tip is there (the free reading can stand), 2 the balloon is wedged (the wedged reading and the summary can stand). */
  cathere(tip: Vector3, ahead: Vector3): 0 | 1 | 2;
  /** The body's labels stand aside while the figure is the Circuit (or on its way there): the map has its own captions (circuit/CircuitCaptions.tsx). */
  hidden?(): boolean;
  /** Whether the varices (VAR) or the fundal varices (GV) exist now, as 2D's hasVarices answers it: no varices, no callout (a healthy patient's node is only the balance between
   *  the coronary vein and the azygos, and a "varices" label on it would mislead), and the fundus label comes in with its varices. Absent: the old behaviour (VAR always, GV never). */
  present?(id: 'VAR' | 'GV'): boolean;
  /** How tall the whole figure stands on the screen now, CSS px (the plate's top to its bottom). Absent: the figure is never too small for its names. */
  figureH?(): number;
  /** Whether a vessel (a network id) is drawn now (a collateral only once it is open; a shunt only while a procedure has put it in). Present: every drawn vessel's course is a line the names keep off; absent: the named vessels' only. */
  drawn?(v: { id: string; kind: string; feeder?: unknown }): boolean;
}

/** The names stand aside while the figure is smaller than this (hysteresis: they come back above `FIG_BACK`). The names keep one size (text never shrinks to fit), so on a figure this small they would be
 *  larger than the parts they name and lie over each other: a phone with the Tests sheet up leaves the figure 130 px (Phone play-test, 20 Nov: "16.6" over "Right sinusoids"). The stations a slide
 *  names, the vessel picked and a reading the slide asks for stay. */
/** A dot that moves farther than this in one frame was cut (a new shot, a dive), not carried by a hand: its names leave. */
export const FOLLOW_JUMP = 60;
/** How long the picture must be still, after a hand on it, before the names are placed again. */
export const FOLLOW_MS = 220;
export const FIG_MIN_H = 200;
export const FIG_BACK = 230;

export interface LabelState {
  /** Stations the slide's words light (bright, never dropped); when empty nothing is dimmed. */
  named: ReadonlySet<string>;
  /** Stations the slide asks to have shown besides the figure's own names (never dropped, dim nothing). */
  shown: ReadonlySet<string>;
  /** The colour token each lit station's words take. */
  tones: Readonly<Record<string, string>>;
  /** The picked vessel's edge ID (free play), or null. */
  picked: string | null;
  cath: CathState | null;
  organNames: boolean;
  /** a procedure asks the figure's names to stand aside while it works (2D `quiet`) */
  quiet: boolean;
  /** a centred panel stands over the figure: the names stand aside */
  panel?: boolean;
  /** a procedure's own reading cards (the EUS-PPG's) in place of the catheter's */
  proc: ProcCards | null;
  /** The lens whose colour key the slide shows on the figure (names.copied.ts LENS_KEY), or null for none. */
  key: string | null;
}

export const NO_STATE: LabelState = { named: new Set(), shown: new Set(), tones: {}, picked: null, cath: null, organNames: false, quiet: false, proc: null, key: null };

/** Space between the key and the edge of the free room. */
export const KEY_MARGIN = 12;

export type Kind = 'station' | 'key';

/** The 2D app hides the figure's labels while the HVPG catheter stands (stage.js: `cath-on #labels { opacity: 0 }`); the one switch for it here. */
export const HIDE_UNDER_CATHETER = true;

export interface Draw {
  id: string;
  kind: Kind;
  alpha: number;
  /** The box's top-left corner on the canvas, and its size. */
  x: number; y: number; w: number; h: number;
  /** Which of the item's forms is drawn (an index into the station's forms: they are the full name, the abbreviation when it has one, and the number alone). */
  form: number;
  /** The words of that form (empty for the number alone): the layer writes these, never a name it guesses from the form's index (a station with no abbreviation has its number alone at index 1, which was drawn as its full name over its number: "P16.6nusoids", "IV4.9"). */
  word: string;
  /** The station's reading, formatted. */
  value: string;
  /** The colour token the slide's words give this station (null: its own ink). */
  tone: string | null;
  /** Where the station's ring stands on its vessel (station only; every station has one, as in the 2D app). */
  dot: { x: number; y: number } | null;
  /** The station's blood runs backwards now (the reversal mark shows after its reading). */
  rev: boolean;
  /** The key's dock (its wrap width and least height; key only). */
  dock?: Dock | null;
  /** Padding round the words inside the box (the 2D app's), px. */
  pad: { x: number; y: number };
  /** Leader from the dot to the box (station only; when the label stands away from its vessel). */
  leader: { x: number; y: number; len: number; angle: number } | null;
}

interface Meta {
  id: string;
  kind: 'station';
  station: Station;
  forms: Form[];
  vwUnits: number;
  /** The station's blood runs backwards: its words carry the reversal mark. */
  rev?: boolean;
}

const FORM_NAMES = ['full', 'abbr', 'value'] as const;
export const formNames = FORM_NAMES;

const PATH_SAMPLES = 20;

export class LabelController {
  private state: LabelState = NO_STATE;
  private readonly fader = new LabelFader();
  private wants = new Map<string, Want>();
  private metas = new Map<string, Meta>();
  private readonly formCache = new Map<string, Form[]>();
  private anchors = new Map<string, { x: number; y: number }>();
  private lastMove = -1e9;
  private lastFollow = -1e9;
  private dirty = true;
  private sig = '';
  private last = -1;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly cTip = new Vector3();
  private readonly show = new CathShow();
  private cTipPx: [number, number] | null = null;
  private cAheadPx: [number, number] | null = null;
  private cGot: 0 | 1 | 2 = 0;
  private readonly cAhead = new Vector3();
  private readonly at = new Vector3();
  private readonly pt = { x: 0, y: 0 };
  private firstTick = true;
  private keySize: { w: number; h: number } | null = null;
  private keyNatural: { w: number; h: number } | null = null;
  /** The dock the key stands at now (its wrap width and minimum height go to the element). */
  dock: Dock | null = null;
  readonly out: Draw[] = [];
  /** Items the last solve could not place at all (a test asserts none in the slice's framings). */
  dropped: string[] = [];
  hiddenIds: string[] = [];

  private readonly deps: LabelDeps;
  constructor(deps: LabelDeps) { this.deps = deps; }

  setState(s: LabelState): void { this.state = s; this.dirty = true; }
  markDirty(): void { this.dirty = true; }
  /** The key's size as drawn (its element reports it): on one line, or wrapped where the dock wraps it. */
  setKeySize(w: number, h: number): void {
    if (this.keySize && Math.abs(this.keySize.w - w) < 0.5 && Math.abs(this.keySize.h - h) < 0.5) return;
    this.keySize = { w, h }; this.dirty = true;
  }
  /** The key's size on one line, whatever it is drawn at now (a hidden twin of it reports it): the dock decides by this, so wrapping never feeds back. */
  setKeyNatural(w: number, h: number): void {
    if (this.keyNatural && Math.abs(this.keyNatural.w - w) < 0.5 && Math.abs(this.keyNatural.h - h) < 0.5) return;
    this.keyNatural = { w, h }; this.dirty = true;
  }
  /** Where the key docks (key-dock.ts: the 2D app's own places), or null when it has no words or no size yet. */
  keyDock(): Dock | null {
    if (!this.state.key) return null;
    const natural = this.keyNatural ?? this.keySize;
    if (!natural) return null;
    return dockKey({ vp: this.deps.vp(), words: this.deps.words(), natural, wrapped: this.keySize });
  }
  keyBox(): Box | null { return this.keyDock()?.box ?? null; }
  /** Fonts or sizes changed: forms are measured again. */
  invalidateForms(): void { this.formCache.clear(); this.dirty = true; }

  /** What is labelled now, in drawing order. */
  active(): Meta[] {
    const st = this.state;
    const list: Meta[] = [];
    // Under the HVPG catheter the figure's names are hidden: "the HVPG catheter's readings stand alone, so it hides them" (stage.js setCatheter, `cath-on`; a
    // treatment keeps them). They fade out as the catheter comes in and back as it goes.
    if (HIDE_UNDER_CATHETER && (st.cath || st.quiet)) return list;
    if (st.panel) return list;
    const picked = st.picked ? STATIONS.find((s) => s.vessel === st.picked)?.id ?? null : null;
    for (const s of STATIONS) {
      if (s.kind === 'organ') { if (st.organNames) list.push(this.metaOf(s)); continue; }
      const gated = (s.id === 'VAR' || s.id === 'GV') && this.deps.present ? this.deps.present(s.id) : null;
      if (gated !== null) { if (gated && (s.id === 'GV' || s.core || st.named.has(s.id) || s.id === picked)) list.push(this.metaOf(s)); continue; }
      if (s.id === 'GV') continue;   // (the fundal varices' label comes in only with its varices)
      if (s.core || st.named.has(s.id) || st.shown.has(s.id) || s.id === picked) list.push(this.metaOf(s));
    }
    // an organ's name is not said twice: where a station's reading names the same structure ("Right atrium 3.5"), the organ's own name ("RIGHT ATRIUM") is left out
    const said = new Set(list.filter((m) => m.station.kind !== 'organ').map((m) => m.station.name.toLowerCase()));
    return this.keepIfSmall(list.filter((m) => m.station.kind !== 'organ' || !said.has(m.station.name.toLowerCase())));
  }

  private tiny = false;
  /** While the figure is too small for its names only the ones that were asked for stand (see FIG_MIN_H). */
  private keepIfSmall(list: Meta[]): Meta[] {
    const h = this.deps.figureH?.();
    if (h !== undefined && Number.isFinite(h)) this.tiny = h < (this.tiny ? FIG_BACK : FIG_MIN_H);
    if (!this.tiny) return list;
    const st = this.state;
    return list.filter((m) => m.station.kind !== 'organ' && (st.named.has(m.station.id) || st.shown.has(m.station.id) || (!!st.picked && m.station.vessel === st.picked)));
  }

  private metaOf(s: Station): Meta {
    const rev = !!s.vessel && s.kind !== 'organ' && this.deps.reversed(s.vessel);
    return { id: s.id, kind: 'station', station: s, forms: this.stationForms(s, rev), vwUnits: 0, rev };
  }

  /** The forms a station can take, widest first (the 2D app's own: the full name and reading, the short name and reading, the reading alone).
   *  Each is its words' width and height in the 2D type (type.ts) plus the 2D padding; none has a pill. */
  stationForms(s: Station, reversed = false): Form[] {
    const key = s.id + (reversed ? '|r' : '');
    const c = this.formCache.get(key);
    if (c) return c;
    const d = this.deps, vp = d.vp(), forms: Form[] = [];
    const form = (text: string, runs: ReturnType<typeof stationRuns>, organ = false): Form => { const b = boxSize(runs, vp, d.measure, organ); return { text, w: Math.ceil(b.w * 100) / 100, h: Math.ceil(b.h * 100) / 100 }; };
    if (s.kind === 'organ') forms.push(form(s.name.toUpperCase(), [organRun(s.name)], true));
    else {
      const has = !!s.node;
      forms.push(form(s.name, stationRuns(s.name, has, reversed)));
      if (s.abbr && s.abbr !== s.name) forms.push(form(s.abbr, stationRuns(s.abbr, has, reversed)));
      // (never the number alone: a reading with no name beside it says nothing, "5.0" floating in the liver. A name that has no room as its short form is left out, as the 2D app's solver does when none fits; Mohammad's play-test, 20 Nov)
    }
    this.formCache.set(key, forms);
    return forms;
  }

  private anchorOf(m: Meta, u: number, out: Vector3): Vector3 | null {
    return m.station.at(u, out);
  }

  /** Advance one frame (the clock's `tags` phase). Returns true while labels still need frames (fading, or waiting to come back). */
  tick(): boolean {
    const d = this.deps, now = d.now();
    const dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const metas = d.hidden?.() ? [] : this.active();
    const next = new Map<string, Meta>();
    for (const m of metas) next.set(m.id, m);
    // the set of labelled things changed: solve again
    let setSig = '';
    for (const m of metas) setSig += m.id + (m.rev ? '~' : '') + ',';

    // 1. where the dots are; any that moved hides everything until the picture is still
    let moved = this.firstTick || d.cameraMoving();
    let following = false;
    this.firstTick = false;
    const anchors = new Map<string, { x: number; y: number }>();
    for (const m of metas) {
      const p = this.anchorOf(m, m.station.u0, this.at);
      if (!p) continue;
      const a = d.project(p, { x: 0, y: 0 });
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;   // (a dot behind the camera or at its plane has no place on the screen: it is not placed, never placed at a number that is not one)
      anchors.set(m.id, a);
      const was = this.anchors.get(m.id);
      if (!was) moved = true;
      else if (Math.hypot(was.x - a.x, was.y - a.y) > FOLLOW_JUMP) moved = true;   // (a dot that jumped is a cut, not a hand: the names leave and return)
      else if (Math.abs(was.x - a.x) > 0.35 || Math.abs(was.y - a.y) > 0.35) following = true;
    }
    this.anchors = anchors;
    // the catheter's two points move with the picture too: where the tip and the point ahead stand now
    const pr = this.state.proc, got = pr ? (pr.points(this.cTip, this.cAhead) ? 2 : 0) : d.cathere(this.cTip, this.cAhead);
    const tipPx = got ? d.project(this.cTip, { x: 0, y: 0 }) : null, aheadPx = got ? d.project(this.cAhead, { x: 0, y: 0 }) : null;
    const nowTip: [number, number] | null = tipPx ? [tipPx.x, tipPx.y] : null, nowAhead: [number, number] | null = aheadPx ? [aheadPx.x, aheadPx.y] : null;
    const movedPt = (a: [number, number] | null, b: [number, number] | null) => (a === null) !== (b === null) || (!!a && !!b && (Math.abs(a[0] - b[0]) > 0.35 || Math.abs(a[1] - b[1]) > 0.35));
    if (movedPt(nowTip, this.cTipPx) || movedPt(nowAhead, this.cAheadPx) || got !== this.cGot) moved = true;
    this.cTipPx = nowTip; this.cAheadPx = nowAhead; this.cGot = got;
    // A picture that moved places its labels again once it is still: the solve judges screen positions (cards, other labels, the vessels' lines), and none of them is in the signature below. Without
    // this a solve made while the camera stood somewhere else (the dive's far end, where every dot is off the screen and nothing can be placed) was kept for ever after the camera came back, and every
    // name stayed gone until a card happened to change (Mac play-test, 19 Nov: sinusoid back to Anatomy, 10+ seconds with no names).
    if (moved) { this.lastMove = now; this.dirty = true; }
    // a hand on the picture: the labels ride their dots (drawn below from the dots' own 3D points), and are solved again once it is still
    if (following) { this.lastFollow = now; this.dirty = true; }
    const hold = now - this.lastMove < FADE.settleMs;
    const resting = now - this.lastFollow >= FOLLOW_MS;

    // 2. solve once the picture is still and something changed (the labelled set, a card, the view, the words)
    const view = d.view(), blockers = [...d.blockers()];
    this.dock = this.keyDock();
    const keyBox = this.dock?.box ?? null;
    if (keyBox) blockers.push(keyBox);
    const cathSig = this.state.cath || this.state.proc ? `${this.state.proc?.sig ?? ''}|${this.cGot}|${this.cTipPx ? Math.round(this.cTipPx[0]) + ',' + Math.round(this.cTipPx[1]) : '-'}|${this.cAheadPx ? Math.round(this.cAheadPx[0]) + ',' + Math.round(this.cAheadPx[1]) : '-'}` : '';
    const sig = cathSig + '|' + (keyBox ? boxKey(keyBox) : '-') + '|' + setSig + '|' + boxKey(view) + '|' + blockers.map(boxKey).join(';') + '|' + [...this.state.named].sort().join(',') + [...this.state.shown].sort().join(',') + this.state.cath + (this.state.proc?.sig ?? '');
    if (!hold && resting && (this.dirty || sig !== this.sig)) {
      this.sig = sig; this.dirty = false;
      this.metas = next;
      // the catheter's cards stand first (cath.ts: the 2D app's own placing, clear of the cards and the key); the stations keep clear of them
      this.show.solve({ vp: d.vp(), cath: this.state.cath, measure: d.measure, band: this.cathBand(view), blockers, tip: this.cTipPx, ahead: this.cAheadPx, got: this.cGot, text: this.cathText(), ...(this.state.proc ? { kinds: this.state.proc.kinds, kickers: this.state.proc.kickers, tones: this.state.proc.tones } : {}) });
      this.solveNow(metas, view, [...blockers, ...this.show.boxes]);
      if (keyBox) this.wants.set('key', { p: { id: 'key', form: 0, dx: keyBox.x0, dy: keyBox.y0, w: keyBox.x1 - keyBox.x0, h: keyBox.y1 - keyBox.y0, leader: false, au: 0.5 }, dim: false });
    }

    // 3. fades (the catheter's cards have their own: the 2D app's timings)
    this.show.setText(this.cathText());
    const busy = this.fader.step(dt, this.wants, hold) || this.show.step(dt, hold);

    // 4. what to draw: each shown label at its spot, following its dot
    this.out.length = 0;
    for (const [id, s] of this.fader.frame) {
      if (s.alpha <= 0) continue;
      if (id === 'key') {
        this.out.push({ id, kind: 'key', alpha: s.alpha, x: s.p.dx, y: s.p.dy, w: s.p.w, h: s.p.h, form: 0, word: '', value: '', tone: null, dot: null, rev: false, pad: { x: 0, y: 0 }, leader: null, dock: this.dock });
        continue;
      }
      const m = this.metas.get(id) ?? next.get(id);
      if (!m) continue;
      const p = this.anchorOf(m, s.p.au, this.at);
      if (!p) continue;
      const a = d.project(p, this.pt);
      const ax = a.x, ay = a.y;
      const box = boxOf(s.p, ax, ay);
      const dim = this.state.named.size > 0 && !this.isNamed(m) ? s.dim : 0;
      const organ = m.station.kind === 'organ', ringed = !organ;
      const pad = organ ? { x: LS.ORGAN.padX, y: LS.ORGAN.padY } : { x: LS.PAD.x, y: LS.PAD.y };
      this.out.push({
        id, kind: m.kind, alpha: labelOpacity(s.alpha, dim), x: box.x0, y: box.y0, w: s.p.w, h: s.p.h, form: s.p.form, word: m.forms[s.p.form]?.text ?? '',
        value: this.valueOf(m), tone: this.state.tones[m.station.id] ?? null, dot: ringed ? { x: ax, y: ay } : null, rev: !!m.rev, pad,
        leader: s.p.leader && ringed ? leaderGeom(ax, ay, { x0: box.x0 + pad.x, y0: box.y0 + pad.y, x1: box.x1 - pad.x, y1: box.y1 - pad.y }) : null,
      });
    }
    return busy || hold || this.dirty;
  }

  private isNamed(m: Meta): boolean {
    const st = this.state;
    if (st.named.has(m.station.id)) return true;
    return !!st.picked && m.station.vessel === st.picked;
  }

  private valueOf(m: Meta): string {
    const d = this.deps;
    return m.station.node ? fmtPressure(d.pressure(m.station.node), null, false) : '';
  }

  private solveNow(metas: Meta[], view: Box, blockers: Box[]): void {
    const d = this.deps;
    const items: Item[] = [];
    const lines: [number, number, number, number][] = [];
    const named = this.state.named;
    // the organs' silhouettes on the screen now (only when an organ is named: the figure's names, Figure > Labels)
    let sil: Silhouettes | null = null;
    const to: To2Screen = (x, y) => { const p = d.project(this.tmp2.set(x3(x), y3(y), ORGAN_FRONT), { x: 0, y: 0 }); return [p.x, p.y]; };
    for (const m of metas) {
      const a = this.anchors.get(m.id);
      if (!a) continue;
      const path: [number, number][] = [];
      let vw = 3;
      if (m.station.slides) {
        for (let i = 0; i < PATH_SAMPLES; i++) { const q = m.station.at(i / (PATH_SAMPLES - 1), this.tmp); const r = d.project(q, { x: 0, y: 0 }); path.push([r.x, r.y]); }
        for (let i = 1; i < path.length; i++) lines.push([path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]]);
        vw = vesselHalfWidthPx(m.station, d, this.tmp, this.tmp2);
      }
      const picked = this.state.picked && m.station.vessel === this.state.picked;
      const isNamed = named.has(m.station.id);
      const organ = m.station.kind === 'organ' && !!m.station.at2d;
      if (organ && !sil) sil = silhouettes(to);
      const s0 = sil;
      items.push({
        id: m.id, ax: a.x, ay: a.y, au: m.station.u0, path: path.length ? path : undefined, forms: m.forms,
        pri: picked ? 300 : isNamed ? 100 + m.station.pri : m.station.pri, must: !!picked || isNamed || this.state.shown.has(m.station.id), dirs: m.station.dirs, region: m.station.kind === 'organ', vw,
        ...(organ && s0 ? { spots: spotOffsets(m.station.name, m.station.at2d!, to), onOther: (b: Box) => onOtherOrgan(m.station.name, s0, b) } : {}),
      });
    }
    // every vessel the figure draws is a line a name keeps off (the named ones' courses above, the rest here)
    if (d.drawn) {
      lines.length = 0;
      for (const c of figureCourses()) {
        if (!d.drawn(c.v)) continue;
        let prev: { x: number; y: number } | null = null;
        for (const q of c.pts) {
          const a = d.project(q, { x: 0, y: 0 });
          const ok = Number.isFinite(a.x) && Number.isFinite(a.y);
          if (prev && ok) lines.push([prev.x, prev.y, a.x, a.y]);
          prev = ok ? a : null;
        }
      }
    }
    const res = solve({ items, view, blockers, lines });
    this.dropped = res.dropped; this.hiddenIds = res.hidden;
    const wants = new Map<string, Want>();
    for (const p of res.placed) {
      const m = this.metas.get(p.id);
      const dim = !!m && named.size > 0 && !this.isNamed(m);
      wants.set(p.id, { p, dim });
    }
    this.wants = wants;
  }

  /** The room the catheter's cards use: the figure's free room (between the cards the screen carries), inside the view (the 2D app's `lim` and `top`: the
   *  free band's edges, which also say whether the stack is tight). */
  private cathBand(view: Box): Box {
    const f = this.deps.free();
    const b = { x0: Math.max(f.x0, view.x0), y0: Math.max(f.y0, view.y0), x1: Math.min(f.x1, view.x1), y1: Math.min(f.y1, view.y1) };
    return b.x1 - b.x0 > 40 && b.y1 - b.y0 > 40 ? b : view;
  }
  /** The readings as the cards print them now: the free and wedged pressures, and the HVPG they give. */
  cathText(): CathText {
    if (this.state.proc) return this.state.proc.text;
    const r = this.deps.reading.bind(this.deps), f = (v: number | null) => fmtPressure(v, null, false);
    return { f: f(r('fhvp')), w: f(r('whvp')), h: f(r('hvpg')), hv: r('hvpg') };
  }
  /** The catheter's cards this frame (cath-show.ts): written by the layer as transform and opacity. */
  get cath(): CathFrame { return this.show.frame; }
  /** The boxes the catheter's cards take (a test judges them against the cards and the view). */
  cathBoxes(): Box[] { return this.show.boxes; }
  /** The cards themselves (no pointer's run). */
  cathCards(): Box[] { return this.show.cards; }
}

const boxKey = (b: Box) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;

/** The vessel's half width on the canvas at its middle: its drawn radius times the pixels one scene unit covers there. */
function vesselHalfWidthPx(s: Station, d: LabelDeps, a: Vector3, b: Vector3): number {
  if (!s.vessel) return 3;
  s.at(s.u0, a); b.copy(a); b.x += 0.1;
  const p = d.project(a, { x: 0, y: 0 }), q = d.project(b, { x: 0, y: 0 });
  const perUnit = Math.hypot(q.x - p.x, q.y - p.y) / 0.1;
  return Math.max(2, (VESSEL_RADIUS.get(s.vessel) ?? 0.06) * perUnit);
}
import { MAPPED } from '../vessels/network.ts';
const VESSEL_RADIUS = new Map(MAPPED.map((v) => [v.id, v.radius]));

export { calloutsFor };
export type { CalloutKind };
