// The deck shape the 3D app plays, and the check that every field is what the cards need.
// Words and numbers come from the 2D app's deck (scripts/copy-decks.mjs); the 3D fields (shot) are added in hvpg.ts.

/** Named camera shots (the scene's camera/shots.ts owns what each one frames; the deck only names them). A slide's shot is its own id. */
export const SHOTS = ['title', 'route', 'free', 'wedge', 'hvpg'] as const;
export type ShotName = (typeof SHOTS)[number];

/** The catheter state a slide asks for (the scene's catheter.ts plays it). */
export const CATHS = ['route', 'free', 'wedge', 'result'] as const;
export type CathState = (typeof CATHS)[number];

/** The readings a line or a ladder may name. Each is one engine value (mmHg). */
export const READING_KEYS = ['whvp', 'fhvp', 'hvpg', 'ivc', 'ra', 'pv', 'ppg'] as const;
export type ReadingKey = (typeof READING_KEYS)[number];

/** One piece of an equation under a title: <mi> names a quantity, <mo> an operator. `tone` colours a quantity as the ladder does. */
export interface EqPart { tag: 'mi' | 'mo'; text: string; tone?: 'wedge' | 'free'; /** a subscript (P with portal vein below it) */ sub?: string }

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
}

/** The data card of tiles: which readings, the key ones, and the state the change counts from. The numbers come from the slide's own state in the engine, never from the deck. */
export interface SlideTiles { deck: string; slide: string; keys: string[]; key: string[]; delta: string | boolean | null }

export interface Slide {
  id: string;
  kicker: string;
  title: string;
  /** The teaching line. Markup: {hvpg} a live reading, {hvpg:0} whole, {>=10 mmHg} a cut-off, [label](term) a figure term, **bold**. */
  line: string;
  /** A case opens the slide on its own card first (a beat before the slide). */
  vignette?: string;
  terms?: Record<string, string>;
  eq?: EqPart[];
  /** The ladder (data) card: which readings, which one is the result. Absent: no data card on this slide. */
  ladder?: { rows: ReadingKey[]; result?: 'hvpg' };
  /** The catheter the slide shows; absent when it shows none. */
  cath?: CathState;
  notes: string;
  ask?: [string, string];
  /** A named shot of the slice, or (a ported deck) `scene`. */
  shot?: ShotName;
  scene?: SlideScene;
  tiles?: SlideTiles;
  /** the line under the equation (what its letters stand for) */
  eqLegend?: string;
}

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
}

import { parseToken } from '../ui/text/tokens.ts';

const TOKEN = /\{([^}]*)\}/g;
const CUT_RE = /^(>=|<=|>|<)\s*\d+(\.\d+)?(\s+[A-Za-zµ%/]+)?$/;

/** Every problem found in a deck, as readable sentences; an empty list is a valid deck. */
export function validateDeck(deck: Deck): string[] {
  const bad: string[] = [];
  const text = (v: unknown, where: string) => { if (typeof v !== 'string' || !v.trim()) bad.push(`${where} is empty`); };
  text(deck.id, 'deck id'); text(deck.title, 'deck title'); text(deck.summary, 'deck summary');
  if (!Number.isFinite(deck.minutes) || deck.minutes <= 0) bad.push('deck minutes is not a positive number');
  if (!Array.isArray(deck.objectives) || deck.objectives.length < 2 || deck.objectives.length > 3) bad.push('a deck lists 2 or 3 objectives');
  deck.objectives?.forEach((o, i) => text(o, `objective ${i + 1}`));
  if (!Array.isArray(deck.slides) || !deck.slides.length) bad.push('a deck needs at least one slide');
  if (!Array.isArray(deck.checks) || !deck.checks.length) bad.push('a deck needs a quick check');
  deck.checks?.forEach((c, i) => { if (!Array.isArray(c) || c.length !== 2) bad.push(`check ${i + 1} is not [question, answer]`); else { text(c[0], `check ${i + 1} question`); text(c[1], `check ${i + 1} answer`); } });
  const ids = new Set<string>();
  for (const s of deck.slides ?? []) {
    const at = `slide "${s.id}"`;
    if (ids.has(s.id)) bad.push(`${at} is a second slide with the same id`);
    ids.add(s.id);
    for (const f of ['kicker', 'title', 'line', 'notes'] as const) text(s[f], `${at} ${f}`);
    if (!s.scene && !(SHOTS as readonly string[]).includes(s.shot as string)) bad.push(`${at} names the unknown shot "${s.shot}"`);
    if (s.cath && !(CATHS as readonly string[]).includes(s.cath)) bad.push(`${at} names the unknown catheter state "${s.cath}"`);
    for (const m of (s.line ?? '').matchAll(TOKEN)) {
      const body = m[1].trim();
      if (CUT_RE.test(body)) continue;
      const tk = parseToken(body);
      if (tk.kind === 'literal' && !/[\d%]/.test(tk.text)) bad.push(`${at} line has the token {${body}}, which is no reading or cut-off`);
    }
    if (/\{[^}]*$/.test(s.line ?? '') || /^[^{]*\}/.test(s.line ?? '')) bad.push(`${at} line has an unbalanced brace`);
    for (const r of s.ladder?.rows ?? []) if (!(READING_KEYS as readonly string[]).includes(r)) bad.push(`${at} ladder names the unknown reading "${r}"`);
    if (s.ladder?.result && !s.ladder.rows.includes('whvp')) bad.push(`${at} ladder has a result but no wedged row`);
    if (s.eq && !s.eq.every((p) => (p.tag === 'mi' || p.tag === 'mo') && typeof p.text === 'string' && p.text)) bad.push(`${at} equation has a part that is neither <mi> nor <mo>`);
    if (s.ask && (s.ask.length !== 2 || !s.ask[0] || !s.ask[1])) bad.push(`${at} ask is not [question, answer]`);
  }
  return bad;
}
