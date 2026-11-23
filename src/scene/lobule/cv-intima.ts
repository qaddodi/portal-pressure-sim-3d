// What is left of Plan 24's scar inside the central vein: its growth curve and the mesh's two radii. The collagen itself is drawn by cv-band.ts (one function, never painted), the same band inside the wall and outside it.
export { CV_FILL, CV_WALL, CV_MESH_IN } from './cv-band.ts';

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** 2D's growth curve (lobule-paint.js scarGrowth), of the host's eased fibPost. */
export const cvScarGrowth = (fibPost: number): number => clamp(fibPost, 0, 1) ** 1.1;
