import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { Icon } from './icons.tsx';
import { runFeature } from './features.ts';
import { refitFigure, zoomFigure } from './view-actions.ts';
import { zoomInDisabled } from './views.ts';

const z = (id: string) => UI.zoomGroup.find((x) => x.id === id)!;

/** Zoom in, out, Fit, and (in the Circuit view) Turn upright. Zoom in is off inside the sinusoid; Turn upright folds in only for the Circuit. */
export function ZoomGroup() {
  const view = useShell((s) => s.view);
  const mode = useShell((s) => s.mode);
  return (
    <div className="sh-zoom" data-hidden={mode === 'deck'} role="group" aria-label="Zoom">
      <button type="button" className="sh-pill" disabled={zoomInDisabled(view)} aria-label={z('zoomIn').label ?? undefined} title={z('zoomIn').title ?? undefined} onClick={() => zoomFigure('in')}><Icon n="plus" /></button>
      <button type="button" className="sh-pill" aria-label={z('zoomOut').label ?? undefined} title={z('zoomOut').title ?? undefined} onClick={() => zoomFigure('out')}><Icon n="minus" /></button>
      <button type="button" className="sh-pill" aria-label={z('zoomFit').label ?? undefined} title={z('zoomFit').title ?? undefined} onClick={refitFigure}><Icon n="fit" /></button>
      <button type="button" className="sh-pill" data-folded={view !== 'circuit'} tabIndex={view === 'circuit' ? 0 : -1} aria-pressed="false" aria-label={z('rotateCircuit').label ?? undefined} title={z('rotateCircuit').title ?? undefined} onClick={() => runFeature('rotate', 'Turning the circuit upright')}><Icon n="rotate" /></button>
    </div>
  );
}
