import { BufferGeometry, Shape, ShapeGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToneKey } from '../palette.ts';
import { type Vec3, buildTube } from './vessels.ts';

// Procedural placeholder organs, until the artist's glTF arrives (look-and-feel.md: "the slice judges the look system, the anatomy only as
// placeholder"). Frontal view; the patient's right is on the viewer's left. Same coordinates as vessels.ts.

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

export interface OrganDef {
  id: string;
  tone: ToneKey;
  /** Ink width in px on a Mac or iPad (section 3). */
  px: number;
  geometry: () => BufferGeometry;
  position?: Vec3;
  rotation?: Vec3;
}

const tube = (pts: Vec3[], r: number) => () => buildTube(pts.map((q) => new Vector3(...q)), r, true).geometry;

const sbPoints: Vec3[] = [];
for (let i = 0; i <= 36; i++) sbPoints.push([0.72 * Math.sin(i * 0.62), -0.55 - i * 0.042, 0.22 + 0.1 * Math.cos(i * 0.9)]);

export const ORGANS: readonly OrganDef[] = [
  { id: 'heart', tone: 'heart', px: 1.5, geometry: () => blob(0.55, 0.46, 0.42, 0.05, 3.3), position: [-0.35, 2.55, -0.55] },
  { id: 'liver-right', tone: 'liver', px: 1.8, geometry: () => blob(1.35, 0.95, 0.85, 0.06, 1.3), position: [-0.8, 1.05, -0.15], rotation: [0, 0, -0.16] },
  { id: 'liver-left', tone: 'liver', px: 1.8, geometry: () => blob(0.95, 0.5, 0.55, 0.05, 2.2), position: [0.5, 1.28, 0], rotation: [0, 0, -0.28] },
  { id: 'spleen', tone: 'spleen', px: 1.8, geometry: () => blob(0.38, 0.62, 0.3, 0.05, 2.1), position: [1.9, 1.0, -0.45], rotation: [0, 0, 0.5] },
  { id: 'stomach', tone: 'stomach', px: 1.5, geometry: tube([[0.55, 1.75, 0.05], [1.05, 1.45, 0.25], [1.28, 0.95, 0.3], [1.0, 0.5, 0.35], [0.45, 0.55, 0.4]], 0.3) },
  { id: 'oesophagus', tone: 'stomach', px: 1.5, geometry: tube([[0.55, 1.75, 0.05], [0.42, 2.25, -0.2], [0.3, 2.9, -0.4]], 0.11) },
  { id: 'colon', tone: 'gut', px: 1.5, geometry: tube([[-1.35, -2.2, 0.05], [-1.45, -0.9, 0.12], [-1.25, -0.15, 0.25], [0, -0.05, 0.35], [1.25, -0.15, 0.25], [1.5, -0.9, 0.12], [1.35, -2.2, 0.05]], 0.24) },
  { id: 'small-bowel', tone: 'gut', px: 1.4, geometry: tube(sbPoints, 0.16) },
];

/** Small oesophageal varices (small parts: 2 bands, thin ink). Shown from the pick on, they ride the lower oesophagus. */
export const VARICES: readonly { angle: number; y: number; r: number }[] = [
  { angle: 0.2, y: 1.95, r: 0.05 }, { angle: 2.2, y: 2.05, r: 0.045 }, { angle: 4.1, y: 2.12, r: 0.05 }, { angle: 5.4, y: 1.98, r: 0.04 },
];

/** The flat body plate behind the organs: no shading, no ink, so the figure reads as a plate in a book. */
export function bodyPlateGeometry(): ShapeGeometry {
  const torso = new Shape();
  torso.moveTo(-2.3, -2.7);
  torso.bezierCurveTo(-2.5, -1, -2.6, 1.2, -2.35, 2.4);
  torso.bezierCurveTo(-2.1, 3.0, -1.2, 3.25, 0, 3.3);
  torso.bezierCurveTo(1.2, 3.25, 2.1, 3.0, 2.35, 2.4);
  torso.bezierCurveTo(2.6, 1.2, 2.5, -1, 2.3, -2.7);
  torso.closePath();
  return new ShapeGeometry(torso, 32);
}
export const BODY_PLATE_Z = -1.35;
/** The plate's extent (scene units): what the gestures keep the middle of the free room inside of, so the figure is never lost. */
export const PLATE_BOUNDS = { x0: -2.6, x1: 2.6, y0: -2.7, y1: 3.3 } as const;
