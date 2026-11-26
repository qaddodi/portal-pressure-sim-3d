// Every live control on every slide must DO something the viewer can see (Mohammad, 26 Nov, Landmark trials 3: "Those buttons change nothing. What's the point?"). Shared by the
// tests/controls-effect-*.test.ts files, each a share of the decks (one file would run for minutes). On the engine host in node, no browser:
//   a compare button that moves the model (a treatment, a responder, a patient, another slide's state) is pressed as the app presses it (ui/talk/variant-state.ts, with the replay a slide that
//     lives days needs), and the state it gives must print a different number on the slide (its words, its tiles, its instrument's readings) than the slide's own; an instrument that draws
//     the model's flows and pressures (a Doppler, a flow chart, a profile) may show it in the flows instead;
//   a what-if slider must do the same at one end of its range at least;
//   a lens row must switch between real lenses, and an instrument row (a Doppler gate, a scope option) between different settings.
// A button whose effect is only drawn on the figure (the fenestrae opening, the jet's place along the stent) names the parameter the figure draws in FIGURE_ONLY, and that parameter must change.
// PENDING lists the controls known to show nothing yet, each with what it waits on; one that starts working must be taken off the list.
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, stepOf, type StepResult } from '../src/decks/hp/numbers.ts';
import { loadSource } from '../src/decks/source.ts';
import { controlsOf, type CompareOpt } from '../src/decks/controls.ts';
import { variantStateOf, sliderOpt, replayOf, type Seq, type Replay } from '../src/ui/talk/variant-state.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { valueText, tokensOf } from '../src/ui/text/tokens.ts';
import { tilesAt } from '../src/ui/cards/tiles-2d.ts';
import { LENS_IDS } from '../src/scene/lenses/model.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

type Fp = Record<string, unknown> & { at?: { P?: ArrayLike<number>; Q?: ArrayLike<number> } };

/** Buttons and sliders whose whole effect is drawn on the figure, not printed: `deck/slide` → the parameter path the figure draws. */
export const FIGURE_ONLY: Readonly<Record<string, { path: string; why: string }>> = {
  'lobule/cirr': { path: 'fenestrae', why: 'the sinusoid view opens the lining\'s pores (scene/sinusoid/view.ts porosity); the pressure does not move' },
  'tips-doppler/narrow': { path: 'stenosisSite', why: 'the narrowing moves along the stent, so the Doppler\'s jet moves with it; the gradient is the same' },
  'tips-complete/jet': { path: 'stenosisSite', why: 'the narrowing moves along the stent, so the Doppler\'s jet moves with it; the gradient is the same' },
};
/** Controls known to show nothing yet: `deck/slide/label` → what they wait on. */
export const PENDING: Readonly<Record<string, string>> = {
  'gastric-varices/splenectomy/Partial embolization': 'the infarct takes weeks (engine SPLEEN_INFARCT, tau 14 days) and the slide lives no days: how long after embolization to show is a clinical choice asked of Mohammad',
};

/** The instruments that draw the model's flows and pressures beyond the numbers the slide prints. */
const DRAWS_FLOWS = new Set(['doppler', 'flows', 'profile', 'curve', 'flowtime', 'shift', 'trace', 'fluid', 'stent', 'abdomen']);

const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown; snap?: unknown; params?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};

const valueAtPath = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
/** The flows or pressures moved by more than 1 % somewhere. */
function flowsMoved(a: Fp | undefined, b: Fp | undefined): boolean {
  for (const k of ['Q', 'P'] as const) {
    const x = a?.at?.[k], y = b?.at?.[k];
    if (!x || !y) continue;
    for (let j = 0; j < x.length; j++) if (Math.abs(x[j]! - y[j]!) > 0.01 * Math.max(Math.abs(x[j]!), Math.abs(y[j]!), 1e-3)) return true;
  }
  return false;
}

export interface Seen { where: string; what: string }

/** Check every control of every slide of these decks; returns what each control was seen to do (for a report). */
export async function checkDecks(ids: readonly string[]): Promise<Seen[]> {
  const seen: Seen[] = [], fails: string[] = [], pendingHit = new Set<string>();
  for (const id of ids) {
    const d = await loadSource(id);
    const slides = d.slides as CopiedSlide[];
    const last = slides.reduce((m, s, i) => (controlsOf(s) ? i : m), -1);
    if (last < 0) continue;
    const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, last + 1)), reqId: 1 });
    core.dispose();
    const res = (seq.results as StepResult[]).slice(1);
    for (const [i, s] of slides.entries()) {
      const c = controlsOf(s);
      if (!c || !(c.compare || c.whatIf)) continue;
      const where = `${id}/${s.id}`, own = res[i]!, ownFp = own.fp as Fp;
      const tool = (s.tool as { kind?: string } | undefined)?.kind ?? '';
      const t = tilesAt(slides, res as never, i, false);
      const lineKeys = tokensOf(String(s.line ?? '')).flatMap(({ token }) => (token.kind === 'value' && !(token as { at?: string }).at ? [(token as { key: string }).key] : []));
      const inst = tool === 'hvpg' ? ['whvp', 'fhvp', 'hvpg'] : tool === 'fibroscan' ? ['lsm', 'ssm'] : [];
      const keys = [...new Set([...lineKeys, ...((s.tiles as string[] | undefined) ?? []), ...((s.key as string[] | undefined) ?? []), ...(t?.keys ?? []), ...(t?.head ?? []), ...inst])].filter((k) => k in TILE);
      const printed = (fp: Fp) => keys.filter((k) => valueText(k, fp as never) !== valueText(k, ownFp as never)).map((k) => `${k} ${valueText(k, ownFp as never)} → ${valueText(k, fp as never)}`);
      const judge = (label: string, fp: Fp | undefined, params: unknown): void => {
        const at = `${where}/${label}`;
        if (!fp) { fails.push(`${at}: no state came back`); return; }
        const p = printed(fp);
        if (p.length) { seen.push({ where: at, what: p.join(', ') }); if (PENDING[at]) pendingHit.add(at); return; }
        if (DRAWS_FLOWS.has(tool) && flowsMoved(fp, ownFp)) { seen.push({ where: at, what: `the ${tool} moves (flows)` }); if (PENDING[at]) pendingHit.add(at); return; }
        const fig = FIGURE_ONLY[where];
        if (fig && JSON.stringify(valueAtPath(params, fig.path)) !== JSON.stringify(valueAtPath(own.params, fig.path))) { seen.push({ where: at, what: `figure: ${fig.path}` }); return; }
        if (PENDING[at]) { seen.push({ where: at, what: `PENDING: ${PENDING[at]}` }); return; }
        fails.push(`${at}: changes nothing the slide shows (it prints ${keys.join(', ') || 'no readings'}${tool ? `, its ${tool} card` : ''})`);
      };
      if (c.compare) {
        const opts = c.compare.opts;
        const lens = opts.filter((o) => o.how === 'lens'), instr = opts.filter((o) => o.gate || o.tool);
        if (lens.length) {
          for (const o of lens) if (!o.own || o.lens) assert.ok((LENS_IDS as readonly string[]).includes(o.lens ?? ''), `${where}/${o.label}: "${o.lens}" is not a lens`);
          assert.ok(new Set(lens.map((o) => o.lens ?? 'own')).size >= 2, `${where}: the lens buttons all show one lens`);
          seen.push({ where, what: `lens: ${lens.map((o) => o.lens).join(' / ')}` });
        }
        if (instr.length) {
          assert.ok(new Set(instr.map((o) => JSON.stringify([o.gate ?? null, o.tool ?? null]))).size >= 2, `${where}: the instrument buttons all set one thing`);
          seen.push({ where, what: `instrument: ${instr.map((o) => o.gate ?? JSON.stringify(o.tool)).join(' / ')}` });
        }
        const stepI = stepOf(s) as Replay['step'];
        const replay = i > 0 ? replayOf(stepI, res[i - 1]) : undefined;
        for (const o of opts.filter((x: CompareOpt) => x.how !== 'lens' && !x.gate && !x.tool && !x.own)) {
          const j = o.slide ? slides.findIndex((x) => x.id === o.slide) : i;
          const got = await variantStateOf(nodeSeq, new Map(), { slideKey: where, ...(replay && o.how === 'params' ? { replay } : {}) }, o, own, res[j]);
          judge(o.label, got?.state?.fp as Fp | undefined, got?.state?.params);
        }
      }
      if (c.whatIf && !c.whatIf.tool) {
        const w = c.whatIf, ends: { x: number; fp?: Fp; params?: unknown }[] = [];
        for (const x of [w.min, w.max]) {
          const got = await variantStateOf(nodeSeq, new Map(), { slideKey: where }, sliderOpt(w.paths, x), own, undefined);
          ends.push({ x, fp: got?.state?.fp as Fp | undefined, params: got?.state?.params });
        }
        // (one end is often the slide's own value: the slider has to move something at the other)
        const moved = ends.filter((e) => e.fp && (printed(e.fp).length || (DRAWS_FLOWS.has(tool) && flowsMoved(e.fp, ownFp))));
        if (moved.length) seen.push({ where: `${where}/what if ${w.label}`, what: moved.map((e) => `${e.x}: ${printed(e.fp!).join(', ') || `the ${tool} moves`}`).join('; ') });
        else fails.push(`${where}/what if ${w.label}: neither end of the slider changes anything the slide shows`);
      } else if (c.whatIf?.tool) seen.push({ where: `${where}/what if ${c.whatIf.label}`, what: `instrument option ${c.whatIf.tool} ${c.whatIf.min}..${c.whatIf.max}` });
    }
  }
  for (const k of Object.keys(PENDING)) if (pendingHit.has(k)) fails.push(`${k}: now shows a change; take it off PENDING`);
  assert.deepEqual(fails, [], fails.join('\n'));
  return seen;
}

/** The decks that have live controls, in shares of about equal time (tests/controls-effect-*.test.ts). */
export const SHARES: readonly (readonly string[])[] = [
  ['carvedilol', 'albumin', 'endoscopy', 'ncph'],
  ['ten-years'],
  ['tips-complete', 'lobule'],
  ['cause-treated', 'tips-candidacy', 'budd-chiari', 'varices'],
  ['shunts', 'stiffness', 'ascites', 'hyperdynamic', 'tipping'],
  ['prehepatic', 'landmark-trials', 'sites', 'two-lesions'],
  ['where-resistance', 'treatment', 'circuit', 'gastric-varices'],
  ['meso-rex', 'tips-doppler', 'day', 'pregnancy', 'two-inflows'],
  ['encephalopathy', 'kidney', 'outflow'],
];
