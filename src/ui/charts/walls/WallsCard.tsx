import { Chart } from '../Chart.tsx';
import { WALLS_ARIA, WALLS_COPY, wallsFrame } from './frame.ts';
import '../charts.css';

/** Why a clot before the liver leaves the abdomen dry (2D visual: 'walls'): the intestinal capillary and the hepatic sinusoid, each a panel with its name, a line under it, the wall drawn
 *  on the GPU and two lines of what follows. The panels' classes are the 2D app's (side by side on a wide card, one above the other on a stacked one). */
export function WallsCard() {
  return (
    <div className="pz-visual pz-walls" role="img" aria-label={WALLS_ARIA}>
      {(['gut', 'sin'] as const).map((k) => (
        <div key={k} className={`pzw-panel${k === 'sin' ? ' sin' : ''}`}>
          <div className="pzw-t">{WALLS_COPY[k].title}</div>
          <div className="pzw-s">{WALLS_COPY[k].sub}</div>
          <div className="pzw-art"><Chart tag={`chart:walls-${k}`} deps={[k]} label={WALLS_COPY[k].aria} build={(c) => wallsFrame(k === 'sin', c)} /></div>
          <p className="pzw-c">{WALLS_COPY[k].c1}</p>
          <p className="pzw-c2">{WALLS_COPY[k].c2}</p>
        </div>
      ))}
    </div>
  );
}
