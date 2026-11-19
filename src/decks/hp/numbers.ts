// The numbers of a talk: the model each slide stands on, and the words that print them.
//
// The 2D presenter computes a deck's states in one engine 'sequence' off screen: preset → params → settle → actions → days, each slide from the one before
// (worker-core.js). The 3D app runs the SAME engine copy (src/engine/host, the pinned hales-engine), so a number here is the number the 2D app shows
// for the same steps. This file builds those steps from the copied deck exactly as 2D does (decks.js withOverview, tests/deck-states.js stepsOf), reads
// a slide's `{tokens}` (a reading, a reading at another slide, a cut-off, a typed number), and prints a reading as its tile does. It imports no engine:
// tests feed it the host in node, the app feeds it the second engine worker (calc.ts).
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { fmt, NOT_SHOWN } from '../../ui/charts/fmt.ts';
import { bedsideMean } from '../../engine/hales/portal/bedside-mean.js';
import { VALUE_PENDING } from '../../engine/hales/portal/pressure-cuts.js';
import type { CopiedSlide, Json } from './types.ts';

/** The fields of a slide that change the patient (tests/deck-states.js). */
export const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'] as const;
export const changes = (s: CopiedSlide): boolean => MODEL.some((k) => !!s[k]);

/** One step of the engine's 'sequence'. */
export interface Step { preset?: string; presetDays?: number; params?: unknown; action?: unknown; days?: number; relax?: number; ramp?: unknown; fine?: boolean }
const nz = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function stepOf(s: CopiedSlide): Step {
  if (!changes(s)) return {};
  const st: Step = { preset: nz(s.preset) as string | undefined, presetDays: nz(s.presetDays), params: nz(s.params), action: nz(s.action), days: nz(s.days), relax: nz(s.relax), ramp: nz(s.ramp), fine: !!s.lapse };
  return JSON.parse(JSON.stringify(st)) as Step;
}

/** The chain the 2D presenter runs for a deck: the outline slide first (it takes the first slide's patient, and the first slide then keeps it, unless that
 *  slide is a time-lapse or opens with a case), then every slide. `chain[i + 1]` is slide i's step. */
export function chainOf(slides: readonly CopiedSlide[]): Step[] {
  const [first, ...rest] = slides;
  if (!first) return [];
  const keep = !first.lapse && !first.ramp;
  const outline: CopiedSlide = { id: 'outline', kicker: '', title: '', line: '', notes: '', ask: ['', ''] };
  if (keep) for (const k of MODEL) if (first[k] !== undefined && first[k] !== null) (outline as Record<string, Json | undefined>)[k] = first[k];
  const firstNow: CopiedSlide = keep && !first.vignette ? Object.fromEntries(Object.entries(first).filter(([k]) => !(MODEL as readonly string[]).includes(k))) as CopiedSlide : first;
  return [outline, firstNow, ...rest].map(stepOf);
}

/** What the engine says of a slide: the reading of every tile (the fingerprint), the whole model to show the figure, and the parameters. */
export interface StepResult { fp: Fp; snap: unknown; params: unknown }
export type Fp = Readonly<Record<string, number | boolean | null | undefined | number[]>>;

/** Collects the worker's answers to one 'sequence' request: a 'seqStep' per step as it is ready, then 'sequence'. Feed it every message of the engine. */
export function sequencer(reqId = 1) {
  const results: StepResult[] = [];
  const waiting = new Map<number, ((r: StepResult) => void)[]>();
  let finish!: () => void, fail!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => { finish = res; fail = rej; });
  return {
    results, done,
    message(m: { type: string; reqId?: number; i?: number; fp?: Fp; snap?: unknown; params?: unknown; message?: string }) {
      if (m.reqId !== reqId && m.type !== 'crash') return;
      if (m.type === 'seqStep') {
        const r: StepResult = { fp: m.fp ?? {}, snap: m.snap, params: m.params };
        results[m.i!] = r;
        for (const w of waiting.get(m.i!) ?? []) w(r);
        waiting.delete(m.i!);
      } else if (m.type === 'sequence') finish();
      else if (m.type === 'error' || m.type === 'crash') fail(new Error(m.message ?? 'the engine failed'));
    },
    /** The result of step i, now or when it arrives. */
    at(i: number): Promise<StepResult> { const r = results[i]; return r ? Promise.resolve(r) : new Promise((res) => { (waiting.get(i) ?? waiting.set(i, []).get(i)!).push(res); }); },
  };
}

// ── printing a reading ──
/** A reading as 2D prints it in words (callout-math.js valueText): to its tile's decimals, with its unit; a whole number when asked; "…" while unknown. */
const bp = (sbp: number, dbp: number, map: number) => {
  const r = (v: number) => String(Math.round(v));
  if (!Number.isFinite(map)) return NOT_SHOWN;
  return Number.isFinite(sbp) && Number.isFinite(dbp) ? `${r(sbp)}/${r(dbp)} (${r(bedsideMean(Math.round(sbp), Math.round(dbp)))})` : `MAP ${r(map)}`;
};
export function valueText(key: string, fp: Fp | null | undefined, whole = false): string {
  const T = TILE[key], v = fp?.[key];
  if (!T || typeof v !== 'number' || !Number.isFinite(v)) return VALUE_PENDING;
  if (key === 'plt') return `${(Math.round(v) * 1000).toLocaleString('en-US')}/µL`;
  if (key === 'map') return `${bp(fp!.sbp as number, fp!.dbp as number, v)} ${T.u}`;
  return `${fmt(v * (T.x ?? 1), whole ? 0 : T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;
}

// ── the tokens of a line ──
export type Token =
  | { kind: 'value'; key: string; whole: boolean; at: string | null }
  | { kind: 'cut'; text: string }
  | { kind: 'literal'; text: string }
  | { kind: 'step'; n: number };

/** A cut-off keeps its sign: "≥10 mmHg" (table-marks.js cutText). */
export const cutText = (c: string) => c.replace(/^>=\s*/, '≥').replace(/^<=\s*/, '≤').replace(/^([<>≥≤])\s+/, '$1');

/** What the inside of one pair of braces is, in the 2D order: a step marker, a reading, a reading whole, a reading at another slide, a cut-off, a typed number. */
export function parseToken(body: string): Token {
  let m: RegExpExecArray | null;
  if ((m = /^#(\d+)$/.exec(body))) return { kind: 'step', n: Number(m[1]) };
  if (TILE[body]) return { kind: 'value', key: body, whole: false, at: null };
  if ((m = /^(\w+):0$/.exec(body)) && TILE[m[1]!]) return { kind: 'value', key: m[1]!, whole: true, at: null };
  if ((m = /^(\w+)@([\w-]+)$/.exec(body)) && TILE[m[1]!]) return { kind: 'value', key: m[1]!, whole: false, at: m[2]! };
  if (/^[<>≥≤]=?/.test(body)) return { kind: 'cut', text: cutText(body) };
  return { kind: 'literal', text: body };
}

/** Every `{…}` of a text, in order. */
export function tokensOf(text: string): { raw: string; token: Token }[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => ({ raw: m[0], token: parseToken(m[1]!) }));
}

/** A text with its braces filled in as the 2D card prints them: plain text, for the accessible name, the handout and the number test. `fpAt(id)` gives another slide's fingerprint. */
export function plainText(text: string, fp: Fp | null, fpAt: (id: string) => Fp | null = () => null): string {
  return text.replace(/\{([^}]+)\}/g, (_, body: string) => {
    const t = parseToken(body);
    switch (t.kind) {
      case 'value': return valueText(t.key, t.at ? fpAt(t.at) : fp, t.whole);
      case 'cut': return t.text;
      case 'literal': return t.text;
      case 'step': return String(t.n);
    }
  });
}
