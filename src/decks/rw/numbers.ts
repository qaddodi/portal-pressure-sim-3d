// A slide's numbers: the model state each slide sets (the 2D presenter's step chain, exactly), and the words' {tokens} read from that state.
// Deck-agnostic: any 2D deck (copied/*.ts) goes in. Numbers come from the engine, never typed: this file only decides WHICH state a slide is in and how a
// reading is printed; the engine (src/engine/hales/host, the host's `sequence`) computes it. The state of slide i is its own when it changes the model, else the last one that did.
import { fmt, NOT_SHOWN } from '../../ui/charts/fmt.ts';
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { bedsideMean } from '../../engine/hales/portal/bedside-mean.js';
import type { CopiedDeck, CopiedSlide } from './types.ts';

/** One step of the host's `sequence` chain (src/engine/hales/host/worker-core.js): preset → params → settle → actions → days. */
export interface Step { preset?: string; presetDays?: number; params?: unknown; action?: unknown; days?: number; relax?: number; ramp?: unknown; fine?: boolean }
/** The numbers of one state: the engine's fingerprint (the tiles' keys: hvpg, ppg, pv, spleen, plt, lsm …, engine units). */
export type Fingerprint = Readonly<Record<string, number | null | undefined>> & { sbp?: number; dbp?: number };
/** Runs steps through the engine's `sequence` and gives one fingerprint per step. Node: numbers-node.ts. The page: the presenter's runner on the worker. */
export type RunSteps = (steps: Step[]) => Promise<Fingerprint[]>;

export const MODEL_FIELDS = ['preset', 'presetDays', 'params', 'action', 'days'] as const;
/** Does this slide change the model? (2D deck-states.js `changes`.) */
export const changes = (s: CopiedSlide): boolean => MODEL_FIELDS.some((k) => !!s[k]);
const stepOf = (s: CopiedSlide): Step => (changes(s)
  ? { preset: s.preset as string | undefined, presetDays: s.presetDays as number | undefined, params: s.params, action: s.action, days: s.days as number | undefined, relax: s.relax as number | undefined, ramp: s.ramp, fine: !!s.lapse }
  : {});

/**
 * The slides as the 2D presenter shows them (decks.js withOverview): the outline slide comes first and takes the first slide's model fields, which the
 * first slide then keeps (so the figure does not change between them) unless it is a time-lapse; a first slide that opens with a case loads its patient afresh.
 * Entry 0 is the outline, entry i + 1 is deck slide i; the quick check that follows is not listed (it keeps the last slide's state).
 */
export function shownSlides(deck: CopiedDeck): CopiedSlide[] {
  const [first, ...rest] = deck.slides;
  if (!first) return [];
  const keep = !first.lapse && !first.ramp;
  const outline: CopiedSlide = { id: 'outline' };
  if (keep) for (const k of MODEL_FIELDS) if (first[k] !== undefined) (outline as Record<string, unknown>)[k] = first[k];
  const firstNow: CopiedSlide = keep && !first.vignette ? Object.fromEntries(Object.entries(first).filter(([k]) => !(MODEL_FIELDS as readonly string[]).includes(k))) as CopiedSlide : first;
  return [outline, firstNow, ...rest];
}

/** The steps the engine runs for a deck, one per shown slide. */
export const stepsOf = (deck: CopiedDeck): Step[] => shownSlides(deck).map(stepOf);

/**
 * The fingerprint of every shown slide: index 0 the outline, i + 1 deck slide i, and one more at the end for the quick check (the last slide's state).
 * A slide that does not change the model reads the last one that did (2D tests/deck-states.js).
 */
export async function deckFingerprints(deck: CopiedDeck, run: RunSteps): Promise<Fingerprint[]> {
  const shown = shownSlides(deck);
  const fps = await run(shown.map(stepOf));
  let last = fps[0]!;
  const out = shown.map((s, i) => (last = i === 0 || changes(s) ? fps[i]! : last));
  out.push(last);
  return out;
}

// ── tokens ──
export type Piece =
  | { t: 'text'; text: string }
  | { t: 'value'; key: string; decimals: number | null; at?: string }
  | { t: 'cutoff'; text: string }
  | { t: 'literal'; text: string }
  | { t: 'step'; n: number }
  | { t: 'term'; label: string; term: string };

const RE = /\[([^\]]+)\]\(([\w:]+)\)|\{([^}]+)\}/g;
const SYMBOL: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '≥': '≥', '≤': '≤' };
const CUT = /^(>=|<=|≥|≤|>|<)\s*(\d+(?:\.\d+)?)(\s+\S+)?$/;
const WHOLE = /^(\w+):0$/, AT = /^(\w+)@([\w-]+)$/, STEP = /^#(\d+)$/;

/** A cut-off as the words write it: a comparison is always a symbol ("{>=10 mmHg}" reads "≥10 mmHg"). */
export function cutoffText(body: string): string | null {
  const m = CUT.exec(body.trim());
  return m ? `${SYMBOL[m[1]!]}${m[2]}${m[3] ?? ''}` : null;
}

/** A 2D line or check text as pieces: [label](term) a term that points at the figure; {key} a live value, {key:0} a whole number, {key@slide} the value at another slide of the deck;
 *  {>=10 mmHg} a cut-off; {#2} a figure step marker; any other {text} a typed number from the literature (outlined, never the patient's). */
export function parseWords(line: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  const text = (s: string) => { if (s) out.push({ t: 'text', text: s }); };
  for (const m of line.matchAll(RE)) {
    text(line.slice(at, m.index));
    at = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) { out.push({ t: 'term', label: m[1], term: m[2]! }); continue; }
    const body = m[3]!.trim();
    let k: RegExpExecArray | null;
    if ((k = STEP.exec(body))) out.push({ t: 'step', n: Number(k[1]) });
    else if (TILE[body]) out.push({ t: 'value', key: body, decimals: null });
    // ({key:0} asks for a whole number only where the tile prints one: a pressure is one number at one decimal on a slide, in its words as on its chart, tests/one-number.test.ts)
    else if ((k = WHOLE.exec(body)) && TILE[k[1]!]) out.push({ t: 'value', key: k[1]!, decimals: TILE[k[1]!]!.d === 0 ? 0 : null });
    else if ((k = AT.exec(body)) && TILE[k[1]!]) out.push({ t: 'value', key: k[1]!, decimals: null, at: k[2]! });
    else if (cutoffText(body)) out.push({ t: 'cutoff', text: cutoffText(body)! });
    else out.push({ t: 'literal', text: body });
  }
  text(line.slice(at));
  return out;
}

/** Every value token of a text, as { key, at? } (what the numbers must supply). */
export const valueTokens = (pieces: readonly Piece[]) => pieces.filter((p): p is Extract<Piece, { t: 'value' }> => p.t === 'value');

/** A platelet count in running text ("88,000/µL"); the tiles keep their ×10³/µL. */
export const plateletText = (v: number): string => `${(Math.round(v) * 1000).toLocaleString('en-US')}/µL`;
/** The blood pressure as the bedside writes it, "120/80 (93)"; with no systolic or diastolic, "MAP 93". */
export function bpText(sbp: number | null | undefined, dbp: number | null | undefined, map: number): string {
  if (!Number.isFinite(map)) return NOT_SHOWN;
  const r = (v: number) => String(Math.round(v));
  return Number.isFinite(sbp) && Number.isFinite(dbp) ? `${r(sbp!)}/${r(dbp!)} (${r(bedsideMean(Math.round(sbp!), Math.round(dbp!)))})` : `MAP ${r(map)}`;
}

/** The text a reading prints as in running text (the 2D app's valueText): to its tile's decimals (whole: a whole number), with its unit; "…" while unknown. */
export const VALUE_PENDING = '…';
export function valueText(key: string, fp: Fingerprint | null | undefined, whole = false): string {
  const T = TILE[key], v = fp?.[key];
  if (!T || v == null || !Number.isFinite(v)) return VALUE_PENDING;
  if (key === 'plt') return plateletText(v);
  if (key === 'map') return `${bpText(fp?.sbp, fp?.dbp, v)} ${T.u}`;
  return `${fmt(v * (T.x ?? 1), whole ? 0 : T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;
}

/** The words of a text with its values filled in (what a screen reader hears, and what a test compares): `at` finds the fingerprint of another slide by id. */
export function plainText(pieces: readonly Piece[], fp: Fingerprint | null | undefined, at: (id: string) => Fingerprint | null | undefined = () => null): string {
  return pieces.map((p) => {
    switch (p.t) {
      case 'text': return p.text;
      case 'term': return p.label;
      case 'cutoff': return p.text;
      case 'literal': return p.text;
      case 'step': return String(p.n);
      case 'value': return valueText(p.key, p.at ? at(p.at) : fp, p.decimals === 0);
    }
  }).join('');
}
