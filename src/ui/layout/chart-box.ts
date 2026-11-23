// The table height of an instrument's picture on the screen now (card-size.ts), for the pictures a chart frame sizes itself: undefined on a phone on its side, whose pictures keep 2D's sideways rules.
import { useUi } from '../ui-store.ts';
import { chartH, usesTable } from './card-size.ts';

export function tableH(): number | undefined {
  const { w, h } = useUi.getState().vp;
  return usesTable(w, h) ? chartH(w, h) : undefined;
}
