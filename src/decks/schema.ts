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
export interface EqPart { tag: 'mi' | 'mo'; text: string; tone?: 'wedge' | 'free' }

/** A slide's patient: the preset to load and the parameter changes over it (the engine's own shape), as the 2D deck's `preset` and `params`. */
export interface SlideModel { preset: string; params?: unknown; days?: number }

/** A summary table over the figure's data card (the 2D `visual: 'table'`): one row per patient (a slide's state, by id, or a patient of its own), one column per reading. */
export interface TableRowSpec {
  /** a slide of this deck: the row is the patient the slide stands on */
  id?: string;
  /** a patient of its own (a row no slide shows): its preset and parameter changes */
  preset?: string; params?: unknown; days?: number;
  title?: string; kicker?: string; site?: string; key?: string;
  /** the row's arrows compare with this slide id (or this row's key) instead of the first row */
  vs?: string;
  /** the reference row: keeps its numbers, the anchor for the arrows */
  ref?: boolean;
  blank?: string[]; miss?: string[]; missPart?: string[]; calm?: string[];
  note?: string | string[];
}
export interface TableSpec {
  /** the readings, as tile keys; the 2D default is PV, WHVP, FHVP, IVC, RA, HVPG, PPG with the ascites pair */
  cols?: string[];
  of: (string | TableRowSpec)[];
  /** the arrows compare each row with the first ('first') */
  vs?: string;
  asc?: boolean; rowHead?: string; foot?: string; note?: string | string[]; calm?: string[]; focusRow?: string;
}

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
  /** The catheter state the slide asks for; a slide with no catheter (most talks' slides) leaves it out. */
  cath?: CathState;
  /** The patient the slide stands on (a 2D preset id with its parameter changes): the model takes it when the slide is shown. A slide without one keeps the patient it is on. */
  model?: SlideModel;
  /** A summary table in the data card's place. */
  table?: TableSpec;
  notes: string;
  ask?: [string, string];
  shot: ShotName;
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
  /** The outline's own sections, [name, [the kickers or slide ids each holds]] (a deck whose kicker groups are not three to five sets them). */
  sections?: [string, string[]][];
  /** The name in the tab at each card's top right (the 2D menu's short name); a deck without one shows its title when that is 24 characters or fewer. */
  head?: string;
  /** A deck built from a script, or imported, that lives on this device (the Present menu's "Your scripts"). */
  mine?: boolean;
}

const TOKEN = /\{([^}]*)\}/g;
const KEY_RE = /^([a-z]+)(?::(\d))?$/;
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
    if (!(SHOTS as readonly string[]).includes(s.shot)) bad.push(`${at} names the unknown shot "${s.shot}"`);
    if (s.cath !== undefined && !(CATHS as readonly string[]).includes(s.cath)) bad.push(`${at} names the unknown catheter state "${s.cath}"`);
    for (const m of (s.line ?? '').matchAll(TOKEN)) {
      const body = m[1].trim();
      if (CUT_RE.test(body)) continue;
      const k = KEY_RE.exec(body);
      if (!k || !(READING_KEYS as readonly string[]).includes(k[1])) bad.push(`${at} line has the token {${body}}, which is no reading or cut-off`);
    }
    if (/\{[^}]*$/.test(s.line ?? '') || /^[^{]*\}/.test(s.line ?? '')) bad.push(`${at} line has an unbalanced brace`);
    for (const r of s.ladder?.rows ?? []) if (!(READING_KEYS as readonly string[]).includes(r)) bad.push(`${at} ladder names the unknown reading "${r}"`);
    if (s.ladder?.result && !s.ladder.rows.includes('whvp')) bad.push(`${at} ladder has a result but no wedged row`);
    if (s.eq && !s.eq.every((p) => (p.tag === 'mi' || p.tag === 'mo') && typeof p.text === 'string' && p.text)) bad.push(`${at} equation has a part that is neither <mi> nor <mo>`);
    if (s.ask && (s.ask.length !== 2 || !s.ask[0] || !s.ask[1])) bad.push(`${at} ask is not [question, answer]`);
  }
  return bad;
}
