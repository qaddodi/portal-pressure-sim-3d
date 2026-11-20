// The one map between the 2D figure's world units and the scene. Every organ and every vessel is placed by it, with no warp: a point of the 2D
// anatomy (x right, y down, 1400 x 1000, the confluence at 700, 556) is a point of the 3D plate (x right, y up, z toward the viewer), the patient's
// right on the viewer's left as in 2D. Agreed with the artist thread (organs are extruded from the 2D outlines by this same map).
export const ORIGIN_2D = { x: 700, y: 556 } as const;
export const UNITS_PER_SCENE = 300;   // 2D world units in one scene unit

export const x3 = (x2: number): number => (x2 - ORIGIN_2D.x) / UNITS_PER_SCENE;
export const y3 = (y2: number): number => -(y2 - ORIGIN_2D.y) / UNITS_PER_SCENE;
export const x2d = (x: number): number => x * UNITS_PER_SCENE + ORIGIN_2D.x;
export const y2d = (y: number): number => -y * UNITS_PER_SCENE + ORIGIN_2D.y;
/** A length in 2D units (a width in the figure's pixels at its scale 1) in scene units. */
export const len3 = (u: number): number => u / UNITS_PER_SCENE;

/** Depth. The 2D figure draws the vessels in tiers, back to front (stage.js: TIER_BACK, TIER_ART, the translucent collaterals, TIER_NET, TIER_FRONT = the portal tree, TIER_OVER), so
 *  a crossing is over or under as in 2D. In 3D the whole vascular tree lies in ONE plane through the organs, not in front of them (Mohammad, 20 Nov: "the portal veins, sinusoids and
 *  hepatic veins INSIDE the liver, then the vena cava, which is also going through the liver, and the heart, all in the same kind of Z plane"): the tiers are only 0.025 to 0.03
 *  apart, enough to keep a crossing over or under, and all of them lie inside the liver (z -0.06 to 0.26 in the mesh), the heart's right atrium (0.02 to 0.20), the kidney, the spleen and
 *  the stomach. The 14 degree view turns a depth difference into a sideways shift, so the old 0.3 to 0.9 gaps between tiers (and the easing of a vessel from one to the next) were the
 *  zigzags; with 0.03 a jog is under one 2D unit. The cava and the renal vein are the lowest tier, the portal tree and the shunts in front of them. Organs must keep this band inside
 *  them (src/scene/organs/z.ts of the depth thread), whatever they are moved to. */
export const TIER_Z = { back: 0.0, art: 0.035, mid: 0.06, net: 0.085, front: 0.115, over: 0.145 } as const;
/** The plane's middle: where the cava, the right atrium and the hepatic veins meet. */
export const VESSEL_PLANE_Z = TIER_Z.net;
export type Tier = keyof typeof TIER_Z;
