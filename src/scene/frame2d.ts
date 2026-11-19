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

/** Depth: the 2D figure draws the vessels in tiers, back to front (stage.js: TIER_BACK, TIER_ART, the translucent collaterals, TIER_NET, TIER_FRONT = the
 *  portal tree, TIER_OVER). Each tier is one plane of z, so a crossing is over or under exactly as in 2D. Organs lie behind z = 0.26 (their front face)
 *  and straddle z = 0; only the retroperitoneal tier (the cava, the azygos) passes behind them. */
export const TIER_Z = { back: -0.32, art: 0.30, mid: 0.34, net: 0.38, front: 0.46, over: 0.54 } as const;
export type Tier = keyof typeof TIER_Z;
