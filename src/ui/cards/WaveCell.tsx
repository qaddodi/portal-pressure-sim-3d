// One Doppler trace of the summary table (table-wave.ts has the numbers): toward the probe above the baseline in the Doppler's toward colour, away below it in its away colour (lifted toward the text colour so it
// reads on a dark card), a 1 px baseline, 2 px lines with round joins; drawn on the charts' shared GPU drawer, never as an SVG.
import { Chart } from '../charts/Chart.tsx';
import { waveFrame } from '../talk/table-wave-frame.ts';
import type { Trace } from '../talk/table-wave.ts';

/** `maxH`: the tallest the trace is drawn (table-words.ts waveMaxH). */
export function WaveCell({ trace, vessel, max, words, maxH = 56 }: { trace: Trace; vessel: string; max: number; words: string; maxH?: number }) {
  return <Chart className="dk-wave" tag="chart:table-wave" label={words} deps={[trace, vessel, max, maxH]} glide={false}
    build={(c) => waveFrame(trace, vessel, max, c.w, Math.round(Math.max(36, Math.min(maxH, c.w * 0.3))), c.pal.tok('text'), c.pal.tok('text-3'), words)} />;
}
