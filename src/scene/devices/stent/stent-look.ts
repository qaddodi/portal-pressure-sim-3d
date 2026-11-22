// How the TIPS/DIPS stent is shaded (the mesh is stent-build.ts and is not touched here). The front wires are the look's gold with a soft warm edge (the dark brown wire colour, mixed toward the gold, at
// part strength) instead of the figure's heavy ink, so a hairline wire reads as bright metal with a fine shadow side and not as a dense brown mesh; the far wires stay the dark brown, no outline, as depth;
// the graft is glass: faint in the middle, firmer and outlined only at its rim, so the covered part has a round body over the lumen; the gold band and tab carry the same warm edge.
import type { EdgeFn } from '../edges.ts';
import { mixHex } from '../edges.ts';
import { Color } from 'three';
import { rawColor } from '../../materials/cel.ts';
import { PALETTES, type LookId, type Palette } from '../../palette.ts';
import { DEVICE_TOKENS } from '../../procedures/copied/device-tokens.copied.ts';

/** The covered part's glass: how much firmer its fill is toward the rim (device-object setGlass `fill`), and the width of the rim its outline keeps (n.v). */
export const STENT_GLASS = { fill: 0.7, rim: 0.42 } as const;
/** Front wire edge: the wire's dark brown moved 55 % toward the gold, at a quarter strength (owner, 21 Nov 2026: option 4, ink-light and faded). */
export const stentWireEdge: EdgeFn = { colour: ({ t }) => mixHex(t.stentWire, t.stentGold, 0.55), a: 0.25 };
/** Band and tab edge: the same brown, firmer (they are the one solid mark on the stent). */
export const stentGoldEdge: EdgeFn = { colour: ({ t }) => mixHex(t.stentWire, t.stentGold, 0.4), a: 0.5 };
/** Graft rim: the sleeve's own cool grey (the metal token) moved toward the ink, so the clear cover is edged by a soft line in the vessel's colours, not black. */
export const stentGraftEdge: EdgeFn = { colour: ({ t, ink }) => mixHex(t.stentMetal, ink, 0.4), a: 0.55 };

/** The front wires' colour in every look (owner, 21 Nov 2026: warmer champagne, variation 4): one hex for the 3D device and the Circuit. */
export const STENT_CHAMPAGNE = '#F2D488';
/** How strongly the front wires and the gold band show (the faded look): the 3D device's alphas and the Circuit's wire strengths are these. */
export const STENT_FRONT_ALPHA = 0.55, STENT_GOLD_ALPHA = 0.6;
/** The Circuit's stent (drawn on the shunt's tube by the vessel shader) in the Anatomy stent's own colours: the champagne wire (the glint token) and the gold band, each at the device's strength. */
export function stentCircuitLook(p: Palette): { wire: Color; wireA: number; gold: Color; goldA: number } {
  const look = ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light'), t = DEVICE_TOKENS[look];
  return { wire: rawColor(STENT_CHAMPAGNE), wireA: STENT_FRONT_ALPHA, gold: rawColor(t.stentGold), goldA: STENT_GOLD_ALPHA };
}

/** The Viatorr's bare stretch is a real length, 2 cm, on every route: in the Circuit, where the route is longer than the body course, a share of its length would stretch it. Given in lumen half widths (a half width is D / 2 mm). */
export const BARE_MM = 20;
export const bareHalfWidths = (dMm: number): number => (2 * BARE_MM) / Math.max(dMm, 1);
