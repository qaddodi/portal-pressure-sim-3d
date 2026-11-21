// ?audit progress: how many steps the walk will take (counted up front from what the walk will do, so a bar can show "step N of TOTAL · X%") and the pace so far (an ETA). Pure: a Node test reads it.
/** What the walk's plan() will yield, counted without running it. A full run presses through a stop's beats too, and how many a stop has is known only by pressing, so the total is "about": it grows when the run turns out longer. */
export function estimateSteps(depth: 'quick' | 'full', a: { sheets: number; presets: number; decks: number[]; sequence?: boolean }): number {
  const views = 4, close = 1, patients = 5 + (depth === 'full' ? Math.max(0, a.presets - 2) : 0), restore = 1;
  const sheets = depth === 'quick' ? Math.min(2, a.sheets) : a.sheets;
  let talks = 0;
  for (const slides of a.decks) {
    const stops = slides + 2, jumps = depth === 'quick' ? Math.min(4, Math.max(0, stops - 1)) : Math.max(0, stops - 1);
    talks += 1 + jumps + 1;   // the outline (opening the talk), every jump, leaving
    if (a.sequence) talks += 1 + Math.round(stops * 2.6);   // the sequential pass: the start, a Next per stop and beat (about 1.6 a stop) and a Back and Next at each edge
  }
  return views + sheets + close + patients + talks + restore;
}
export interface Pace { pct: number; text: string; total: number }
const clock = (ms: number) => (ms >= 90000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);
/** "step 120 of about 600 · 20% · about 9 min left". `total` is raised to `n` when the run goes past the estimate; the percentage stays under 100 until `done`. */
export function pace(n: number, total: number, startedMs: number, nowMs: number, done = false): Pace {
  const t = Math.max(total, n + (done ? 0 : 1));
  const pct = done ? 100 : Math.min(99, Math.floor((n / t) * 100));
  const left = n > 0 && !done ? ((nowMs - startedMs) / n) * (t - n) : null;
  return { pct, total: t, text: done ? `finished: ${n} steps · 100%` : `step ${n} of about ${t} · ${pct}%${left != null && n >= 3 ? ` · about ${clock(left)} left` : ''}` };
}
/** Several frames (sizes) each with their own count: the whole run's step and total. A frame that has not reported yet is assumed as long as the ones that have. */
export function combine(sizes: number, per: ReadonlyMap<string, { n: number; total: number }>): { n: number; total: number } {
  const v = [...per.values()];
  if (!v.length) return { n: 0, total: 0 };
  const avg = v.reduce((s, x) => s + x.total, 0) / v.length;
  return { n: v.reduce((s, x) => s + x.n, 0), total: Math.round(v.reduce((s, x) => s + x.total, 0) + avg * Math.max(0, sizes - v.length)) };
}
