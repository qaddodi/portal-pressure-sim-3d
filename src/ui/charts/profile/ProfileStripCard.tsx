import { Chart } from '../Chart.tsx';
import type { Frame } from '../scene.ts';
import { profileNamesFrame, profileStripFrame } from './strip.ts';
import type { Fp } from './model.ts';
import '../charts.css';

const none: Frame = { w: 0, h: 0, shapes: [], label: '' };

/** The phone grid's strip for one case (2D: createProfileStrip): its eight readings on one line with the zones' tints and the red blocks; `namesOnly`: the names strip over the six cases. */
export function ProfileStripCard({ fp, healthy = null, namesOnly = false }: { fp?: Fp | null; healthy?: Fp | null; namesOnly?: boolean }) {
  return (
    <div className={namesOnly ? 'pz-pstrip names' : 'pz-pstrip'}>
      <Chart tag="chart:profile-strip" deps={[fp, healthy, namesOnly]} label={namesOnly ? 'The stations, gut to heart' : 'Pressure from gut to heart'}
        build={(c) => (namesOnly ? profileNamesFrame(c) : profileStripFrame(fp, healthy, c) ?? none)} />
    </div>
  );
}
