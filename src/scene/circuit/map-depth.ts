// The Circuit's lines lie on one plate, so where two cross there has been no over and under (the depth tied; the draw order decided). Each line gets its own depth on the plate, in the order the body's tiers give
// (frame2d.ts TIER_Z: the same over and under as the Anatomy), the thinner of two of one tier over the thicker, so a crossing shadow (cel-ink.ts SHADOW) has a front line to fall from. The shader applies it as a depth
// offset only (vessels/shaders.ts mapDepth, scaled by the Circuit's share), and the tube's own bulge in depth goes with the same share (a flat line has none): no vertex moves, so the courses, the skins and the labels stay exactly where they were.
import { MAPPED } from '../vessels/network.ts';
import { TIER_Z } from '../frame2d.ts';
import { MAP_DEPTH_STEP } from '../vessels/cel-ink.ts';

const order = [...MAPPED].sort((a, b) => TIER_Z[a.tier] - TIER_Z[b.tier] || b.radius - a.radius || (a.id < b.id ? -1 : 1));
const depth = new Map(order.map((v, i) => [v.id, i * MAP_DEPTH_STEP]));
/** How far toward the viewer a vessel's line stands on the Circuit's plate, scene units (0 for a part with no map course). */
export const mapDepthOf = (id: string): number => depth.get(id) ?? 0;
