// The numbers the new geometry is measured against (WP0 records them; the plan's budgets are targets until a device says otherwise): what the CURRENT path builds for the Anatomy, counted in node
// from the same rules the tubes are built with (shape.ts tubularOf, tubes.ts buildTubes: a tube is (tubular + 1) rings of RADIAL + 1 vertices, and each course has two round caps).
// It counts the vertices of the tube meshes. The junction skins are baked and not counted here (the review's figure: 33 skins, 107 draws in all, taken from the code, not from a device).
import { NETWORK } from '../network.ts';
import { tubularOf } from '../shape.ts';
import { TUBE_RADIAL } from '../tubes.ts';
import { skeleton } from './skeleton.ts';

/** Vertices of a round cap (SphereGeometry(r, 14, 10): (14 + 1) * (10 + 1)). */
export const CAP_VERTS = 15 * 11;

export interface Baseline {
  /** vessel objects (one per NETWORK entry; each is drawn as the front copy, and the ones behind the organs also as the veil) */
  vessels: number;
  /** courses (a vessel with strands or a fan is several tubes in one geometry) */
  courses: number;
  /** vertices of the tube meshes at rest, caps included */
  tubeVertices: number;
  /** triangles of the tube meshes at rest */
  tubeTriangles: number;
  /** what the skeleton holds */
  skeleton: { nodes: number; edges: number; bones: number; boneBytes: number };
}

export function baseline(): Baseline {
  let courses = 0, verts = 0, tris = 0;
  for (const v of NETWORK) {
    for (const t of tubularOf(v)) {
      courses++;
      verts += (t + 1) * (TUBE_RADIAL + 1) + 2 * CAP_VERTS;
      tris += t * TUBE_RADIAL * 2 + 2 * (14 * 10 * 2 - 2 * 14);
    }
  }
  const s = skeleton();
  // (a bone as the GPU would hold it: body pos + r, map pos + r, frame t n b = 4 + 4 + 9 floats, rounded to 3 RGBA32F texels = 12 floats: the plan's "<= 3 texels a bone")
  return { vessels: NETWORK.length, courses, tubeVertices: verts, tubeTriangles: tris, skeleton: { nodes: s.nodes.length, edges: s.edges.length, bones: s.bones.length, boneBytes: s.bones.length * 12 * 4 } };
}
