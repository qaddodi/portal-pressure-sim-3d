// The Sweep (the 2D app's gallery/sweep.js): open each specimen in each look, wait until the page is still, read the screen report's self-checks, and end with ONE Run report
// (report/emit.js sweepRun). Pure of the page: the page hands in `deps`, so a Node test drives it with a fake app.
import { sweepRun } from '../core/api.ts';
import type { Entry } from './catalog.ts';

export interface Problem { kind: string; text: string; where?: string }
export interface SweepDeps {
  open(e: Entry): Promise<void>;
  setLook(look: string): Promise<void> | void;
  settle(): Promise<{ settled: boolean; ms: number }>;
  /** the screen report's findings for what is showing now */
  problems(): Problem[];
  /** errors counted so far (caught.ts) */
  errors(): number;
  /** a GPU memory estimate in MB, or null */
  memoryMB(): number | null;
  size: string;
  now?: () => number;
}
export interface SweepResult { id: string; look: string; ok: boolean; settled: boolean; problems: Problem[]; errors: number; error?: string; ms: number }

export async function runSweep(entries: readonly Entry[], looks: readonly string[], deps: SweepDeps, o: { unknown?: string[]; shouldStop?: () => boolean; onStep?: (done: number, of: number, r: SweepResult) => void } = {}) {
  const now = deps.now ?? (() => Date.now()), t0 = now();
  const results: SweepResult[] = [];
  let peak = 0, stopped = false;
  const planned = entries.length * looks.length;
  outer: for (const look of looks) {
    await deps.setLook(look);
    for (const e of entries) {
      if (o.shouldStop?.()) { stopped = true; break outer; }
      const t = now(), e0 = deps.errors();
      const r: SweepResult = { id: e.id, look, ok: true, settled: true, problems: [], errors: 0, ms: 0 };
      try {
        await deps.open(e);
        const s = await deps.settle();
        r.settled = s.settled;
        r.problems = deps.problems();
        const m = deps.memoryMB(); if (m != null) peak = Math.max(peak, m);
      } catch (err) { r.ok = false; r.error = String((err as Error)?.message ?? err); }
      r.errors = deps.errors() - e0;
      r.ms = now() - t;
      results.push(r);
      o.onStep?.(results.length, planned, r);
    }
  }
  const errors = results.reduce((n, r) => n + r.errors, 0);
  return sweepRun({ results, summary: { planned, peakMB: peak || undefined, errors, specimens: entries.length, opens: results.length }, spec: { looks: [...looks] }, size: deps.size, ms: now() - t0, stoppedEarly: stopped, unknown: o.unknown ?? [], at: new Date(t0).toISOString() });
}
