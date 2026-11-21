// The label controller: what is labelled now, where each dot stands on the canvas, when to solve and what to draw this frame.
// Everything it needs from outside comes in through `LabelDeps`, so node runs it with fakes (tests/labels-controller.test.ts) and the
// layer (LabelLayer.tsx) only feeds it the real camera and writes its answer to the DOM. Called once per frame in the clock's `tags` phase.
//
// Labels ride the picture (2D: "labels part of the figure"). A hand on it (a tilt, a turn, a pan, a zoom) and the camera in flight (a slide's glide, a Fit) alike: each label keeps its place
// beside its vessel's own 3D point, re-projected every frame (its leader follows), and the names are placed again, only where they must change, once the picture has been still for FOLLOW_MS
// (Mohammad, 20 Nov: "the labels should know we're tilting and still call out the correct thing"; audit 4.4: every slide's camera move hid every label until 180 ms after it landed). A dot
// that jumps (a cut, a dive's far end) is not carried: everything fades and returns FADE.settleMs after the picture stops. A label that is wanted at another spot or with other words crosses
// over from the old picture to the new (fade.ts); a label that comes to stand under a card or past the edge fades out whole and back once clear (roomFade, 2D ROOM_MS).
import { anyMoving } from '../any-moving.ts';
import { Vector3 } from 'three';
import { FADE, labelOpacity } from './alpha.ts';
import { COMPACT_W, ZOOM_IN, ZOOM_OUT, extraRoom, flaggedStations, freeSet, keepExtras, type LabelLevel } from './free-set.ts';
import { NO_EXTRAS, WIDEST, WIDEST_DELTA, readingLensOf, type Extras } from './readings.ts';
import { LabelFader, type Want } from './fade.ts';
import { type Box, leaderGeom } from './geometry.ts';
import { type Form, type Item, type Placement, boxOf, solve } from './solver.ts';
import { STATIONS, ORGAN_FRONT, figureCourses, type Station } from './stations.ts';
import { silhouettes, onOtherOrgan, spotOffsets, type Silhouettes, type To2Screen } from './organ-screen.ts';
import { x3, y3 } from '../frame2d.ts';
import { fmtPressure } from '../../ui/text/line.ts';
import { LS, boxSize, organRun, stationRuns, type Say } from './type.ts';
import { dockKey, type Dock } from './key-dock.ts';
import { RoomFade } from './ride.ts';
import { STENT_IDS, STENT_STATIONS, COMPACT_W as STENT_COMPACT, geoFrac, geoLines, geoSets, geoSize, encodeGeo, pointName, type StentView, type StentId } from './stent-labels.ts';
import { STENT_SITES } from '../../engine/hales/portal/topology.js';
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
  /** The Anatomy is the figure (the catheter and its reading cards live on the body: a hepatic vein is not in the Lobule, the Sinusoid or the Circuit). Absent: always. */
  anatomy?(): boolean;
  /** Whether the varices (VAR) or the fundal varices (GV) exist now, as 2D's hasVarices answers it: no varices, no callout (a healthy patient's node is only the balance between
   *  the coronary vein and the azygos, and a "varices" label on it would mislead), and the fundus label comes in with its varices. Absent: the old behaviour (VAR always, GV never). */
  present?(id: 'VAR' | 'GV'): boolean;
  /** How tall the whole figure stands on the screen now, CSS px (the plate's top to its bottom). Absent: the figure is never too small for its names. */
  figureH?(): number;
  /** Whether a vessel (a network id) is drawn now (a collateral only once it is open; a shunt only while a procedure has put it in). Present: every drawn vessel's course is a line the names keep off; absent: the named vessels' only. */
  drawn?(v: { id: string; kind: string; feeder?: unknown }): boolean;
  /** What a station says beside its name (readings.ts: the unit, the change badge, the lens's own reading, an alert). Absent: the name and the pressure only. `P` is the station's pressure now. */
  extras?(node: string, P: number | null, flags: { selected: boolean; lit: boolean; presenting: boolean }): Extras;
  /** The camera's zoom over the shot's own framing (1 as framed; > 1.3 counts as zoomed in). Absent: 1. */
  zoom?(): number;
  /** The Figure menu's label level (none, key, all). Absent: key. */
  level?(): LabelLevel;
  /** The Blood menu's Pressure values (2D `layers.chips`): off, a station's label is its name only (2D `.chips-off .lb-val { display: none }`). Absent: on. */
  chips?(): boolean;
  /** The stations either side of a narrowed vessel (the findings flag them). Absent: none. */
  stenosed?(): readonly string[];
  /** The TIPS and DIPS stents: where they stand drawn and settled, what a slide reads at their three Doppler points (stent-labels.ts). Absent: no stent labels. */
  stents?(): StentView | null;
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
  /** A talk is on (2D `presenting`): the figure names exactly what the slide names (`named` and `shown`, and the one picked), nothing else; free play names its own set (free-set.ts). */
  presenting: boolean;
}

/** What a leader crossing a vessel costs the solver, per line (solver `leaderLineCost`; the Circuit's captions pass theirs): a name's leader over the figure's vessels points at nothing useful. */
const LEADER_LINE_COST = 9;
export const NO_STATE: LabelState = { named: new Set(), shown: new Set(), tones: {}, picked: null, cath: null, organNames: false, quiet: false, proc: null, key: null, presenting: false };

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
  /** The unit after the reading, the change badge ("+7.9") and which way it went, an alert ("no flow", "stasis"), and words standing in for the number ("microcirculation"): readings.ts, as 2D says them. */
  unit: string; delta: string; up: boolean; alert: string; note: string;
  /** A stent point's number colour (the velocity lens's, toward the text) and whether the Doppler samples it (named in bold); the stent's own label (a few lines: its `word` is encodeGeo's). */
  tint?: string; gate?: boolean; geo?: boolean;
  /** This picture's share of the label's opacity (1 standing still; while the label crosses to a new spot or new words, the new picture's easeMove share and the old picture's rest). */
  mix: number;
  /** The old picture a label is leaving (drawn as its own element, fading out where it stood): its dot is not drawn, the ring is the label's. */
  ghost?: boolean;
  /** The ring's own opacity (the label's, whatever picture is crossing). */
  ringAlpha: number;
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
  /** What it says beside its name, as the layout reserves it (widest numbers), and the key of those words (a new key is new words, crossed over). */
  say: Say;
  vkey: string;
  /** The live extras now (the number in place of the pressure, the badge's text, the alert, the note). */
  ex: Extras;
  /** Shown whole beside its vessel or not at all (2D `minor`). */
  optional?: boolean;
  /** One of the extra stations (shown zoomed in, only where room is free). */
  extra?: boolean;
  /** Never left out for want of room (the patient's flagged stations; at the All level every one). */
  must?: boolean;
  /** One of a stent's own labels (stent-labels.ts), and the importance it takes now. */
  stent?: boolean;
  pri?: number;
}

/** What a placed label says (kept with its placement: the picture it leaves is drawn as it was). */
interface Snap { word: string; unit: string; delta: boolean; alert: string; note: string; rev: boolean; bare: boolean }
export const GHOST = '~old';
/** The words after a station's name as the layout reserves them: the widest number the lens ever sets, the unit, the badge (at its widest), the alert, or a note in place of the number. */
function sayOf(ex: Extras): Say {
  if (ex.note) return { note: ex.note };
  const say: Say = {};
  if (ex.number != null) say.value = ex.number === '—' ? '—' : WIDEST[ex.lens];
  if (ex.unit) say.unit = ex.unit;
  if (ex.delta || false) say.delta = WIDEST_DELTA[ex.lens] || ex.delta;
  if (ex.alert) say.alert = ex.alert;
  return say;
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
  /** What the reading cards were last solved for while the picture was still sliding (see tick): the cards ride their points, so they never wait for a rest the slide would not give. */
  private cardSig = '';
  private last = -1;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly cTip = new Vector3();
  private readonly show = new CathShow();
  /** A cut's frozen picture (Mohammad's audit, 21 Nov: names moved 700 to 1,300 px in one frame while half faded): the names and cards that fade out because a dot jumped stay where they stood
   *  (the dots' places before the cut) until they are gone and the picture has been still; only then do they ride the new picture again, placed afresh. Fade and move are tied. */
  private cutAnchors: Map<string, { x: number; y: number }> | null = null;
  private cutCard: { tip: [number, number] | null; ahead: [number, number] | null } | null = null;
  private cTipPx: [number, number] | null = null;
  private cAheadPx: [number, number] | null = null;
  private cGot: 0 | 1 | 2 = 0;
  private readonly cAhead = new Vector3();
  private readonly at = new Vector3();
  private readonly at2 = new Vector3();
  private readonly pt = { x: 0, y: 0 };
  private readonly pt2 = { x: 0, y: 0 };
  private firstTick = true;
  private keySize: { w: number; h: number } | null = null;
  private keyNatural: { w: number; h: number } | null = null;
  /** The room each drawn label has now (0 under a card or past the edge, 1 clear), eased over FADE.roomMs (2D roomFade). */
  private readonly room = new RoomFade();
  /** The boxes of the names drawn so far this frame (see step 4 of tick). */
  private readonly taken: Box[] = [];
  /** The last change badge each station showed: the one a badge that has just gone is crossed out with, and what the layer writes while the box still has its room. */
  private readonly lastDelta = new Map<string, { text: string; up: boolean }>();
  private zoomedNow = false;
  /** The dock the key stands at now (its wrap width and minimum height go to the element). */
  dock: Dock | null = null;
  readonly out: Draw[] = [];
  /** Items the last solve could not place at all (a test asserts none in the slice's framings). */
  dropped: string[] = [];
  hiddenIds: string[] = [];
  /** Optional names (shown only where they fit) the last solve left out. */
  skipped: string[] = [];

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
    // (decided by the key on one line only: the size it is drawn at depends on this very decision, so using it would never settle)
    const natural = this.keyNatural;
    if (!natural) return null;
    return dockKey({ vp: this.deps.vp(), words: this.deps.words(), natural, wrapped: this.keySize });
  }
  keyBox(): Box | null { return this.keyDock()?.box ?? null; }
  /** Fonts or sizes changed: forms are measured again. */
  invalidateForms(): void { this.formCache.clear(); this.dirty = true; }

  /** The extra stations' ids the last frame kept (zoomed in: those with 80 px free round their dot). */
  extrasKept: string[] = [];

  /** What is labelled now, in drawing order. A talk names exactly what the slide names; free play names the set 2D's Key, All and None levels name (free-set.ts). */
  active(): Meta[] {
    const st = this.state;
    const list: Meta[] = [];
    // Under the HVPG catheter the figure's names are hidden: "the HVPG catheter's readings stand alone, so it hides them" (stage.js setCatheter, `cath-on`; a
    // treatment keeps them). They fade out as the catheter comes in and back as it goes.
    if (HIDE_UNDER_CATHETER && (st.cath || st.quiet)) return list;
    if (st.panel) return list;
    const d = this.deps;
    const picked = st.picked ? STATIONS.find((s) => s.vessel === st.picked)?.id ?? null : null;
    const gate = (s: Station): boolean | null => ((s.id === 'VAR' || s.id === 'GV') && d.present ? d.present(s.id) : null);
    let free: ReturnType<typeof freeSet> | null = null;
    if (!st.presenting) {
      const vp = d.vp();
      const zoom = d.zoom?.() ?? 1;
      this.zoomedNow = zoom > (this.zoomedNow ? ZOOM_OUT : ZOOM_IN);
      free = freeSet({
        level: d.level?.() ?? 'key', zoomed: this.zoomedNow, compact: vp.w < COMPACT_W,
        hasVar: d.present ? d.present('VAR') : true, hasGv: d.present ? d.present('GV') : false,
        ra: d.pressure('RA'), reversed: (id) => { const s = STATIONS.find((x) => x.id === id); return !!s?.vessel && d.reversed(s.vessel); },
        stenosed: d.stenosed?.() ?? [], picked,
      });
    }
    for (const s of STATIONS) {
      if (s.kind === 'organ') { if (st.organNames) list.push(this.metaOf(s)); continue; }
      const gated = gate(s);
      if (st.presenting) {
        // a slide names exactly the stations it talks about (2D store.presentLabels = the slide's `labels` and the stations its words light), with the varices gated as 2D gates them
        if (!(st.named.has(s.id) || st.shown.has(s.id) || s.id === picked)) continue;
        if (gated === false && s.id !== picked) continue;
        list.push(this.metaOf(s));
        continue;
      }
      if (!free!.show.has(s.id) && !free!.extra.includes(s.id)) continue;
      if (gated === false && s.id !== picked) continue;
      const m = this.metaOf(s);
      if (free!.minor.has(s.id)) m.optional = true;
      if (free!.must.has(s.id)) m.must = true;
      if (free!.extra.includes(s.id)) m.extra = true;
      list.push(m);
    }
    // a TIPS or DIPS stent that is drawn and settled has its own label, and where a slide reads it at its three Doppler points, three more (2D stage-label-solve.js)
    const sv = d.stents?.() ?? null;
    if (sv) {
      for (const sid of STENT_IDS) {
        const ready = sv.ready(sid);
        if (!ready) continue;
        const seg = sv.sampled(sid), all = sv.all(sid);
        geoFrac[sid] = seg ? (STENT_SITES as Record<string, number>)[seg] ?? 0.5 : 0.5;   // (while the Doppler samples this stent, its label points at the third the gate reads)
        for (const s of STENT_STATIONS) {
          if (s.stent!.sid !== sid) continue;
          if (s.stent!.pt !== 'geo' && !all) continue;
          const m = this.stentMeta(s, sv, all);
          if (m) list.push(m);
        }
      }
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

  /** Whether a station's label carries a number (2D: the hepatic artery's is its name only: its pressure sits off the venous scale and says little). */
  private hasNumber = (s: Station): boolean => (s.stent ? s.stent.pt !== 'geo' : !!s.node && s.id !== 'HA' && (this.deps.chips?.() ?? true));

  /** A stent's label (2D geomItem / velItem). Its stent: one label, a line each for the diameter, the waist and the end stenosis, shortened by whole lines. A point: its name and its velocity, one form (a point's name without its number says nothing). */
  private stentMeta(s: Station, v: StentView, all: boolean): Meta | null {
    const { sid, pt } = s.stent!, d = this.deps, vp = d.vp(), padX = LS.PAD.x, padY = LS.PAD.y;
    if (pt === 'geo') {
      const sets = geoSets(geoLines(sid, v.facts(sid as StentId)));
      const words = sets.map((ls) => encodeGeo(ls));
      const key = `geo|${words[0]}|${vp.w}x${vp.h}`;
      let forms = this.formCache.get(key);
      if (!forms) {
        forms = sets.map((ls, i) => { const b = geoSize(ls, vp, d.measure); return { text: words[i]!, w: Math.ceil((b.w + padX * 2) * 100) / 100, h: Math.ceil((b.h + padY * 2) * 100) / 100 }; });
        this.formCache.set(key, forms);
      }
      return { id: s.id, kind: 'station', station: s, forms, vwUnits: 0, rev: false, say: {}, vkey: words[0]!, ex: NO_EXTRAS, stent: true, pri: all ? 7 : 9 };
    }
    const r = v.read(sid as StentId, pt as 'proximal' | 'mid' | 'distal');
    if (!r) return null;
    const name = pointName(sid, pt as 'proximal' | 'mid' | 'distal', vp.w < STENT_COMPACT);
    const say: Say = { value: '000', unit: 'cm/s' };
    const key = `pt|${s.id}|${name}|${vp.w}x${vp.h}`;
    let forms = this.formCache.get(key);
    if (!forms) {
      const b = boxSize(stationRuns(name, true, false, '000', say), vp, d.measure);
      forms = [{ text: name, w: Math.ceil(b.w * 100) / 100, h: Math.ceil(b.h * 100) / 100 }];
      this.formCache.set(key, forms);
    }
    const ex: Extras = { ...NO_EXTRAS, lens: 'velocity', number: r.number, unit: r.none ? '' : 'cm/s', tint: r.tint, gate: v.sampled(sid as StentId) === pt };
    return { id: s.id, kind: 'station', station: s, forms, vwUnits: 0, rev: false, say, vkey: name, ex, stent: true, pri: 8 };
  }

  private metaOf(s: Station): Meta {
    const rev = !!s.vessel && s.kind !== 'organ' && this.deps.reversed(s.vessel);
    if (s.kind === 'organ' || !this.hasNumber(s)) return { id: s.id, kind: 'station', station: s, forms: this.stationForms(s, rev, '', {}), vwUnits: 0, rev, say: {}, vkey: '', ex: NO_EXTRAS };
    const st = this.state, d = this.deps;
    const P = d.pressure(s.node!);
    const ex = d.extras ? d.extras(s.node!, P, { selected: !!st.picked && s.vessel === st.picked, lit: !!st.tones[s.id], presenting: st.presenting }) : NO_EXTRAS;
    const say = sayOf(ex);
    const vkey = `${say.value ?? ''}|${say.unit ?? ''}|${say.delta ?? ''}|${say.alert ?? ''}|${say.note ?? ''}`;
    return { id: s.id, kind: 'station', station: s, forms: this.stationForms(s, rev, vkey, say), vwUnits: 0, rev, say, vkey, ex };
  }
  /** The forms a station can take, widest first (the 2D app's own: the full name and reading, the short name and reading, the reading alone).
   *  Each is its words' width and height in the 2D type (type.ts) plus the 2D padding; none has a pill. `say` is what follows the name (the unit, the badge, the alert: laid out at the widest). */
  stationForms(s: Station, reversed = false, vkey = '', say: Say = {}): Form[] {
    const key = s.id + (reversed ? '|r' : '') + '|' + vkey;
    const c = this.formCache.get(key);
    if (c) return c;
    const d = this.deps, vp = d.vp(), forms: Form[] = [];
    const form = (text: string, runs: ReturnType<typeof stationRuns>, organ = false): Form => { const b = boxSize(runs, vp, d.measure, organ); return { text, w: Math.ceil(b.w * 100) / 100, h: Math.ceil(b.h * 100) / 100 }; };
    if (s.kind === 'organ') forms.push(form(s.name.toUpperCase(), [organRun(s.name)], true));
    else {
      const has = this.hasNumber(s);
      forms.push(form(s.name, stationRuns(s.name, has, reversed, '00.0', say)));
      if (s.abbr && s.abbr !== s.name) forms.push(form(s.abbr, stationRuns(s.abbr, has, reversed, '00.0', say)));
      // (never the number alone: a reading with no name beside it says nothing, "5.0" floating in the liver. A name that has no room as its short form is left out, as the 2D app's solver does when none fits; Mohammad's play-test, 20 Nov)
      // (2D shortenItem: where a label has no room, the unit and the badge go first and the number stays: "Azygos 6.7". Forms here are wider first, so the same steps follow each other.)
      if (has && (say.unit || say.delta || say.alert) && !say.note) {
        const bare: Say = { value: say.value };
        const f1 = form(s.name, stationRuns(s.name, has, reversed, '00.0', bare)); f1.bare = true; forms.push(f1);
        if (s.abbr && s.abbr !== s.name) { const f2 = form(s.abbr, stationRuns(s.abbr, has, reversed, '00.0', bare)); f2.bare = true; forms.push(f2); }
      }
    }
    this.formCache.set(key, forms);
    return forms;
  }

  private anchorOf(m: Meta, u: number, out: Vector3): Vector3 | null {
    return m.station.at(u, out);
  }

  /** Advance one frame (the clock's `tags` phase). Returns true while labels still need frames (fading, crossing, or waiting to come back). */
  tick(): boolean {
    const d = this.deps, now = d.now();
    const dt = this.last < 0 ? 16 : Math.min(100, now - this.last);
    this.last = now;
    const all = d.hidden?.() ? [] : this.active();

    // 1. where the dots are. A dot that jumped (a cut, a dive's far end) hides everything until the picture is still; a dot that moved by a little (a hand on the picture, the camera in flight) is carried:
    // every label keeps its place beside it, re-projected each frame.
    let moved = this.firstTick, cutDot = false;
    let following = d.cameraMoving();   // (a slide's glide carries the labels exactly as a hand does: they ride it and are placed again where it lands)
    this.firstTick = false;
    const anchors = new Map<string, { x: number; y: number }>();
    for (const m of all) {
      const p = this.anchorOf(m, m.station.u0, this.at);
      if (!p) continue;
      const a = d.project(p, { x: 0, y: 0 });
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;   // (a dot behind the camera or at its plane has no place on the screen: it is not placed, never placed at a number that is not one)
      anchors.set(m.id, a);
      const was = this.anchors.get(m.id);
      if (!was) this.dirty = true;   // (a station that comes in is placed when the picture is still; the others are not cut by it)
      else if (Math.hypot(was.x - a.x, was.y - a.y) > FOLLOW_JUMP) { moved = true; cutDot = true; }   // (a dot that jumped is a cut, not a hand: the names leave and return)
      else if (Math.abs(was.x - a.x) > 0.35 || Math.abs(was.y - a.y) > 0.35) following = true;
    }
    if (cutDot && !this.cutAnchors) this.cutAnchors = this.anchors;   // (the places the dots stood at before the cut: the fading names keep them)
    this.anchors = anchors;
    // zoomed in, the other stations stand where 80 px round their dot is free of every other (2D: they appear as the zoom makes room)
    let metas = all;
    if (all.some((m) => m.extra)) {
      const compact = d.vp().w < COMPACT_W, base = all.filter((m) => !m.extra).map((m) => m.id);
      const kept = new Set(keepExtras(all.filter((m) => m.extra).map((m) => m.id), anchors, base, extraRoom(compact)));
      this.extrasKept = [...kept];
      metas = all.filter((m) => !m.extra || kept.has(m.id));
    } else this.extrasKept = [];
    const next = new Map<string, Meta>();
    for (const m of metas) next.set(m.id, m);
    // the set of labelled things changed: solve again
    let setSig = '';
    for (const m of metas) setSig += m.id + (m.rev ? '~' : '') + ':' + m.vkey + (m.optional ? '?' : '') + ',';
    // a label that is no longer asked for goes at once (it fades out where it stands); the ones that come in wait for the picture to be still
    for (const id of this.wants.keys()) if (id !== 'key' && !next.has(id)) { this.wants.delete(id); this.dirty = true; }
    // the catheter's two points move with the picture too: where the tip and the point ahead stand now
    const pr = this.state.proc, got = pr ? (pr.points(this.cTip, this.cAhead) ? 2 : 0) : d.cathere(this.cTip, this.cAhead);
    const tipPx = got ? d.project(this.cTip, { x: 0, y: 0 }) : null, aheadPx = got ? d.project(this.cAhead, { x: 0, y: 0 }) : null;
    const nowTip: [number, number] | null = tipPx ? [tipPx.x, tipPx.y] : null, nowAhead: [number, number] | null = aheadPx ? [aheadPx.x, aheadPx.y] : null;
    // The same two rules as for every dot above: a point that jumped (a cut: it appeared, vanished or leapt) hides the cards until the picture is still; a point that moved by a little (a tilt, the
    // camera following the tip, the scope bending) is CARRIED: the cards ride it (`show.ride`, below) and are placed again at rest. This was `moved` for any 0.35 px, so a tilt or a follow made every
    // card fade out and come back, over and over (Mohammad, 20 Nov: the FHVP, WHVP, HVPG and EUS-PPG callouts "keep flashing in and out of existence").
    const cutPt = (a: [number, number] | null, b: [number, number] | null) => (a === null) !== (b === null) || (!!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) > FOLLOW_JUMP);
    const slidPt = (a: [number, number] | null, b: [number, number] | null) => !!a && !!b && (Math.abs(a[0] - b[0]) > 0.35 || Math.abs(a[1] - b[1]) > 0.35);
    if (cutPt(nowTip, this.cTipPx) || cutPt(nowAhead, this.cAheadPx) || got !== this.cGot) { moved = true; if (!this.cutCard) this.cutCard = { tip: this.cTipPx, ahead: this.cAheadPx }; }
    else if (slidPt(nowTip, this.cTipPx) || slidPt(nowAhead, this.cAheadPx)) following = true;
    this.cTipPx = nowTip; this.cAheadPx = nowAhead; this.cGot = got;
    // A picture that moved places its labels again once it is still: the solve judges screen positions (cards, other labels, the vessels' lines), and none of them is in the signature below. Without
    // this a solve made while the camera stood somewhere else (the dive's far end, where every dot is off the screen and nothing can be placed) was kept for ever after the camera came back, and every
    // name stayed gone until a card happened to change (Mac play-test, 19 Nov: sinusoid back to Anatomy, 10+ seconds with no names).
    if (moved) { this.lastMove = now; this.dirty = true; }
    // a hand on the picture, or the camera in flight: the labels ride their dots (drawn below from the dots' own 3D points), and are solved again once it is still
    if (following) { this.lastFollow = now; this.dirty = true; }
    const hold = now - this.lastMove < FADE.settleMs;
    const resting = now - this.lastFollow >= FOLLOW_MS;

    // 2. solve once the picture is still and something changed (the labelled set, a card, the view, the words)
    const view = d.view(), blockers = [...d.blockers()];
    this.dock = this.keyDock();
    const keyBox = this.dock?.box ?? null;
    if (keyBox) blockers.push(keyBox);
    // a card stands only where what it points at exists: in the Anatomy. In another view it eases out (the cards' own 240 ms) instead of being clamped to the screen's edge
    const here = d.anatomy ? d.anatomy() : true;
    const cathNow = here ? this.state.cath : null, procNow = here ? this.state.proc : null;
    const cathSig = (here ? '' : 'away|') + (this.state.cath || this.state.proc ? `${this.state.proc?.sig ?? ''}|${this.cGot}|${this.cTipPx ? Math.round(this.cTipPx[0]) + ',' + Math.round(this.cTipPx[1]) : '-'}|${this.cAheadPx ? Math.round(this.cAheadPx[0]) + ',' + Math.round(this.cAheadPx[1]) : '-'}` : '');
    const sig = cathSig + '|' + (keyBox ? boxKey(keyBox) : '-') + '|' + setSig + '|' + boxKey(view) + '|' + blockers.map(boxKey).join(';') + '|' + [...this.state.named].sort().join(',') + [...this.state.shown].sort().join(',') + this.state.cath + (this.state.proc?.sig ?? '');
    // A new card (or a new view or card box) comes in while the points slide (a tilt, a follow, the scope bending), which never rests: the reading cards ride their points (`show.ride`), so they are placed
    // now, without the names, which keep waiting for the picture to be still. Without this a card that came while anything slid waited for ever and never appeared (EUS-PPG's PV and HV, 21 Nov).
    if (!hold && !resting && (cathNow || procNow)) {
      const cs = `${this.state.proc?.sig ?? ''}|${this.state.cath ?? ''}|${here ? 1 : 0}|${this.cGot}|${keyBox ? boxKey(keyBox) : '-'}|${boxKey(view)}|${blockers.map(boxKey).join(';')}`;
      if (cs !== this.cardSig) {
        this.cardSig = cs;
        this.show.solve({ vp: d.vp(), cath: cathNow, measure: d.measure, band: this.cathBand(view), blockers, tip: this.cTipPx, ahead: this.cAheadPx, got: this.cGot, text: this.cathText(), ...(procNow ? { kinds: procNow.kinds, kickers: procNow.kickers, tones: procNow.tones } : {}) });
      }
    }
    if (!hold && resting && (this.dirty || sig !== this.sig)) {
      this.sig = sig; this.dirty = false;
      for (const [id, m] of next) this.metas.set(id, m);
      // the catheter's cards stand first (cath.ts: the 2D app's own placing, clear of the cards and the key); the stations keep clear of them
      this.show.solve({ vp: d.vp(), cath: cathNow, measure: d.measure, band: this.cathBand(view), blockers, tip: this.cTipPx, ahead: this.cAheadPx, got: this.cGot, text: this.cathText(), ...(procNow ? { kinds: procNow.kinds, kickers: procNow.kickers, tones: procNow.tones } : {}) });
      this.solveNow(metas, view, [...blockers, ...this.show.boxes]);
      if (keyBox) this.wants.set('key', { p: { id: 'key', form: 0, dx: keyBox.x0, dy: keyBox.y0, w: keyBox.x1 - keyBox.x0, h: keyBox.y1 - keyBox.y0, leader: false, au: 0.5 }, dim: false });
    }
    for (const [id, m] of next) this.metas.set(id, m);   // (the words the label says now; the place it was solved at is in the fader)

    // 3. fades (the catheter's cards have their own: the 2D app's timings)
    this.show.setText(this.cathText(), hold || !(cathNow || procNow));   // (frozen on the outgoing slide's numbers while the cards fade: the next patient's do not belong on them)
    if (!hold) this.cutCard = null;   // (still again: the cards ride the picture as it is now)
    this.show.ride(this.cutCard ? this.cutCard.tip : this.cTipPx, this.cutCard ? this.cutCard.ahead : this.cAheadPx);
    const busy = anyMoving(this.fader.step(dt, this.wants, hold), this.show.step(dt, hold));   // (both step every frame: `||` froze the catheter cards while a label faded)

    // 4. what to draw: each shown label at its spot, following its dot (a cut's dots: where they stood, see cutAnchors)
    if (!hold && resting) this.cutAnchors = null;
    const frozen = this.cutAnchors;
    this.out.length = 0;
    const roomBlk = [...d.blockers()];
    // The names drawn so far this frame (highest rank first) stand in the way of the next: a name carried over another (a spleen that grows under STOMACH, a camera that moves one dot more than its neighbour) fades out whole
    // and back once clear, as it does for a card. The solver keeps them apart at rest; this keeps them apart on the screen.
    const nWalls = roomBlk.length;
    this.taken.length = 0;
    let roomBusy = false;
    for (const [id, s] of this.fader.frame) {
      if (s.alpha <= 0) continue;
      if (id === 'key') {
        this.out.push({ id, kind: 'key', alpha: s.alpha, mix: 1, ringAlpha: s.alpha, x: s.p.dx, y: s.p.dy, w: s.p.w, h: s.p.h, form: 0, word: '', value: '', tone: null, dot: null, rev: false, unit: '', delta: '', up: false, alert: '', note: '', pad: { x: 0, y: 0 }, leader: null, dock: this.dock });
        continue;
      }
      const m = this.metas.get(id) ?? next.get(id);
      if (!m) continue;
      const au = s.from ? s.from.p.au + (s.p.au - s.from.p.au) * s.mix : s.p.au;
      const p = this.anchorOf(m, s.p.au, this.at);
      const pr = s.from ? this.anchorOf(m, au, this.at2) : p;
      if (!p || !pr) continue;
      const fz = frozen?.get(id), a = fz ?? d.project(p, this.pt);
      const ax = a.x, ay = a.y;
      const ring = s.from && !fz ? d.project(pr, this.pt2) : a;
      const box = boxOf(s.p, ax, ay);
      // a label that comes to stand under a card or past the edge (carried by the camera, or a card sliding in) fades out whole and back once clear: never seen cut (2D roomFade)
      roomBlk.length = nWalls;
      for (const t of this.taken) roomBlk.push(t);
      const ra = this.room.of(id, box, view, roomBlk, dt);
      if (ra > 0) this.taken.push(box);
      if (ra > 0 && ra < 1) roomBusy = true;
      if (ra <= 0) continue;   // (invisible: nothing to draw, the layer hides it)
      const dim = this.state.named.size > 0 && !this.isNamed(m) ? s.dim : 0;
      const organ = m.station.kind === 'organ', ringed = !organ;
      const pad = organ ? { x: LS.ORGAN.padX, y: LS.ORGAN.padY } : { x: LS.PAD.x, y: LS.PAD.y };
      const alpha = labelOpacity(s.alpha * ra, dim);
      const snap = s.snap as Snap | undefined;
      const form = m.forms[s.p.form];
      const say = this.live(m, snap);
      this.out.push({
        id, kind: m.kind, alpha, mix: s.mix, ringAlpha: alpha, x: box.x0, y: box.y0, w: s.p.w, h: s.p.h, form: s.p.form, word: snap?.word ?? form?.text ?? '',
        value: this.valueOf(m), tone: this.state.tones[m.station.id] ?? null, dot: ringed ? { x: ring.x, y: ring.y } : null, rev: snap ? snap.rev : !!m.rev, pad, ...say,
        leader: s.p.leader && ringed ? leaderGeom(ax, ay, { x0: box.x0 + pad.x, y0: box.y0 + pad.y, x1: box.x1 - pad.x, y1: box.y1 - pad.y }) : null,
      });
      if (s.from) {
        // the picture the label is leaving: its own box about its own dot, fading out as the new one fades in
        const f = s.from, fs = f.snap as Snap | undefined;
        const fp = this.anchorOf(m, f.p.au, this.tmp);
        if (fp) {
          const fa = d.project(fp, this.pt2), fbox = boxOf(f.p, fa.x, fa.y), fform = m.forms[f.p.form];
          this.out.push({
            id: id + GHOST, kind: m.kind, alpha, mix: 1 - s.mix, ringAlpha: 0, ghost: true, x: fbox.x0, y: fbox.y0, w: f.p.w, h: f.p.h, form: f.p.form, word: fs?.word ?? fform?.text ?? '',
            value: this.valueOf(m), tone: this.state.tones[m.station.id] ?? null, dot: null, rev: fs ? fs.rev : !!m.rev, pad, ...this.live(m, fs),
            leader: f.p.leader && ringed ? leaderGeom(fa.x, fa.y, { x0: fbox.x0 + pad.x, y0: fbox.y0 + pad.y, x1: fbox.x1 - pad.x, y1: fbox.y1 - pad.y }) : null,
          });
        }
      }
    }
    this.room.prune(this.fader.frame);
    return busy || hold || this.dirty || roomBusy;
  }

  /** What a label says beside its name, drawn: the words it had when it was placed (its box is that wide), the number and the badge's text from now. A form that has let the unit, badge and alert go says none of them. */
  private live(m: Meta, snap: Snap | undefined): Pick<Draw, 'unit' | 'delta' | 'up' | 'alert' | 'note' | 'tint' | 'gate' | 'geo'> {
    const sx = { tint: m.ex.tint ?? '', gate: !!m.ex.gate, geo: m.station.stent?.pt === 'geo' };
    if (snap?.bare) return { unit: '', delta: '', up: false, alert: '', note: '', ...sx };
    // (a stent point with no flow says "No flow" and no unit)
    const unit = m.stent && !m.ex.unit ? '' : snap ? snap.unit : m.say.unit ?? '', alert = snap ? snap.alert : m.say.alert ?? '', note = snap ? snap.note : m.say.note ?? '';
    const hasDelta = snap ? snap.delta : !!m.say.delta;
    let delta = '', up = false;
    if (hasDelta) {
      if (m.ex.delta) { this.lastDelta.set(m.id, { text: m.ex.delta, up: m.ex.up }); delta = m.ex.delta; up = m.ex.up; }
      else { const l = this.lastDelta.get(m.id); if (l) { delta = l.text; up = l.up; } }
    }
    return { unit, delta, up, alert, note, ...sx };
  }

  private isNamed(m: Meta): boolean {
    const st = this.state;
    if (st.named.has(m.station.id)) return true;
    return !!st.picked && m.station.vessel === st.picked;
  }

  private valueOf(m: Meta): string {
    if (!this.hasNumber(m.station)) return '';
    if (m.ex.number != null) return m.ex.number;
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
        id: m.id, ax: a.x, ay: a.y, au: m.station.u0, path: path.length ? path : undefined, forms: m.optional ? m.forms.slice(0, 1) : m.forms,
        pri: picked ? 300 : isNamed ? 100 + (m.pri ?? m.station.pri) : m.optional ? 1 : m.pri ?? m.station.pri, must: !!picked || isNamed || !!m.must || this.state.shown.has(m.station.id), ...(m.optional ? { optional: true } : {}), ...(!picked && !isNamed && !this.state.shown.has(m.station.id) && m.station.id !== 'HA' ? { offVessels: true } : {}), dirs: m.station.dirs, region: m.station.kind === 'organ', vw,
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
    // (?capwhy: for each label that stands on a leader, how many of its near spots each rule threw out and who stood in the way, to find what pushed it away)
    const why = typeof location !== 'undefined' && /[?&]capwhy\b/.test(location.search) ? new Map<string, Record<string, number>>() : undefined;
    const res = solve({ items, view, blockers, lines, leaderLineCost: LEADER_LINE_COST, ...(why ? { why } : {}) });
    if (why) for (const p of res.placed) if (p.leader) console.info('[anatomy-labels]', p.id, 'form', p.form, 'dx,dy', Math.round(p.dx), Math.round(p.dy), 'near spots lost to', JSON.stringify(why.get(p.id) ?? {}));
    this.dropped = res.dropped; this.hiddenIds = res.hidden;
    const wants = new Map<string, Want>();
    this.skipped = res.skipped;
    for (const p of res.placed) {
      const m = this.metas.get(p.id);
      const dim = !!m && named.size > 0 && !this.isNamed(m);
      const f = m?.forms[p.form];
      const snap: Snap | undefined = m ? { word: f?.text ?? '', unit: m.say.unit ?? '', delta: !!m.say.delta, alert: m.say.alert ?? '', note: m.say.note ?? '', rev: !!m.rev, bare: !!f?.bare } : undefined;
      wants.set(p.id, { p, dim, key: m ? `${p.form}|${m.vkey}|${m.rev ? 1 : 0}` : '', snap });
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
