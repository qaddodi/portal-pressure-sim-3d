// ?audit: the walk. Pure of the page (the page hands in `deps`, so a Node test walks a fake app): for each step it marks a start, runs the step, waits until the page is still, reads what the
// sampler, the clock and the DOM saw, and judges it into one row. Judges: judge.ts (layout, fades, frames), the watch rules (flash, pop, size snap, label slide) and the screen's own rules (fit, edge, labels).
import { judgeMotion, type Sample } from '../watch/motion-rules.ts';
import { frameStats, timeline, fadeEpisodes, fadeFindings, layoutFindings, type AuditFinding, type LayoutRead } from './judge.ts';
import { SLOW_BUSY_MS, LOW_FPS, type AuditRow, type AuditData, type AuditSize, type ConsoleLine } from './report.ts';

/** One move: open a view, a sheet, a patient, a slide, or press Next. It may return the label it learned by doing it (a Next press knows which slide it landed on). */
export interface Step { group: string; id: string; label: string; run(): Promise<string | void> | string | void }
export interface Reads {
  /** the sampler's rows since the mark, `t` in ms from the mark */
  samples: Sample[];
  /** the clock's frame gaps since the mark */
  gaps: number[];
  work: { p95: number; max: number };
  layout: LayoutRead | null;
  /** the screen rules' findings for what is standing now */
  problems: { kind: string; text: string; where?: string }[];
  console: ConsoleLine[];
  hidden: boolean;
}
export interface AuditDeps {
  size: AuditSize;
  /** start of a step: clear the sampler, the frame gaps and the clock's stats, remember where the console stood; returns the mark's time */
  mark(): number;
  settle(): Promise<{ settled: boolean; ms: number }>;
  read(t0: number): Reads;
  now(): number;
  /** the quiet window settle() waits after the last motion, ms (taken off the step's time) */
  quietMs: number;
}

const FAMILIES = /^(fit|edge|label)/;

/** The step's row, judged. `openMs` is how long the step took to hand back (a Next press is instant; opening a talk is its cover). */
export function judgeStep(step: Step, label: string, r: Reads, busyMs: number, settled: boolean): AuditRow {
  const flags: AuditFinding[] = [];
  const tl = timeline(r.samples);
  const fades = fadeEpisodes(r.samples);
  flags.push(...fadeFindings(fades));
  for (const f of judgeMotion({ samples: r.samples, events: [] })) flags.push({ kind: f.rule, sev: 'fail', what: `${f.what}: ${f.where}`, where: f.at });
  if (r.layout) flags.push(...layoutFindings(r.layout));
  for (const p of r.problems) flags.push({ kind: p.kind, sev: FAMILIES.test(p.kind) ? 'fail' : 'warn', what: p.text, where: p.where ?? '' });
  const fs = frameStats(r.gaps, r.work);
  if (!settled) flags.push({ kind: 'unsettled', sev: 'fail', what: `still moving after ${Math.round(busyMs / 1000)} s (the camera, a card or an animation never stopped)`, where: '' });
  else if (busyMs > SLOW_BUSY_MS) flags.push({ kind: 'slow-load', sev: 'warn', what: `took ${(busyMs / 1000).toFixed(1)} s to settle (limit ${SLOW_BUSY_MS / 1000} s)`, where: '' });
  if (fs.fps != null && fs.frames >= 10 && fs.fps < LOW_FPS) flags.push({ kind: 'low-fps', sev: 'warn', what: `ran at ${fs.fps} fps while moving (under ${LOW_FPS})`, where: `worst gap ${fs.worstGap} ms` });
  if (fs.stalls > 0) flags.push({ kind: 'stall', sev: fs.worstGap > 120 ? 'fail' : 'warn', what: `${fs.stalls} frame gap${fs.stalls === 1 ? '' : 's'} over 50 ms (worst ${fs.worstGap} ms)`, where: '' });
  if (r.hidden) flags.push({ kind: 'tab-hidden', sev: 'fail', what: 'the tab was in the background during this step: its numbers are not valid', where: '' });
  const ins = fades.filter((f) => f.dir === 'in').map((f) => f.ms), outs = fades.filter((f) => f.dir === 'out').map((f) => f.ms);
  return {
    group: step.group, id: step.id, label, busyMs: Math.round(busyMs), settled, cardsMs: tl.cardEndMs == null ? null : Math.round(tl.cardEndMs),
    fadeIn: ins.length ? Math.round(Math.max(...ins)) : null, fadeOut: outs.length ? Math.round(Math.max(...outs)) : null, frames: fs, flags,
  };
}

export async function runAudit(steps: AsyncIterable<Step> | Iterable<Step>, deps: AuditDeps, o: { depth: 'quick' | 'full'; notes?: string[]; shouldStop?: () => boolean; onStep?: (n: number, row: AuditRow) => void } = { depth: 'full' }): Promise<AuditData> {
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
    const row = judgeStep(step, label, reads, busy, st.settled);
    if (failed) row.flags.unshift({ kind: 'step-failed', sev: 'fail', what: failed, where: '' });
    rows.push(row); con.push(...reads.console);
    o.onStep?.(rows.length, row);
  }
  return { size: deps.size, ms: Math.round(deps.now() - t00), depth: o.depth, stopped, rows, console: con, notes };
}
