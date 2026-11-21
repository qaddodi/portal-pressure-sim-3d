// ?audit: the walk. Pure of the page (the page hands in `deps`, so a Node test walks a fake app): for each step it marks a start, runs the step, waits until the page is still, reads what the
// sampler, the clock and the DOM saw, and judges it into one row. Judges: judge.ts (layout, fades, frames), the watch rules (flash, pop, size snap, label slide) and the screen's own rules (fit, edge, labels).
import { judgeMotion, type Sample } from '../watch/motion-rules.ts';
import { frameStats, timeline, fadeEpisodes, fadeFindings, stallWindows, layoutFindings, type AuditFinding, type LayoutRead } from './judge.ts';
import { judgeScan } from './scan-judge.ts';
import type { RawScan } from './scan.ts';
import type { AnimRec } from './ledger.ts';
import { memoryClimb } from '../../../clock/render-stats.ts';
import type { SequenceProof } from './sequence.ts';
import { SLOW_BUSY_MS, LOW_FPS, type RowGpu, type AuditRow, type AuditData, type AuditSize, type ConsoleLine, type Coverage } from './report.ts';

/** One move: open a view, a sheet, a patient, a slide, or press Next. It may return the label it learned by doing it (a Next press knows which slide it landed on). */
export interface Step { group: string; id: string; label: string; run(): Promise<string | void> | string | void;
  /** findings the step itself made (the sequential pass's: Next did nothing, Back did not come back); added to its row */
  flags?: AuditFinding[] }
export interface Reads {
  /** the sampler's rows since the mark, `t` in ms from the mark */
  samples: Sample[];
  /** the clock's frame gaps since the mark */
  gaps: number[];
  work: { p95: number; max: number };
  /** each frame the clock drew with a gap over 50 ms: its start (ms from the mark) and the gap */
  stalls?: { t: number; ms: number }[];
  /** the renderer and stall instruments for the step (null: the renderer was not up) */
  gpu?: RowGpu | null;
  layout: LayoutRead | null;
  /** the screen rules' findings for what is standing now */
  problems: { kind: string; text: string; where?: string }[];
  console: ConsoleLine[];
  hidden: boolean;
  /** the generic sweep of the whole page (scan.ts), null when it could not run */
  scan?: RawScan | null;
  /** every CSS animation and transition that ran since the mark, and the snaps the mutation ledger saw */
  anims?: AnimRec[];
  generic?: AuditFinding[];
}
export interface AuditDeps {
  size: AuditSize;
  /** start of a step: clear the sampler, the frame gaps and the clock's stats, remember where the console stood; returns the mark's time */
  mark(): number;
  settle(): Promise<{ settled: boolean; ms: number; why?: string }>;
  read(t0: number): Reads;
  now(): number;
  /** the quiet window settle() waits after the last motion, ms (taken off the step's time) */
  quietMs: number;
}

const FAMILIES = /^(fit|edge|label)/;

/** The step's row, judged. `openMs` is how long the step took to hand back (a Next press is instant; opening a talk is its cover). */
export function judgeStep(step: Step, label: string, r: Reads, busyMs: number, settled: boolean, why = ''): AuditRow {
  const flags: AuditFinding[] = [];
  const tl = timeline(r.samples);
  const fades = fadeEpisodes(r.samples);
  flags.push(...fadeFindings(fades, stallWindows(r.samples, r.stalls)));
  for (const f of judgeMotion({ samples: r.samples, events: [] })) flags.push({ kind: f.rule, sev: 'fail', what: `${f.what}: ${f.where}`, where: f.at });
  if (r.layout) flags.push(...layoutFindings(r.layout));
  // the generic sweep: the same kinds can come from the card reader above (named by card); one line per thing, not two
  const firstQuote = (w: string) => /"([^"]*)"/.exec(w)?.[1] ?? w;
  const fam = (k: string) => (/^(clipped|spill|off-screen)$/.test(k) ? 'edge' : k);   // (a word past its card is one finding whichever reader saw it)
  const have = new Set(flags.map((f) => `${fam(f.kind)}|${firstQuote(f.what)}`));
  if (r.scan) for (const f of judgeScan(r.scan)) if (!have.has(`${fam(f.kind)}|${firstQuote(f.what)}`)) flags.push(f);
  flags.push(...(r.generic ?? []));
  for (const p of r.problems) flags.push({ kind: p.kind, sev: FAMILIES.test(p.kind) ? 'fail' : 'warn', what: p.text, where: p.where ?? '' });
  const fs = frameStats(r.gaps, r.work);
  if (!settled) flags.push({ kind: 'unsettled', sev: 'fail', what: `still moving after ${Math.round(busyMs / 1000)} s (${why || 'the camera, a card or an animation never stopped'})`, where: '' });
  else if (busyMs > SLOW_BUSY_MS) flags.push({ kind: 'slow-load', sev: 'warn', what: `took ${(busyMs / 1000).toFixed(1)} s to settle (limit ${SLOW_BUSY_MS / 1000} s)`, where: '' });
  if (fs.fps != null && fs.frames >= 10 && fs.fps < LOW_FPS) flags.push({ kind: 'low-fps', sev: 'warn', what: `ran at ${fs.fps} fps while moving (under ${LOW_FPS})`, where: `worst gap ${fs.worstGap} ms` });
  const slowest = r.gpu?.slow[0];
  if (fs.stalls > 0) flags.push({ kind: 'stall', sev: 'fail', what: `${fs.stalls} frame gap${fs.stalls === 1 ? '' : 's'} over 50 ms (worst ${fs.worstGap} ms)`, where: slowest ? `slowest frame: work ${slowest.ms} ms, gap ${slowest.gap} ms${slowest.bound ? `, waited on ${slowest.bound}` : ''}, asked by ${slowest.tags.join('/') || '-'}` : '' });
  const g = r.gpu;
  if (g && g.boundGpu >= 5 && g.boundGpu > g.boundCpu && ((fs.fps != null && fs.frames >= 10 && fs.fps < LOW_FPS) || fs.hitches >= 5)) flags.push({ kind: 'gpu-bound', sev: 'warn', what: `${g.boundGpu} of ${g.boundGpu + g.boundCpu} slow frames waited on the GPU or the compositor (long gap after short script work), not on the scripts: the frosted glass or the draw, not the code`, where: `gpu/compositor ${g.boundGpu}, cpu ${g.boundCpu}` });
  if (r.hidden) flags.push({ kind: 'tab-hidden', sev: 'fail', what: 'the tab was in the background during this step: its numbers are not valid', where: '' });
  const ins = fades.filter((f) => f.dir === 'in').map((f) => f.ms), outs = fades.filter((f) => f.dir === 'out').map((f) => f.ms);
  return {
    group: step.group, id: step.id, label, busyMs: Math.round(busyMs), settled, cardsMs: tl.cardEndMs == null ? null : Math.round(tl.cardEndMs),
    fadeIn: ins.length ? Math.round(Math.max(...ins)) : null, fadeOut: outs.length ? Math.round(Math.max(...outs)) : null, frames: fs, flags,
    anims: (r.anims ?? []).slice(0, 60), animN: (r.anims ?? []).length, scan: r.scan?.counts ?? null, gpu: r.gpu ?? null,
  };
}

export async function runAudit(steps: AsyncIterable<Step> | Iterable<Step>, deps: AuditDeps, o: { depth: 'quick' | 'full'; notes?: string[]; coverage?: Coverage[]; shouldStop?: () => boolean; onStep?: (n: number, row: AuditRow) => void; /** every few steps, the data so far: a run that is stopped or killed still exports what it did */ onPartial?: (d: AuditData) => void; sequence?: SequenceProof[] } = { depth: 'full' }): Promise<AuditData> {
  const t00 = deps.now(), rows: AuditRow[] = [], con: ConsoleLine[] = [], notes = o.notes ?? [];
  let stopped = false;
  for await (const step of steps) {
    if (o.shouldStop?.()) { stopped = true; break; }
    const t0 = deps.mark(), s0 = deps.now();
    let label = step.label, failed: string | null = null;
    try { const l = await step.run(); if (l) label = l; } catch (e) { failed = String((e as Error)?.message ?? e); }
    const st = await deps.settle();
    const busy = Math.max(0, deps.now() - s0 - (st.settled ? deps.quietMs : 0));
    const reads = deps.read(t0);
    const row = judgeStep(step, label, reads, busy, st.settled, st.why);
    if (step.flags?.length) row.flags.push(...step.flags);
    if (failed) row.flags.unshift({ kind: 'step-failed', sev: 'fail', what: failed, where: '' });
    rows.push(row); con.push(...reads.console.map((c) => ({ ...c, at: `${c.at}, during ${step.group} > ${label}` })));   // (a console line names the step it came in, so a message from one card's code can be traced)
    o.onStep?.(rows.length, row);
    if (o.onPartial && rows.length % 15 === 0) o.onPartial({ size: deps.size, ms: Math.round(deps.now() - t00), depth: o.depth, stopped: true, rows: rows.slice(), console: con.slice(), notes: notes.slice(), coverage: o.coverage?.map((c) => ({ ...c })), sequence: o.sequence?.map((x) => ({ ...x })) });
  }
  // a leak: geometries or textures still alive at the end well past what the views held once built (a view or card that does not free what it made)
  const climb = memoryClimb(rows.map((r) => r.gpu));
  if (climb && rows.length) rows[rows.length - 1]!.flags.push({ kind: 'gpu-memory-climb', sev: 'fail', what: `the renderer holds +${climb.geometries} geometries and +${climb.textures} textures more than after step ${climb.from + 1}: something is not freed (three's gl.info.memory)`, where: `steps ${climb.from + 1} to ${climb.to + 1}` });
  return { size: deps.size, ms: Math.round(deps.now() - t00), depth: o.depth, stopped, rows, console: con, notes, coverage: o.coverage, sequence: o.sequence };
}
