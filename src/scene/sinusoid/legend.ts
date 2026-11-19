// Where the Protein legend stands (2D: sinusoid-view.js layoutEnds): at the top left of the free room, 2 px in, 12 under the top bar's inset; its room runs to the right margin on a wide screen, and on a tall
// one (the sinusoid top to bottom) to 8 px short of the sinusoid's own left edge, so it stays in the plate on the left, clear of the vessel and the portal venule's name.
export const legendOn = (view: string, drawn: boolean): boolean => view === 'sinusoid' && drawn;
/** 2D's top inset under the view pill is the top bar's own height (--top-safe, 40 on a desktop-size bar): here the shell's BAR less its margins (16). */
export const LEGEND_INSET = { x: 2, y: 12, bar: 16 } as const;
export function legendBox(free: { l: number; t: number; r: number; b: number }, safeTop: number, bar: number, right: number): { x: number; y: number; maxW: number } {
  const x = free.l + LEGEND_INSET.x, y = safeTop + bar - LEGEND_INSET.bar + LEGEND_INSET.y;
  return { x, y, maxW: Math.max(90, right - x) };
}
/** The hepatocytes' face on Disse, µm from the sinusoid's axis (the lumen, the endothelium, the space of Disse: 5 + 0.8 + 3.4): where a tall screen's legend must stay clear of. */
export const FACE_UM = 5 + 0.8 + 3.4;
