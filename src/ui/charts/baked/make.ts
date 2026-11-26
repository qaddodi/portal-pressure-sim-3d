// Works out every deck's chart data in node, with the code the page runs (the engine core on this thread: what the worker runs; the same data functions with a node `run`), so a baked number is the live number.
// Used by scripts/bake-charts.mjs at build time and by the tests. Pure of the page: no store, no worker, no timing.
import { createCore } from '../../../engine/hales/host/worker-core.js';
import { chainOf, sequencer, type StepResult } from '../../../decks/hp/numbers.ts';
import { SOURCE_IDS, loadSource } from '../../../decks/source.ts';
import type { CopiedDeck, CopiedSlide } from '../../../decks/hp/types.ts';
import { curveWork, courseWork, curveKey, type RunFn, type SlideState } from '../curve/data.ts';
import { stepsOf as cohortStepsOf, hasCohort } from '../small/data.ts';
import { seriesOf } from '../small/model.ts';
import { extraSteps } from '../ladder/data.ts';
import { rowsOf } from '../ladder/model.ts';
import { patientKey, planeRows, type PatientSpec } from '../plane/data.ts';
import { deckSig, engineKey, BAKE_VERSION } from './key.ts';
import { WAVE_SECS, packTrace, waveVessel, type Trace } from '../../talk/table-wave.ts';
import type { BakedDeck, BakedState } from './store.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The engine's 'sequence' on this thread (the client's, in node): each step's seqStep, from `base` when one is given. One core, kept for the whole bake. */
export function nodeEngine() {
  let id = 1;
  const core = createCore((m: Any) => { const w = waiting.get(m.reqId); if (w && m.type === 'seqStep') w[m.i] = m; });
  const waiting = new Map<number, Any[]>();
  core.handle({ type: 'run', running: false });
  return {
    async sequence(steps: unknown[], base?: unknown): Promise<Any[]> {
      const reqId = id++, got: Any[] = [];
      waiting.set(reqId, got);
      await core.handle({ type: 'sequence', steps, base, reqId });
      waiting.delete(reqId);
      return got;
    },
    dispose() { core.dispose(); },
  };
}

/** Every built-in deck as the app plays it (the copy with the 3D overlay on: source.ts), so a baked chart is made from the very slides the page loads (the file is matched by a signature of them). */
export async function allCopiedDecks(): Promise<CopiedDeck[]> {
  return Promise.all(SOURCE_IDS.map((id) => loadSource(id)));
}

const light = (st: StepResult | undefined): BakedState | null => (st ? { fp: st.fp as BakedState['fp'], params: st.params, trail: st.trail, start: st.start, before: st.before } : null);
const toolOf = (s: CopiedSlide) => ((s as Any).tool ?? {}) as Record<string, Any>;

/** One deck's states and charts. `patients` collects the patients no slide shows (the plane's rows). */
export async function bakeDeck(deck: CopiedDeck, eng: ReturnType<typeof nodeEngine>, healthy: BakedDeck['healthy']): Promise<BakedDeck> {
  const seq = sequencer(1), steps = chainOf(deck.slides);
  const out: (StepResult | undefined)[] = [];
  const core = createCore((m: Any) => { seq.message(m); if (m.type === 'seqStep' && m.i >= 1) out[m.i - 1] = seq.results[m.i]; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  await seq.done;
  const states = out.map(light);
  const patients: BakedDeck['patients'] = {};
  const b: BakedDeck = { v: BAKE_VERSION, key: engineKey(), sig: deckSig(deck), states, curves: {}, cohort: {}, ladders: {}, tables: {}, waves: {}, healthy, patients };
  const run = (slide: SlideState): RunFn => (st, from) => eng.sequence(st, from === undefined ? slide.base ?? slide.snap ?? undefined : from ?? undefined).then((r) => r ?? null, () => null);
  const fpOf = (id: string) => (out[deck.slides.findIndex((x) => x.id === id)]?.fp ?? null) as Any;
  const fpsLike = out.map((r) => (r?.fp ?? {}) as Any);

  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i]!, tool = toolOf(s), r = out[i];
    const id = `${deck.id}/${s.id}`;
    if (tool.kind === 'curve' && r?.fp) {
      const slide: SlideState = { fp: r.fp as Any, params: r.params, base: r.base, snap: r.snap };
      const w = await curveWork(tool as Any, slide, run(slide), fpOf);
      if (w) b.curves[curveKey(tool, id)] = w;
    } else if (tool.kind === 'course') {
      const slide: SlideState | null = r?.fp ? { fp: r.fp as Any, params: r.params, base: r.base, snap: r.snap } : null;
      const w = await courseWork(tool, run(slide ?? { fp: {} }));
      if (w) b.curves[curveKey(tool, id)] = w;
    }
    if ((s as Any).visual === 'allpatients' && hasCohort(s)) {
      const made = cohortStepsOf(s, deck as Any);
      if (made) { const outs = await eng.sequence(made.steps); const ser = seriesOf(s, deck as Any, outs); if (ser) b.cohort[s.id] = ser; }
    }
    if ((s as Any).visual === 'ladders') {
      const of = ((s as Any).of ?? []) as Any[];
      const ex = await eng.sequence(extraSteps(of));
      b.ladders[s.id] = { rows: rowsOf(of, deck.slides as Any, [fpsLike[0], ...fpsLike], ex.slice(1).map((x) => x?.fp)), healthy: ex[0]?.fp ?? null };
    }
    if ((s as Any).visual === 'table' && Array.isArray((s as Any).of)) {
      const specs = (s as Any).of as Any[];
      const own = specs.map((sp, j) => ({ sp, j })).filter(({ sp }) => typeof sp !== 'string' && !sp.id && sp.preset);
      const mine = own.length ? await eng.sequence(own.map(({ sp }) => ({ preset: sp.preset, ...(sp.params ? { params: sp.params } : {}), ...(sp.days != null ? { presetDays: sp.days } : {}) }))) : [];
      b.tables[s.id] = specs.map((_, j) => { const m = own.findIndex((o) => o.j === j); return m >= 0 ? (mine[m]?.fp ?? null) : null; });
      if (((s as Any).cols as string[] | undefined)?.includes('wave')) {
        // (the Doppler column: each row's state, its vessel's velocity over WAVE_SECS, worked out here once so the card draws it in its first frame)
        b.waves[s.id] = [];
        for (let j = 0; j < specs.length; j++) {
          const sp = specs[j], id = typeof sp === 'string' ? sp : sp.id, at = id ? deck.slides.findIndex((x) => x.id === id) : -1, m = own.findIndex((o) => o.j === j);
          const snap = id ? out[at]?.snap : (mine[m] as Any)?.snap;
          const vessel = waveVessel(typeof sp === 'string' ? null : sp, s as Any);
          const w = snap ? (await eng.sequence([{ wave: { vessel, secs: WAVE_SECS } }], snap))[0]?.extra?.wave?.[vessel] as Trace | undefined : undefined;
          b.waves[s.id]!.push(w ? packTrace(w) : null);
        }
      }
    }
    if ((s as Any).visual === 'plane' || tool.kind === 'plane') {
      const rows = planeRows(((s as Any).of ?? tool.of) as Any, deck.slides as Any);
      for (const x of rows.flatMap((q) => [q.x, ...(q.fx ? [q.fx] : [])]).filter((q) => !q.id && q.preset)) {
        const k = patientKey(x);
        if (k in patients) continue;
        const o = x as PatientSpec;
        patients[k] = (await eng.sequence([{ preset: o.preset, params: o.params, days: o.days, presetDays: o.presetDays }]))[0]?.fp ?? null;
      }
    }
  }
  return b;
}

/** Every deck's file (a test, or one thread of the script). `only`: deck ids. */
export async function bakeDecks(only?: readonly string[], on?: (d: CopiedDeck, b: BakedDeck) => void): Promise<Record<string, BakedDeck>> {
  const eng = nodeEngine(), out: Record<string, BakedDeck> = {};
  const healthy = ((await eng.sequence([{ preset: 'healthy' }]))[0]?.fp ?? null) as BakedDeck['healthy'];
  for (const d of await allCopiedDecks()) {
    if (only && !only.includes(d.id)) continue;
    out[d.id] = await bakeDeck(d, eng, healthy);
    on?.(d, out[d.id]!);
  }
  eng.dispose();
  return out;
}

/** The file's text: numbers to 8 significant digits (the engine's own are 17: nothing a chart or a tile prints reads past the 5th). */
export const encodeDeck = (b: BakedDeck): string => JSON.stringify(b, (_k, v) => (typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(8)) : v));
