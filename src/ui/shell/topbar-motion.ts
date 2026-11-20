// The top bar never pops (audit 5.5, 2D topbar-motion.js, copied whole into topbar-motion.copied.js): a button that comes (the Layers chip over the lobule, a longer patient name) fades and grows in,
// one that goes fades out as a ghost, and everything beside them glides to its new place (FLIP, transform and opacity only; nothing on a resize or with reduced motion). The bar's component starts it
// once the bar is in the page and stops it with the bar.
// @ts-ignore plain JS copied from the 2D app
import { initTopbarMotion } from './topbar-motion.copied.js';

/** Starts the bar's motion (the bar must be in the page); returns the stop. */
export function startTopbarMotion(): () => void {
  const stop = initTopbarMotion() as (() => void) | undefined;
  return typeof stop === 'function' ? stop : () => {};
}
