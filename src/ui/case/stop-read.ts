// One number for a reading at a stop. The stop's card says "HVPG 10.1" from the course's day record; a Look closer opens a Tests card that read the live model, which breathes and beats and
// sits a tenth or two off the record's calmed day (the CSPH stop: the card 10.1, the HVPG card 9.9 or 10.0 by device). So while the case waits at a stop, the readings the card names are the
// card's own on every Tests card: `withStopReads` puts them over the frame's metrics where a pane takes them (tests/frame.ts metricsOf, the procedures' readFrame). A leaf: the case's view
// registers where the stop's numbers come from (case/view.ts), so nothing here imports the page.
import type { Series } from '../bigtime/record.ts';
import { dayReadings } from '../timeline/story.ts';

/** The readings a stop's card names, as it prints them: the gradients. */
export interface StopReads { hvpg?: number; ppg?: number }

/** The stop's readings from the story's series on its day: the numbers the "that day" line of its card prints (timeline/story.ts dayReadings). */
export function stopReadsOf(series: Readonly<Record<string, Series | undefined>>, day: number): StopReads {
  const out: StopReads = {};
  for (const r of dayReadings(series, day).rows) if (r.k === 'hvpg' || r.k === 'ppg') out[r.k] = r.b;
  return out;
}

/** (the same object for the same stop, so a pane can tell a changed stop from the same one) */
let source: (() => StopReads | null) | null = null;
/** The case's view says where the stop's readings come from (null off a stop: nothing is overridden). */
export const setStopSource = (f: (() => StopReads | null) | null): void => { source = f; };
export const stopReads = (): StopReads | null => source?.() ?? null;

const r1 = (v: number): number => Math.round(v * 10) / 10;
let kept: { m: object; hv: number | undefined; pp: number | undefined; out: object } | null = null;
/** A frame's metrics with the stop's readings over them: the gradients as the card prints them, and the free pressure the wedged one and the gradient give together (WHVP less HVPG, at a tenth: the
 *  pane's three readings always add up). The same object back for the same metrics and readings (a pane asks every frame); the metrics themselves untouched, and unchanged off a stop. */
export function withStopReads<M extends object | null | undefined>(m: M): M {
  if (!m) return m;
  const r = stopReads();
  if (!r || (r.hvpg == null && r.ppg == null)) return m;
  if (kept && kept.m === m && kept.hv === r.hvpg && kept.pp === r.ppg) return kept.out as M;
  const out: Record<string, unknown> = { ...(m as Record<string, unknown>) };
  if (r.hvpg != null) {
    out.hvpg = r.hvpg;
    if (typeof out.whvp === 'number') out.fhvp = r1(r1(out.whvp) - r.hvpg);
  }
  if (r.ppg != null) out.ppg = r.ppg;
  kept = { m, hv: r.hvpg, pp: r.ppg, out };
  return out as M;
}
