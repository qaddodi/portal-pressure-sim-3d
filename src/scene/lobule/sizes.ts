// The Lobule's few base sizes, in a file of their own with no imports (so geometry.ts, widths.ts and the bend of the network (weld-bend.ts) can all read them without an import cycle).

/** Sinusoid lumen (healthy) in lobule radii: the 2D app's own, rs0 = clamp(0.0085 R, 1.7, 3) px (lobule-zoom.js), at the 0.0085 an iPad or a Mac shows (a phone's 1.7 px floor is a little more).
 *  It was 0.016 (drawn twice as wide "to read at the fit"), which put the cords of cells 1.9 times too far apart and the tubes 1.5 times too wide (visual review, 19 Nov). */
export const RS0 = 0.0085;
export const SIN_NARROW = 0.75;
/** The lymph tube's radius at the portal end: a thin tube, 0.31 of rs0 (0.0026 R; a sinusoid's is 0.0064), the same all along it (only the taper toward the central vein narrows it). Mohammad, 20 Nov 2026: thin, like a ductule, "never a filled area". */
export const DUCT_R = RS0 * 0.31;
/** An anastomosis is 0.68 of a sinusoid (2D: rs * 0.68). */
export const AN_K = 0.68;
/** The lobule's radius in scene units (the body plate is about 4.6 wide). */
export const LOBULE_R = 3;
