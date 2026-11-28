// The deck shape the 3D app plays, and the check that every field is what the cards need.
// Words and numbers come from the 2D app's deck (scripts/copy-decks.mjs); the 3D fields (shot) are added in hvpg.ts.

/** Named camera shots (the scene's camera/shots.ts owns what each one frames; the deck only names them). A slide's shot is its own id. */
export const SHOTS = ['title', 'route', 'free', 'wedge', 'hvpg'] as const;
export type ShotName = (typeof SHOTS)[number];

/** The catheter state a slide asks for (the scene's catheter.ts plays it). */
export const CATHS = ['route', 'free', 'wedge', 'result', 'blocked'] as const;
export type CathState = (typeof CATHS)[number];

/** The readings a line or a ladder may name. Each is one engine value (mmHg). */
export const READING_KEYS = ['whvp', 'fhvp', 'hvpg', 'ivc', 'ra', 'pv', 'ppg'] as const;
export type ReadingKey = (typeof READING_KEYS)[number];

/** One piece of an equation under a title: <mi> names a quantity, <mo> an operator. `tone` colours a quantity as the ladder does. */
export interface EqPart { tag: 'mi' | 'mo' | 'mn' | 'mfrac'; text: string; tone?: EqTone; /** a subscript (P with portal vein below it) */ sub?: string; /** a fraction's two halves (`text` is their plain reading) */ num?: EqPart[]; den?: EqPart[] }

/** What the scene is asked to show for a slide that is not one of the slice's named shots (batch B13: derived from the 2D deck's own camera, lens and labels). */
export interface SlideScene {
  shot: import('../scene/camera/shots.ts').Shot;
  /** the lobule or sinusoid camera name when the slide is in one of those views */
  lobuleCam: import('../scene/lobule/shots.ts').LobuleCam | null;
  view: 'body' | 'lobule' | 'sinusoid' | 'circuit';
  lens: import('../scene/lenses/model.ts').LensId;
  /** stations labelled on the figure */
  labels: string[];
  /** figure parts the words point at (2D term targets) */
  terms: string[];
  /** a Circuit slide: the part of the map it frames, the resistors it draws, the caudate lane (hp/plan.ts CircuitDirective); null off the Circuit */
  circuit?: { box: readonly [number, number, number, number]; kMax: number | null; resistors: string[]; caudate: boolean } | null;
}

/** The data card of tiles: which readings, the key ones, and the state the change counts from. The numbers come from the slide's own state in the engine, never from the deck. */
export interface SlideTiles { deck: string; slide: string; keys: string[]; key: string[]; delta: string | boolean | null; /** the readings the card prints once its chart's own are left out (2D card-tiles.js ownKeys: a flow-time chart's two lines on a laptop or tablet unless keepTiles, the number a FibroScan or monitor shows large), on a wide screen and on a phone */ own?: { wide: string[]; phone: string[] }; /** the response tile's baseline (2D `hvpgResp`): a slide id, or true for the slide before */ resp?: string | true }

/** A slide's patient: the preset to load and the parameter changes over it (the engine's own shape), as the 2D deck's `preset` and `params`. */
export interface SlideModel { preset: string; params?: unknown; days?: number }

/** A summary table over the figure's data card (the 2D `visual: 'table'`): one row per patient (a slide's state, by id, or a patient of its own), one column per reading. */
export interface TableRowSpec {
  /** a slide of this deck: the row is the patient the slide stands on */
  id?: string;
  /** a patient of its own (a row no slide shows): its preset and parameter changes */
  preset?: string; params?: unknown; days?: number;
  /** days the patient lives at that state before it is read, so the slow organs (the spleen, the platelets) settle: the slide's own `relax` (a row that stands for a slide carries the slide's) */
  relax?: number;
  title?: string; kicker?: string; site?: string; key?: string;
  /** the row's arrows compare with this slide id (or this row's key) instead of the first row */
  vs?: string;
  /** the reference row: keeps its numbers, the anchor for the arrows */
  ref?: boolean;
  blank?: string[]; miss?: string[]; missPart?: string[]; calm?: string[];
  note?: string | string[];
  /** the vessel of this row's Doppler trace (the `wave` column); the slide's `wave` otherwise */
  wave?: string;
}
export interface TableSpec {
  /** the readings, as tile keys; the 2D default is PV, WHVP, FHVP, IVC, RA, HVPG, PPG with the ascites pair */
  cols?: string[];
  of: (string | TableRowSpec)[];
  /** the arrows compare each row with the first ('first') */
  vs?: string;
  asc?: boolean; rowHead?: string; foot?: string; note?: string | string[]; calm?: string[]; focusRow?: string;
  /** the `wave` column's vessel for every row, and the scale of its traces in cm/s (50 by default) */
  wave?: string; waveMax?: number;
  /** the rows this slide shows, [from, to) of `of`, when the table was shared out over several slides (decks/overlay.ts); the columns and numbers stay the whole table's */
  window?: [number, number];
}

export interface Slide {
  id: string;
  kicker: string;
  title: string;
  /** The teaching line. Markup: {hvpg} a live reading, {hvpg:0} whole, {>=10 mmHg} a cut-off, [label](term) a figure term, **bold**. */
  line: string;
  /** A procedure slide whose line prints readings the procedure changes: the words until the figure shows the result,
   *  in the future tense, printing no reading the state on show does not yet hold (ui/deck/step-words.ts). */
  lineAhead?: string;
  /** the step of the slide's procedure on which `line` takes over from `lineAhead` */
  aheadUntil?: number;
  /** A case opens the slide on its own card first (a beat before the slide). */
  vignette?: string;
  /** A question slide (2D `question`): asked on a card of its own before the slide, which is its answer. Not on a slide that has a case, a patient of its own or a procedure. */
  question?: string;
  /** The one short question a case may end on, on its own line under the case (2D `caseQ`). */
  caseQ?: string;
  /** A caution under the line (2D `caveat`) and the source of the claim (2D `cite`). */
  caveat?: string;
  cite?: string;
  /** The 2D `visual` of a slide that has no teaching line (table, plane, ladders, walls…): the data card carries the slide. */
  visual?: string;
  /** A time-lapse: its days, the words of the counter (2D `lapse.from` / `lapse.to`), and whether the days play on the live figure (else the counter reads as done). */
  lapse?: { days: number; from?: string; to?: string; plays: boolean };
  /** The slide's instrument or chart in the data card (2D `tool`): its kind; the card reads the whole of it from the copied slide (ui/talk/ToolCard.tsx). */
  tool?: { kind: string };
  /** The live controls on the teaching card: compare buttons, a what-if slider, the beta-blocker response, the scale pill (decks/controls.ts). */
  controls?: SlideControls;
  terms?: Record<string, string>;
  /** What the 2D line typesetter reads (presenter-words.js rich): the slide's `terms` as written (a list of station ids or { word: id }), its `key` tiles and `bold` words. */
  lineTerms?: Record<string, string> | string[];
  lineKey?: string[];
  lineBold?: string[];
  eq?: EqPart[];
  /** The ladder (data) card: which readings, which one is the result. Absent: no data card on this slide. */
  ladder?: { rows: ReadingKey[]; result?: 'hvpg' };
  /** The catheter state the slide asks for; a slide with no catheter (most talks' slides) leaves it out. */
  cath?: CathState;
  /** The patient the slide stands on (a 2D preset id with its parameter changes): the model takes it when the slide is shown. A slide without one keeps the patient it is on. */
  model?: SlideModel;
  /** A summary table in the data card's place. */
  table?: TableSpec;
  notes: string;
  ask?: [string, string];
  /** A named shot of the slice, or (a ported deck) `scene`. */
  shot?: ShotName;
  scene?: SlideScene;
  tiles?: SlideTiles;
  /** the line under the equation (what its letters stand for) */
  eqLegend?: string;
  /** The level of portal hypertension the slide is about (2D `site`: pre, presin, sin, postsin, post, cardiac); it names and colours the card's level tab. */
  site?: string;
  /** A second level the slide is also about (a level id, as `site`): a second tab joins the first in the card's corner. Set in 3D only (hp/deck.ts ALSO_SITE), never from the 2D deck. */
  also?: string;
  /** The split orbit (decks/split-slides.ts): the words over the healthy liver and over this slide's patient. A 3D addition from the overlay (decks/overlay.ts), never from the 2D deck. */
  split?: { label: string; against: string };
  /** The liver-function card under the criteria (decks/overlay/scores.ts). */
  scores?: import('./overlay/scores.ts').SlideScores;
  /** A question the room answers before the model reveals (decks/interact.ts). */
  interact?: import('./interact.ts').Interact;
  /** The level rail under the line (2D `rail`): every level named ('all') or the slide's own level marked (true). */
  rail?: 'all' | true;
  /** Two guidelines side by side under the line (2D `sides`). `text` takes the line's own tokens. */
  sides?: { who: string; text: string }[];
  /** `pill: false` (2D): no value of the line is set in a pill unless the line braces it. */
  pill?: false;
  /** The causes under the line (2D `causes`, `causesHead`). */
  causes?: string[];
  causesHead?: string;
  /** The views of the figure after the slide's own, one per Next (2D `beats`: the camera each beat asks for; the words and the data stay). */
  beats?: SlideScene[];
}

/** The words of a slide's first card (its case, or its question) and its kicker; null when the slide opens on its words. */
export const caseOf = (s: Slide): { kicker: string; text: string } | null => (
  s.vignette ? { kicker: 'Case', text: s.vignette }
    : s.question ? { kicker: 'Question', text: s.question }
      : s.interact ? { kicker: 'Your turn', text: s.interact.prompt } : null);

export interface Deck {
  id: string;
  title: string;
  level: string;
  minutes: number;
  summary: string;
  objectives: string[];
  slides: Slide[];
  /** The quick check: [question, answer]. */
  checks: [string, string][];
  /** Where a slide's numbers come from: `live` (the engine the figure runs, the slice) or `states` (each slide's own state, computed off screen). */
  numbers?: 'live' | 'states';
  /** The outline's own sections, [name, [the kickers or slide ids each holds]] (a deck whose kicker groups are not three to five sets them). */
  sections?: [string, string[]][];
  /** The name in the tab at each card's top right (the 2D menu's short name); a deck without one shows its title when that is 24 characters or fewer. */
  head?: string;
  /** A deck built from a script, or imported, that lives on this device (the Present menu's "Your scripts"). */
  mine?: boolean;
  /** What a deck of your own asked for that the app could not play, in plain words (decks/author.ts); absent or empty when nothing was left out. */
  notices?: string[];
}

import { parseToken } from '../ui/text/tokens.ts';
import type { SlideControls } from './controls.ts';
import type { EqTone } from './eq-tone.ts';

const TOKEN = /\{([^}]*)\}/g;
const CUT_RE = /^(>=|<=|>|<)\s*\d+(\.\d+)?(\s+[A-Za-zµ%/]+)?$/;

/** Every problem found in a deck, as readable sentences; an empty list is a valid deck. */
export function validateDeck(deck: Deck): string[] {
  const bad: string[] = [];
  const text = (v: unknown, where: string) => { if (typeof v !== 'string' || !v.trim()) bad.push(`${where} is empty`); };
  text(deck.id, 'deck id'); text(deck.title, 'deck title'); text(deck.summary, 'deck summary');
  if (!Number.isFinite(deck.minutes) || deck.minutes <= 0) bad.push('deck minutes is not a positive number');
  if (!Array.isArray(deck.objectives) || deck.objectives.length < 2 || deck.objectives.length > 4) bad.push('a deck lists 2 to 4 objectives');
  deck.objectives?.forEach((o, i) => text(o, `objective ${i + 1}`));
  if (!Array.isArray(deck.slides) || !deck.slides.length) bad.push('a deck needs at least one slide');
  if (!Array.isArray(deck.checks) || !deck.checks.length) bad.push('a deck needs a quick check');
  deck.checks?.forEach((c, i) => { if (!Array.isArray(c) || c.length !== 2) bad.push(`check ${i + 1} is not [question, answer]`); else { text(c[0], `check ${i + 1} question`); text(c[1], `check ${i + 1} answer`); } });
  const ids = new Set<string>();
  for (const s of deck.slides ?? []) {
    const at = `slide "${s.id}"`;
    if (ids.has(s.id)) bad.push(`${at} is a second slide with the same id`);
    ids.add(s.id);
    for (const f of (s.visual ? ['kicker', 'title', 'notes'] : ['kicker', 'title', 'line', 'notes']) as ('kicker' | 'title' | 'line' | 'notes')[]) text(s[f], `${at} ${f}`);
    if (!s.scene && !(SHOTS as readonly string[]).includes(s.shot as string)) bad.push(`${at} names the unknown shot "${s.shot}"`);
    if (s.cath !== undefined && !(CATHS as readonly string[]).includes(s.cath)) bad.push(`${at} names the unknown catheter state "${s.cath}"`);
    for (const m of (s.line ?? '').matchAll(TOKEN)) {
      const body = m[1].trim();
      if (CUT_RE.test(body)) continue;
      const tk = parseToken(body);
      if (tk.kind === 'literal' && !/[\d%]/.test(tk.text)) bad.push(`${at} line has the token {${body}}, which is no reading or cut-off`);
    }
    // (the notes read the model through the same braces as the words, P-20: a token there is a reading or a typed number, and the braces balance)
    for (const m of (s.notes ?? '').matchAll(TOKEN)) {
      const body = m[1].trim();
      if (CUT_RE.test(body)) continue;
      const tk = parseToken(body);
      if (tk.kind === 'literal' && !/[\d%]/.test(tk.text)) bad.push(`${at} notes have the token {${body}}, which is no reading or cut-off`);
    }
    if (/\{[^}]*$/.test(s.notes ?? '') || /^[^{]*\}/.test(s.notes ?? '')) bad.push(`${at} notes have an unbalanced brace`);
    if (/\{[^}]*$/.test(s.line ?? '') || /^[^{]*\}/.test(s.line ?? '')) bad.push(`${at} line has an unbalanced brace`);
    for (const r of s.ladder?.rows ?? []) if (!(READING_KEYS as readonly string[]).includes(r)) bad.push(`${at} ladder names the unknown reading "${r}"`);
    if (s.ladder?.result && !s.ladder.rows.includes('whvp')) bad.push(`${at} ladder has a result but no wedged row`);
    if (s.eq && !s.eq.every((p) => (p.tag === 'mi' || p.tag === 'mo' || p.tag === 'mn' || p.tag === 'mfrac') && typeof p.text === 'string' && p.text)) bad.push(`${at} equation has a part that is none of <mi>, <mo>, <mn> or a fraction`);
    if (s.ask && (s.ask.length !== 2 || !s.ask[0] || !s.ask[1])) bad.push(`${at} ask is not [question, answer]`);
  }
  return bad;
}
