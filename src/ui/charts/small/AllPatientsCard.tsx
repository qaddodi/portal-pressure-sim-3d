import { useEffect, useMemo, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { engine } from '../../../engine/index.ts';
import { allPatientsFrame } from './frame.ts';
import { cohortSeries, type Run } from './data.ts';
import { allPatientsWords, type DeckLike, type Series } from './model.ts';
import '../charts.css';

/** The engine's own run: the worker's 'sequence' (what 2D's ctx.run is). */
const engineRun: Run = (steps) => engine().sequence(steps) as unknown as ReturnType<Run>;

/** All four patients on one chart (2D visual: 'allpatients'): the HVPG over two years with the CSPH line and the key.
 *  slide: the slide with its `cohort` and `chartFoot`; deck: the deck it is in (the cohort names its slides); ser: the numbers when the caller already has them
 *  (a specimen, a test); run: how to ask the model (the engine's by default). Until the numbers are there the frame shows alone and the lines come in over it. */
export function AllPatientsCard({ slide, deck, ser: given, run = engineRun }: { slide: { id: string; cohort?: unknown; chartFoot?: unknown }; deck: DeckLike; ser?: Series | null; run?: Run }) {
  const [got, setGot] = useState<Series | null>(null);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    const p = cohortSeries(slide, deck, run);
    p?.then((s) => { if (live && s) setGot(s); }, () => undefined);
    return () => { live = false; };
  }, [slide, deck, given, run]);
  const ser = given !== undefined ? given : got;
  const foot = useMemo(() => [slide.chartFoot ?? []].flat().filter((t): t is string => typeof t === 'string'), [slide.chartFoot]);
  const key = ser ? ser.map((p) => p.pts.map((q) => q.hvpg.toFixed(1)).join()).join('|') : '';
  return (
    <div className="pz-allpatients">
      <Chart tag="chart:allpatients" deps={[key, foot.join('\n')]} label={allPatientsWords(ser)} build={(c) => allPatientsFrame(ser, foot, c).frame} />
    </div>
  );
}
