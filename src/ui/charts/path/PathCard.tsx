import { useContext, useMemo } from 'react';
import { Chart, ChartEnv } from '../Chart.tsx';
import { useUi } from '../../ui-store.ts';
import type { Fingerprint } from '../fmt.ts';
import { pathFrame } from './frame.ts';
import { pathPatient, phoneLayout } from './data.ts';
import { pathWords } from './model.ts';
import '../charts.css';

export interface PathProps {
  /** the algorithm: 'first-visit' | 'bleed' | 'gastric' | 'ascites' | 'stopcarv' | 'holdcarv' | 'secprop' | 'psvdscope' | 'pvtocc' | 'pvtdur' | 'psvdscore' | 'recomp' | 'pvtgrid' | 'ladder' (2D: tool { kind: 'path', of }); an unknown name is the first-visit chart */
  of?: string;
  /** the slide's own facts (2D: tool.patient): { lsm, plt, bmi, ant, ssm } | { src, cp, active, hvpg, ctrl, fit } | the answers of a score card, grid or ladder */
  patient?: Record<string, unknown> | null;
  /** the model's readings (the tiles' keys: lsm, plt, ssm, hvpg), which replace the slide's own where it has them */
  fp?: Fingerprint | null;
  /** the tile keys the card's header row already shows, left out of the patient's numbers (2D: headKeys) */
  tiled?: ReadonlySet<string>;
  /** the room the card has for its picture, px (the rows stand closer when the picture is taller) */
  room?: number;
}

/** The guideline path card for a slide: a Baveno VIII (or AASLD) flowchart, or a score card, grid or ladder, with the patient's own path lit. A phone or an iPad held upright gets the small map with one reading. */
export function PathCard({ of = 'first-visit', patient = null, fp = null, tiled, room }: PathProps) {
  const env = useContext(ChartEnv), app = useUi((s) => s.device), phone = phoneLayout(env?.device ?? app);
  const p = useMemo(() => pathPatient(of, patient, fp), [of, patient, fp]);
  const key = JSON.stringify([of, p, phone, room, tiled ? [...tiled] : null]);
  return (
    <div className="pz-path">
      <Chart tag="chart:path" deps={[key]} label={pathWords(of, p)} build={(c) => pathFrame({ of, patient: p, opts: { phone, tiled, room } }, c)} />
    </div>
  );
}
