// The registry entry of the two walls (2D visual: 'walls'): the intestinal capillary and the hepatic sinusoid.
import type { ChartKind } from '../registry.ts';
import { wallsFrame } from './frame.ts';

export const wallsEntry: ChartKind = {
  kind: 'walls', what: 'The two walls: the gut capillary holds protein back, the sinusoid lets it through (visual: walls)', slides: 1, status: 'done',
  specimens: [{ id: 'gut', label: 'Intestinal capillary', build: (c) => wallsFrame(false, c) }, { id: 'sin', label: 'Hepatic sinusoid', build: (c) => wallsFrame(true, c) }],
};
