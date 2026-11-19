import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { I } from './icons.tsx';
import { runFeature } from './features.ts';
import { refitFigure, zoomFigure } from './view-actions.ts';
import { zoomInDisabled } from './views.ts';
import { useCircuitTurn } from '../../scene/circuit/pref.ts';

const z = (id: string) => UI.zoomGroup.find((x) => x.id === id)!;

/** The zoom pill, as index.html has it (#zoomPill): zoom in, zoom out, Fit, and in the Circuit view Turn upright (the 2D stylesheet shows it under `.cmap`). Zoom in is off inside the sinusoid. */
export function ZoomGroup() {
  const view = useShell((s) => s.view);
  const upright = useCircuitTurn((s) => s.upright);
  return (
    <div className="zoom-pill float-ui stage-blocker" id="zoomPill" role="group" aria-label="Zoom">
      <button type="button" className="ib" id="zoomIn" disabled={zoomInDisabled(view)} aria-label={z('zoomIn').label ?? undefined} title={z('zoomIn').title ?? undefined} onClick={() => zoomFigure('in')}><I n="plus" /></button>
      <button type="button" className="ib" id="zoomOut" aria-label={z('zoomOut').label ?? undefined} title={z('zoomOut').title ?? undefined} onClick={() => zoomFigure('out')}><I n="minus" /></button>
      <button type="button" className="ib stage-fit" id="zoomFit" aria-label={z('zoomFit').label ?? undefined} title={z('zoomFit').title ?? undefined} onClick={refitFigure}><I n="fit" /></button>
      <button type="button" className="ib stage-rotate" id="rotateCircuit" aria-pressed={upright} aria-label={z('rotateCircuit').label ?? undefined} title={z('rotateCircuit').title ?? undefined} onClick={() => runFeature('rotate', 'Turning the circuit upright')}><I n="rotate" /></button>
    </div>
  );
}
