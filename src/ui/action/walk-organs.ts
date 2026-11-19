// The organs the figure's keyboard walk stops on after the vessels (2D stage-pick.js figItems: ORGAN_KEYS, the organs a tap opens), in 2D's order and with its names.
import type { Sel } from './selection.ts';

export const WALK_ORGANS: readonly { id: string; name: string; sel: Extract<Sel, { type: 'organ' }> }[] = [
  { id: 'organ:heart', name: 'Right heart', sel: { type: 'organ', id: 'heart' } },
  { id: 'organ:liver', name: 'Liver', sel: { type: 'organ', id: 'liver' } },
  { id: 'organ:spleen', name: 'Spleen', sel: { type: 'organ', id: 'spleen' } },
];
