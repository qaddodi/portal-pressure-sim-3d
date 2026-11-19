// What a tap on a station's label opens (2D: stage-label-layer.js, `onSelect({ type: 'node', id })`, then actions.js NODE_SEL: "a label or station stands for a structure: clicking
// 'Portal vein' opens the portal vein's card"). The station is turned into the structure it stands for here, then taken as a tap on that structure is (tap-select.ts): a vessel is lit, an organ
// opens its card, a second tap lets go.
import type { FigureHit } from '../../scene/organs/pick.ts';
import { normalizeSel } from './cards.ts';

/** The tap a station's label stands for, or null for a station that stands for no card. */
export function labelHit(node: string): FigureHit | null {
  const s = normalizeSel({ type: 'node', id: node });
  if (s?.type === 'edge') return { type: 'edge', id: s.id };
  // (the varices and the fundus are organs of 2D's card catalogue with no mesh on the figure: the station's label is the way to them; FigureHit's organ ids are the meshes', so this one is widened)
  if (s?.type === 'organ') return { type: 'organ', id: s.id as 'liver' };
  return null;
}
