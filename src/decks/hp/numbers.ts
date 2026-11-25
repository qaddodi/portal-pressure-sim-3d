// The numbers of a talk: the model each slide stands on, and the words that print them.
//
// The 2D presenter computes a deck's states in one engine 'sequence' off screen: preset → params → settle → actions → days, each slide from the one before
// (worker-core.js). The 3D app runs the SAME engine copy (src/engine/hales/host, the pinned hales-engine), so a number here is the number the 2D app shows
// for the same steps. This file builds those steps from the copied deck exactly as 2D does (decks.js withOverview, tests/deck-states.js stepsOf), reads
// a slide's `{tokens}` (a reading, a reading at another slide, a cut-off, a typed number), and prints a reading as its tile does. It imports no engine:
// tests feed it the host in node, the app feeds it the second engine worker (calc.ts).
import { parseToken, type Fp } from '../../ui/text/tokens.ts';
import { trailKeys } from '../../ui/charts/flowtime/model.ts';
import { procKindOf } from '../../ui/charts/evgraph/model.ts';
import { specOf } from '../../scene/procedures/copied/proc-anim.js';
import '../../scene/procedures/instrument-specs.ts';   // (registers EVL, tamponade, DIPS, DSRS and paracentesis in the procedure table)
import type { CopiedSlide, Json } from './types.ts';

/** The fields of a slide that change the patient (tests/deck-states.js). */
export const MODEL = ['preset', 'presetDays', 'params', 'action', 'days', 'sameAs'] as const;
export const changes = (s: CopiedSlide): boolean => MODEL.some((k) => !!s[k]);

/** One step of the engine's 'sequence'. */
export interface Step { preset?: string; presetDays?: number; params?: unknown; action?: unknown; days?: number; relax?: number; ramp?: unknown; fine?: boolean; trail?: true | readonly string[]; before?: unknown; /** this slide shows the settled state of an earlier step of the chain (its index), whatever its own fields say */ restoreStep?: number; sameAs?: string }
const nz = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function stepOf(s: CopiedSlide): Step {
  if (!changes(s)) return {};
  // sameAs: the slide shows another slide's settled state, so the two read one set of numbers (chainOf puts the step's index in)
  if (s.sameAs) return { sameAs: String(s.sameAs) };
  // (presenter.js modelStep: a flow-time chart keeps its lines day by day (trail), a procedure slide keeps the state before the procedure (before))
  const tool = s.tool as { kind?: string; lines?: readonly string[] } | undefined;
  const before = s.procedure ? (specOf(procKindOf(s.procedure as never) ?? '') as { before?: unknown } | null)?.before : undefined;
  const st: Step = { preset: nz(s.preset) as string | undefined, presetDays: nz(s.presetDays), params: nz(s.params), action: nz(s.action), days: nz(s.days), relax: nz(s.relax), ramp: nz(s.ramp), fine: !!s.lapse,
    ...(tool?.kind === 'flowtime' ? { trail: trailKeys(tool) } : {}), ...(before ? { before } : {}) };
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
  const all = [outline, firstNow, ...rest];
  return all.map((sl, i) => { const st = stepOf(sl); if (st.sameAs) { const j = all.findIndex((x) => x.id === st.sameAs); delete st.sameAs; if (j >= 0 && j < i) st.restoreStep = j; } return st; });
}

/** What the engine says of a slide: the reading of every tile (the fingerprint), the whole model to show the figure, and the parameters. */
export interface StepResult { fp: Fp; snap: unknown; params: unknown; base?: unknown; trail?: unknown; start?: unknown; before?: unknown; extra?: unknown }

/** Collects the worker's answers to one 'sequence' request: a 'seqStep' per step as it is ready, then 'sequence'. Feed it every message of the engine. */
export function sequencer(reqId = 1) {
  const results: StepResult[] = [];
  const waiting = new Map<number, ((r: StepResult) => void)[]>();
  let finish!: () => void, fail!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => { finish = res; fail = rej; });
  return {
    results, done,
    message(m: { type: string; reqId?: number; i?: number; fp?: Fp; snap?: unknown; params?: unknown; base?: unknown; trail?: unknown; start?: unknown; before?: unknown; extra?: unknown; message?: string }) {
      if (m.reqId !== reqId && m.type !== 'crash') return;
      if (m.type === 'seqStep') {
        const r: StepResult = { fp: m.fp ?? {}, snap: m.snap, params: m.params, base: m.base, trail: m.trail, start: m.start, before: m.before, extra: m.extra };
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

export { parseToken, plainText, valueText, cutText, tokensOf, VALUE_PENDING, type Fp, type Token } from '../../ui/text/tokens.ts';
