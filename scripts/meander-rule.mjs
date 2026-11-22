// WHEN A VESSEL MEANDERS in the 3D figure (copy-b3-data.mjs: the one place the 2D courses are made; tests/vessel-wobble.test.ts pins it).
/** WHEN A VESSEL MEANDERS (3D only, Mohammad, 21 Nov: "IVC SVC from right atrium still not smooth and zigzagged"). The 2D art bends every vein by a sine of up to 4.5 units, a phase and a wavelength of its own per ENGINE PIECE (stage-paths.js meander).
 *  At the 2D figure's scale that is a ripple under a pixel. The 3D figure zooms to a vessel's own calibre, where a wave a fraction of the calibre deep, a few calibres long, is a wall that wobbles and steps, and every piece of one vein
 *  (IVC_IS_1, IVC_IS, IVCS_RA; SVC_RA_1, SVC_RA, V_UP) waves out of step with its neighbours. A wave deeper than the vessel is wide reads as a curve and stays; one shallower than MEANDER_MIN_R of its radius is a wobble, so the vessel keeps its smooth 2D course.
 *  The calibre is the figure's own rule (stage.js vesselPx of the engine diameter, the cava and the superior cava at 0.72: network.ts widthPx), halved. */
export const MEANDER_MIN_R = 1;
/** The one vein that keeps its wave: the intrahepatic cava IVC_IS is the HOST of the hepatic veins' junction skin (a side arm at u = 0.77, IVCS), and with its stretch straight the skin planner cannot place the right hepatic vein's seam (its hull rule fails on every ring, 'ring 2 vertex 8
 *  is inside the hull'), so the confluence would fall back to the old joins. Its wave is behind the liver (the veil); the right atrium column above it is calm. Open: make the planner take a straight host (docs in the report of 21 Nov). */
export const MEANDER_KEPT = new Set(['IVC_IS']);
export const CAVA_PIECES = new Set(['ILI_IVC', 'IVC_IS', 'IVCS_RA', 'IVC_IS_1', 'ILI_IVC_1', 'SVC_RA', 'SVC_RA_1', 'V_UP']);
/** A vessel's radius in the 2D figure's units (stage.js vesselPx of its engine diameter, an artery half of it, a liver bed fixed; the cava and the superior cava at 0.72: network.ts widthPx), before the meander. */
export function calibreOf(e, TOPO) {
  const d = e.id.startsWith('IVC') || e.id.startsWith('ILI_IVC') ? TOPO.EDGES.find((x) => x.id === 'IVC_IS').d : e.d ?? e.dMax ?? (TOPO.dMinOf(e) || 3);
  const vein = 1.3 * Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, d), 0.72));
  const artery = e.kind === 'artery' || e.kind === 'arteriole';
  const w = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2) : artery ? Math.max(1.8, vein * 0.5) : vein * (CAVA_PIECES.has(e.id) ? 0.72 : 1);
  return w / 2;
}
export function meanderWanted(e, raw, TOPO) {
  if (e.kind === 'collateral' || MEANDER_KEPT.has(e.id)) return true;   // (a collateral is tortuous by nature, and dilates: its wave is the vessel)
  let L = 0;
  for (let i = 1; i < raw.length; i++) L += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
  const amp = Math.min(4.5, L * 0.02);
  const w = 2 * calibreOf(e, TOPO);
  return amp >= MEANDER_MIN_R * (w / 2);
}

/** HOSTS KEEP THE COURSE THEIR COLLATERALS WERE DRAWN AGAINST. A collateral or a shunt ends at a fixed 2D point on a vein's wall, placed against the vein as the 2D art bends it; straighten the vein and the end stands up to 0.3 of a radius off the wall, which the junction skins take
 *  for no landing (the portocaval shunt and the lumbar collateral on the cava's lower piece lost their skin, the azygos arch lost the coronary collateral's). So a vein any collateral or shunt ends on, in its interior (not within NODE_END_SAMPLES of its ends, where the node's own junction is), keeps its 2D wave. `ends`: the end points of the growing vessels;
 *  `own`: the vein's course as 2D bends it; `r`: its radius. */
export const HOST_REACH_R = 2.5;
export const NODE_END_SAMPLES = 6;
export function hostsLanding(ends, own, r) {
  for (const q of ends) {
    let best = Infinity, at = -1;
    for (let i = 0; i < own.length; i++) { const d = Math.hypot(own[i][0] - q[0], own[i][1] - q[1]); if (d < best) { best = d; at = i; } }
    if (best <= HOST_REACH_R * r && at >= NODE_END_SAMPLES && at <= own.length - 1 - NODE_END_SAMPLES) return true;   // (nearest to its INTERIOR: an end at the vein's own node is the junction's)
  }
  return false;
}
