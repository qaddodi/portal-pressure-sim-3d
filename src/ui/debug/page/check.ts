// The Phone check and the Full check (the 2D app's gallery/walk.js, journeys.js): a walk of the moves a person makes, view to view, slide to slide, sheet after sheet; after each
// step the page settles and the self-checks read the screen. The Full check also reads the memory estimate after each step, so a leak shows as a climb, and the errors counted.
// Ends with ONE Run report (report/emit.js walkRun). Pure of the page: `deps` is the app, so a Node test walks a fake one.
import { walkRun } from '../core/api.ts';
import type { Problem } from './sweep.ts';

export interface Step { journey: string; label: string; run(): Promise<void> | void }
export interface Journey { id: string; label: string; full?: boolean; steps(): Step[] }
export interface CheckDeps {
  settle(): Promise<{ settled: boolean; ms: number }>;
  problems(): Problem[];
  errors(): number;
  memoryMB(): number | null;
  info: { device?: string; look?: string; build?: string; rate?: string };
  now?: () => number;
}
export interface Row { journey: string; label: string; ms: number; mem: number | null; flags: { kind: string; sev: string; text: string }[] }

/** MB a walk may climb between its first and last step before it is called a leak (a camera move or a slide builds and frees; a climb that keeps on is the bug). */
export const LEAK_MB = 60;

export async function runCheck(journeys: readonly Journey[], deps: CheckDeps, o: { full?: boolean; steps?: boolean; shouldStop?: () => boolean; onStep?: (done: number, of: number, r: Row) => void } = {}) {
  const now = deps.now ?? (() => Date.now()), t0 = now();
  const use = journeys.filter((j) => o.full || !j.full);
  const all = use.flatMap((j) => j.steps());
  const rows: Row[] = [], groups = new Map<string, { kind: string; text: string; owner?: string; n: number; first: string }>();
  let peak = 0, errors0 = deps.errors(), first: number | null = null, last: number | null = null;
  for (const s of all) {
    if (o.shouldStop?.()) break;
    const t = now(), row: Row = { journey: s.journey, label: s.label, ms: 0, mem: null, flags: [] };
    try {
      await s.run();
      const st = await deps.settle();
      if (!st.settled) row.flags.push({ kind: 'unsettled', sev: 'warn', text: `cards or camera still moving after ${Math.round(st.ms / 1000)} s` });
      for (const p of deps.problems()) {
        const k = `${p.kind}|${p.text}`, g = groups.get(k);
        if (g) g.n++; else groups.set(k, { kind: p.kind, text: p.text, n: 1, first: `${s.journey} > ${s.label}` });
      }
    } catch (e) { row.flags.push({ kind: 'step-failed', sev: 'fail', text: String((e as Error)?.message ?? e) }); }
    row.mem = deps.memoryMB();
    if (row.mem != null) { peak = Math.max(peak, row.mem); first ??= row.mem; last = row.mem; }
    row.ms = now() - t;
    rows.push(row);
    o.onStep?.(rows.length, all.length, row);
  }
  if (o.full && first != null && last != null && last - first > LEAK_MB) {
    rows.push({ journey: 'memory', label: 'after the walk', ms: 0, mem: last, flags: [{ kind: 'memory-climb', sev: 'fail', text: `the memory estimate climbed ${Math.round(last - first)} MB over the walk (limit ${LEAK_MB} MB): a view or card is not freeing what it built` }] });
  }
  const errors = deps.errors() - errors0;
  if (errors > 0) rows.push({ journey: 'health', label: 'errors', ms: 0, mem: null, flags: [{ kind: 'errors', sev: 'warn', text: `${errors} error${errors === 1 ? '' : 's'} counted during the walk (caught.ts)` }] });
  const report = walkRun({ rows: o.steps === false ? rows.filter((r) => r.flags.length) : rows, problems: [...groups.values()], info: deps.info, summary: { peakMb: peak || undefined, errors }, ms: now() - t0, at: new Date(t0).toISOString() });
  return { report, rows };
}
