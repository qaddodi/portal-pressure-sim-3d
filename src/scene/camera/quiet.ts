// Quiet depth on a turn (visual review, "better than 2D" 3): face on, the picture is 2D's. Turned past 8 degrees, the organs' wash eases toward the page by up to a quarter, so the vessels in front
// of them stand out as the figure shows its depth; back to nothing at rest. Pure; the organ layer reads it and repaints in steps of 1/20 (a drag does not repaint the liver's vertices every frame).
export const QUIET_FROM_DEG = 8;
export const QUIET_TO_DEG = 25;   // the orbit is clamped to 25 degrees (rig.setOrbit)
export const QUIET_WASH = 0.25;
export const QUIET_STEPS = 20;
/** The back tier (the cava, the azygos: the vessels behind the organs) eases toward the page by this much on a full turn (vessels/shaders.ts quietK). */
export const QUIET_BACK = 0.08;

/** 0 face on (and up to 8 degrees), 1 at the end of the turn, smooth between (the turn is signed: left or right is the same). */
export function quietOf(orbitRad: number): number {
  const deg = Math.abs(orbitRad) * (180 / Math.PI);
  const t = Math.min(1, Math.max(0, (deg - QUIET_FROM_DEG) / (QUIET_TO_DEG - QUIET_FROM_DEG)));
  return Math.round(t * t * (3 - 2 * t) * QUIET_STEPS) / QUIET_STEPS;
}
