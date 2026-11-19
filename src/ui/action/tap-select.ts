// What a tap on the figure selects, as the 2D app's pick does (stage.js pick): a vessel opens its card, an organ (liver with its lobe, heart, spleen) opens its card, the belly's
// fluid opens the Ascites instrument, and a tap on nothing puts the selection away. A second tap on what is already selected puts it away (a phone's way to close a card).
import type { FigureHit } from '../../scene/organs/pick.ts';
import { scenePicksHeld, selectStructure, useSelection } from './selection.ts';

/** `pick` lights or clears a vessel in the scene (sceneApi.pick: it also selects the vessel); `picked` is the vessel lit now; `body` is whether the figure is the body (its taps mean something only there). */
export function tapSelect(hit: FigureHit | null, io: { picked: string | null; pick(id: string | null): void; body: boolean }, toggle = true): void {
  const cur = useSelection.getState().sel;
  if (hit?.type === 'edge') { io.pick(toggle && hit.id === io.picked ? null : hit.id); return; }
  if (scenePicksHeld()) { io.pick(null); return; }   // (the shunt waiting for its target takes the tap; an organ is no target)
  if (hit?.type === 'organ') {
    if (cur?.type === 'edge') io.pick(null);
    if (toggle && cur?.type === 'organ' && cur.id === hit.id && (cur.lobe ?? null) === (hit.lobe ?? null)) { selectStructure(null); return; }
    selectStructure(hit.id === 'abdomen' ? { type: 'organ', id: 'abdomen' } : { type: 'organ', id: hit.id, ...(hit.lobe ? { lobe: hit.lobe } : {}) });
    return;
  }
  io.pick(null);
  if (io.body && cur?.type === 'organ') selectStructure(null);
}
