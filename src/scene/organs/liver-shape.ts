// The cirrhotic liver's shape on the 3D mesh: the 2D figure's own displacement field (liver-morph.js liverField: the right lobe draws toward the hilum, the left
// lobe grows) applied to every vertex in the 2D plane, and the regenerative nodules as bumps along the normal, larger and deeper with scarring (CIRR.nod, liverSurface).
// The mesh keeps its z; the 2D figure's own rule is that the vessels never move, so the field is gentle (CIRR.field 0.5).
import { CIRR, liverField, liverSurface } from '../disease/copied/liver-morph.js';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import { domeAt, noduleBumpAt, rimScale, surfaceAt } from './liver-texture.ts';


/** Nodule bump height at full strength, scene units (the 2D nodules stand out about 2 to 3 units: 0.01). */
export const NODULE_HEIGHT = 0.011;
/** How far a nodule at the liver's rim stands out of its outline at full scarring, scene units (about 4 units of the 2D figure: a scalloped edge, never inward, so the vessels keep their margin). */
export const RIM_HEIGHT = 0.014;
/** The nodule bump (0..1) at a point of the 2D plane: 1 at the middle of a nodule, 0 on a wall (liver-texture.ts). */
export const noduleBump = noduleBumpAt;
/** The pale fibrous septum (0..1) at a point of the 2D plane; the shader draws it per pixel from the baked texture, this is the same number for the tests. */
export const septumAt = (x: number, y: number): number => surfaceAt(x, y).sep;

/** How much of a nodule's sideways push a vertex takes: 0 where its normal lies in the figure's plane (the rim), 1 where it faces the viewer (|n.z| from 0.3 to 0.75). */
export function edgeFree(nz: number): number {
  const t = Math.min(1, Math.max(0, (nz - 0.3) / 0.45));
  return t * t * (3 - 2 * t);
}

export class LiverShape {
  private rest: Float32Array;
  private normals: Float32Array;
  private lastC = NaN;
  readonly position: { array: Float32Array; needsUpdate: boolean };
  constructor(position: { array: Float32Array; needsUpdate: boolean }, normals: ArrayLike<number>) {
    this.position = position;
    this.rest = Float32Array.from(position.array);
    this.normals = Float32Array.from(normals);
  }
  /** Writes the shape for scarring `c` (0..1) into the position buffer; false when nothing changed (the caller recomputes normals only on true). */
  apply(c: number): boolean {
    if (c === this.lastC) return false;
    this.lastC = c;
    const pos = this.position.array, r = this.rest, n = this.normals;
    const nodS = liverSurface(c).nod, bump = nodS * NODULE_HEIGHT;
    for (let i = 0; i < r.length; i += 3) {
      const x0 = r[i]!, y0 = r[i + 1]!;
      const f = liverField(x2d(x0), y2d(y0), c);
      let x = x3(f[0]!), y = y3(f[1]!);
      if (bump > 0) {
        const h = bump * noduleBumpAt(x2d(x0), y2d(y0));
        // the bumps push along the normal, but not sideways at the edge: there the normal lies in the plane, the rim's samples (one every 2.5 units) would each be pushed by a different cell's bump, and the liver's outline came out as a saw-tooth
        const k = edgeFree(Math.abs(n[i + 2]!));
        x += n[i]! * h * k; y += n[i + 1]! * h * k;
        // the outline is nodular too (Mohammad 20 Nov): at the rim the nodules stand out along the in-plane normal, by the same dome the surface has, so the edge is scalloped by the same cells. Outward only.
        {
          const m = Math.hypot(n[i]!, n[i + 1]!);
          if (m > 1e-3) { const r = (1 - k) * RIM_HEIGHT * rimScale() * nodS * domeAt(x2d(x0), y2d(y0)) / m; x += n[i]! * r; y += n[i + 1]! * r; }
        }
        pos[i + 2] = r[i + 2]! + n[i + 2]! * h;
      } else pos[i + 2] = r[i + 2]!;
      pos[i] = x; pos[i + 1] = y;
    }
    this.position.needsUpdate = true;
    return true;
  }
}
