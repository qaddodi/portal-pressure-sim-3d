// How a stent deploys: ONE rule for every stent the figure draws (the TIPS and DIPS stents, a vein's stent, the stent on the Circuit's lane). A real stent is released from its distal end
// (the end furthest from the access: for a TIPS the portal vein end) and the sheath is drawn back toward the proximal end (the hepatic vein end), so the stent opens as a front that runs
// from the distal end to the proximal one (owner, 26 Nov 2026: "the stent should deploy from distal (portal end) to proximal (hepatic vein end)"). Before, the whole stent faded in at once.
// The stent's paths carry their place along the stent in uv.x (0 at the distal end, 1 at the proximal: `Ring.u`, stent-build.ts), so the one front (`reveal`) cuts every part alike.
/** How long a stent takes to open, and to be taken back (ms): slow enough to watch the front run through the tract. */
export const STENT_DEPLOY_MS = 1600, STENT_RETRACT_MS = 700;
/** The share of the opening over which the stent's first sliver fades up (nothing pops in), then it is whole. */
const FADE_IN = 0.1;
const smoother = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10);
export interface StentDeploy {
  /** where the front is along the stent, 0 (at the distal end, nothing open) to 1 (the proximal end reached: open whole). The parts show only where u <= front. */
  front: number;
  /** the stent's own strength (0 to 1): it fades up over the very first of the opening, then stays whole as the front runs on. */
  alpha: number;
}
/** The deployment at `amount` (0 closed to 1 open, the stent's own eased share). The front only ever moves from the distal end to the proximal one as the amount rises (and back as it falls). */
export function stentDeploy(amount: number): StentDeploy {
  const x = Math.min(1, Math.max(0, amount));
  return { front: smoother(x), alpha: smoother(Math.min(1, x / FADE_IN)) };
}
