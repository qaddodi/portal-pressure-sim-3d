// How the TIPS/DIPS stent is shaded (the mesh is stent-build.ts and is not touched here). The front wires are the look's gold with a soft warm edge (the dark brown wire colour, mixed toward the gold, at
// part strength) instead of the figure's heavy ink, so a hairline wire reads as bright metal with a fine shadow side and not as a dense brown mesh; the far wires stay the dark brown, no outline, as depth;
// the graft is glass: faint in the middle, firmer and outlined only at its rim, so the covered part has a round body over the lumen; the gold band and tab carry the same warm edge.
import type { EdgeFn } from '../edges.ts';
import { mixHex } from '../edges.ts';

/** The covered part's glass: how much firmer its fill is toward the rim (device-object setGlass `fill`), and the width of the rim its outline keeps (n.v). */
export const STENT_GLASS = { fill: 0.7, rim: 0.42 } as const;
/** Front wire edge: the wire's dark brown moved 35 % toward the gold, at 0.55 strength. */
export const stentWireEdge: EdgeFn = { colour: ({ t }) => mixHex(t.stentWire, t.stentGold, 0.35), a: 0.55 };
/** Band and tab edge: the same brown, firmer (they are the one solid mark on the stent). */
export const stentGoldEdge: EdgeFn = { colour: ({ t }) => mixHex(t.stentWire, t.stentGold, 0.2), a: 0.8 };
/** Graft rim: the sleeve's own cool grey (the metal token) moved toward the ink, so the clear cover is edged by a soft line in the vessel's colours, not black. */
export const stentGraftEdge: EdgeFn = { colour: ({ t, ink }) => mixHex(t.stentMetal, ink, 0.4), a: 0.55 };
