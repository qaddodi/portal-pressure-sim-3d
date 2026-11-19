// A tap on the figure (the stage's tap gesture): a vessel first (a second tap on the picked one lets go), else the organ under the finger, else nothing; in the lobule, the part under it.
// The scene answers what is under the finger; src/ui/action/tap-map.ts says which card each answer opens.
import type { Raycaster } from 'three';
import { cel, sceneApi } from '../../scene/api.ts';
import { lobuleSelAt, organSelOf } from './tap-map.ts';
import { selectStructure, useSelection } from './selection.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function tapFigure(x: number, y: number, raycaster: Raycaster): void {
  if (cel.view === 'lobule') {
    const hit = cel.pickLobuleAt(x, y, raycaster), sel = hit ? lobuleSelAt(hit.part, hit.x, hit.y) : null;
    selectStructure(sel && !same(sel, useSelection.getState().sel) ? sel : null);
    return;
  }
  const hit = cel.pickAt(x, y, raycaster);
  if (hit) { sceneApi.pick(hit === cel.highlight.picked ? null : hit); return; }
  const organ = organSelOf(cel.pickOrganAt(x, y, raycaster));
  if (organ) { selectStructure(same(organ, useSelection.getState().sel) ? null : organ); return; }
  sceneApi.pick(null);
  selectStructure(null);
}
