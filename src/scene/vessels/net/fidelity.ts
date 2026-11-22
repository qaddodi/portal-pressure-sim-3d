// The fillet's fidelity, judged against the tubes' own tessellation (plan owner, 22 Nov, "Rulings on WP2 (b935c7b8)"): a tube of `radial` sides sits (1 - cos(pi / radial)) R off its cylinder (0.025 R for 14, about 2 px on the widest vessel at the closest zoom, and
// invisible), so a fillet is allowed 1.5 x that sag of its region's widest arm. (The 0.5 CSS px rule of the earlier ruling is withdrawn: it asked 4 x more than the tubes themselves keep.)
export const TUBE_SAG_SHARE = 1.5;
/** The sag of a `radial`-sided tube, as a share of its radius. */
export const tubeSag = (radial: number): number => 1 - Math.cos(Math.PI / radial);
/** The most a region's fillet may stand off the union at an edge's midpoint, in scene units: 1.5 x the tube sag of its widest arm. */
export const filletTolerance = (widestArmRadius: number, radial: number): number => TUBE_SAG_SHARE * tubeSag(radial) * widestArmRadius;
