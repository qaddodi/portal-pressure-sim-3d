import { Chart } from '../Chart.tsx';
import { scoresFrame } from './frame.ts';
import { scoresOf, scoresWords, type ScoresIn } from './model.ts';
import '../charts.css';

/** Child–Pugh and MELD from a slide's case facts and the model's albumin (tool kind 'scores', or under a criteria card where the slide asks for it). */
export function ScoresCard({ facts, albumin = null, note = true }: { facts: ScoresIn; albumin?: number | null; note?: boolean }) {
  const s = scoresOf(facts, albumin);
  return (
    <div className="pz-stiff pz-scores">
      <Chart tag="chart:scores" deps={[JSON.stringify(facts), albumin, note]} label={scoresWords(s)} build={(c) => scoresFrame(s, c, { note })} />
    </div>
  );
}
