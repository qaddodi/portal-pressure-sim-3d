// Inject dye (2D: the dye verb of a vessel's card, the J key): a press injects for a few seconds, held it goes on until let go. The dye goes into the selected vessel (the gut's veins when no
// vessel is selected); the model keeps running so the bolus rides the flow. The bolus itself is src/scene/disease/dye.ts.
import { sceneApi } from '../../scene/api.ts';
import { useSelection } from './selection.ts';
import { engine } from '../../engine/boot.ts';
import { latest } from '../../engine/index.ts';

/** Start a bolus into the selected vessel. */
export function injectDye(o: { hold?: boolean } = {}): void {
  const sel = useSelection.getState().sel;
  sceneApi.dye.inject(sel?.type === 'edge' ? sel.id : null, o);
  const f = latest.frame as { running?: boolean } | null;
  if (f && f.running === false) engine().send({ type: 'run', running: true });
}
export function releaseDye(): void { sceneApi.dye.release(); }
