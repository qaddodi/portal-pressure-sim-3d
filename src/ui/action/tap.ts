// A tap in the lobule view (the stage's tap gesture): the part under the finger opens its card, a second tap lets go. The body's taps (vessel, organ, fluid) are src/ui/action/tap-select.ts.
// The scene answers what is under the finger; src/ui/action/tap-map.ts says which card each answer opens.
import type { Raycaster } from 'three';
import { cel } from '../../scene/api.ts';
import { lobuleSelAt } from './tap-map.ts';
import { selectStructure, useSelection } from './selection.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function tapFigure(x: number, y: number, raycaster: Raycaster): void {
  if (cel.view === 'lobule') {
    const hit = cel.pickLobuleAt(x, y, raycaster), sel = hit ? lobuleSelAt(hit.part, hit.x, hit.y) : null;
    selectStructure(sel && !same(sel, useSelection.getState().sel) ? sel : null);
    return;
  }
}
