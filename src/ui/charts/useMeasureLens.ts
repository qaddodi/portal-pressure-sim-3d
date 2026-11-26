// A card's Pressure | Velocity tab and the figure's lens as one thing (the rule: src/scene/lenses/measure.ts). Every card with these tabs reads and sets the tab here.
import { sceneApi } from '../../scene/api.ts';
import { measureOf, type MeasureLens } from '../../scene/lenses/measure.ts';
import { useLens } from '../../scene/lenses/store.ts';

/** The tab the figure's lens is on, and the way to change both: setting it sets the figure's lens. */
export function useMeasureLens(): [MeasureLens, (k: MeasureLens) => void] {
  const lens = useLens((s) => s.lens);
  return [measureOf(lens), (k) => { if (useLens.getState().lens !== k) sceneApi.setLens(k); }];
}
