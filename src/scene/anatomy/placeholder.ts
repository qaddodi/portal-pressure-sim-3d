import { BufferGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxOfNames, VISIBLE_FIGURE_NAMES } from './source.ts';

// What is left of the first slice's placeholders: the lumpy ellipsoid the catheter's balloon is made of, and the figure's depth and extent. The placeholder organs and the body
// plate are gone (the organs are the 2D outlines given depth, src/scene/organs; 2D draws no torso plate).

/** A smooth, lumpy ellipsoid. Vertices are welded first so the normals have no seam. */
export function blob(sx: number, sy: number, sz: number, amount: number, seed: number, segments = 40): BufferGeometry {
  const s = new SphereGeometry(1, segments, Math.round(segments * 0.66));
  s.deleteAttribute('uv');
  s.deleteAttribute('normal');
  const g = mergeVertices(s, 1e-4);
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + amount * Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 2.3 + seed * 2));
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  return g;
}

/** The depth the figure's rectangle is measured at (the vessels' tiers run from -0.32 to 0.54; organs straddle 0). */
export const FIGURE_Z = 0.2;
/** The figure's extent (scene units): the drawn figure's own, the placed organs' box (source.ts VISIBLE_FIGURE_NAMES), what the gestures keep the middle of the free room
 *  inside of, so the figure is never lost, and what the label layer measures the figure's height by. It was the 2D plate's rectangle (x 380 to 1100, y 0 to 1000 by
 *  frame2d.ts), which the placement outgrew at the top (the esophagus, 0.11) and the foot (the bowel and rectum, 0.15) and left 0.21 of nothing on the right (27 Nov, the
 *  2D-plate audit). */
const FIGURE_BOX = boxOfNames(VISIBLE_FIGURE_NAMES).box!;
export const PLATE_BOUNDS = { x0: FIGURE_BOX[0], x1: FIGURE_BOX[3], y0: FIGURE_BOX[1], y1: FIGURE_BOX[4] } as const;
