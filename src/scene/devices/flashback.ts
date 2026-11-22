// The portal hit of a needle (TIPS, EUS-guided PPG, EUS glue) as FLASHBACK: blood runs back along the needle from its point, holds, drains. 2D drew two flat rings at the point
// (proc-anim.js `flash`); in 3D a flat ring is a disc floating in the liver (owner, 22 Nov: "a weird circle that appears from the tip of the needle"), so every needle shows the same
// hit as its own stretch filled with blood. `f` is the hit's 0..1 window of the procedure frame. Shared by the catheter's needle (proc-catheter.ts) and the scope's (probes/scope.ts).
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const sm = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };
/** The blood sleeve is a hair wider than the needle's shaft, so it reads on it. */
export const FLASHBACK_K = 1.18;
/** How strong the flashback is across the window f: in over the first fifth, out over the last third, eased both ways (never a step). */
export const flashbackEnv = (f: number): number => sm(f / 0.2) * (1 - sm((f - 0.66) / 0.34));
/** How far back along the needle the blood has run (0..1 of its length): it runs back over the first half of the window and stays. */
export const flashbackFront = (f: number): number => sm(f / 0.5);
