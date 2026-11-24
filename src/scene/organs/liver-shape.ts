// The cirrhotic liver's shape on the 3D mesh: the 2D figure's own displacement field (liver-morph.js liverField: the right lobe draws toward the hilum, the left
// lobe grows) applied to every vertex in the 2D plane, and the regenerative nodules as bumps along the normal, larger and deeper with scarring (CIRR.nod, liverSurface).
// The mesh keeps its z; the 2D figure's own rule is that the vessels never move, so the field is gentle (CIRR.field 0.5).
import { CIRR, liverField, liverSurface } from '../disease/copied/liver-morph.js';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import { noduleBumpAt, rimDomeAt, rimScale, surfaceAt } from './liver-texture.ts';
import { type PlaneMap, mapX, mapY, unmapX, unmapY } from './placed-map.ts';


import { clock } from '../../clock/frame.ts';
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
  /** What depends on a vertex's REST place only, never on the scarring (the nodule's height there, the share of it that goes sideways, the rim's scallop): found once, on the first frame that needs it, so a frame of the easing is arithmetic, not a height field per vertex (root cause of the 90 to 690 ms frames of a patient glide: 13.7 k vertices x a noise field, every frame). */
  private nb: Float32Array | null = null; private nbk!: Float32Array; private rk!: Float32Array;
  readonly position: { array: Float32Array; needsUpdate: boolean };
  /** The liver's move with the approved placement (placed-map.ts; the identity with the switch off): the 2D field and the texture are read where the 2D figure has this point, and the shape is laid back where the liver is. */
  private readonly map: PlaneMap;
  constructor(position: { array: Float32Array; needsUpdate: boolean }, normals: ArrayLike<number>, map: PlaneMap = { sx: 1, ox: 0, oy: 0 }) {
    this.position = position; this.map = map;
    this.rest = Float32Array.from(position.array);
    this.normals = Float32Array.from(normals);
  }
  private baked = 0;
  /** Finds the rest-place numbers for vertices from where it stopped, for at most `ms` (0: all of them). True when every vertex has them. The organ layer calls it in idle slices after the liver is built, so the first scarred frame finds it done (apply finishes what is left if not). */
  warm(ms = 0): boolean {
    const r = this.rest, n = this.normals, cnt = r.length / 3;
    if (!this.nb) { this.nb = new Float32Array(cnt); this.nbk = new Float32Array(cnt); this.rk = new Float32Array(cnt); }
    const t0 = clock.now();
    while (this.baked < cnt) {
      for (let e = Math.min(cnt, this.baked + 256); this.baked < e; this.baked++) {
        const v = this.baked, i = v * 3, x2 = x2d(unmapX(this.map, r[i]!)), y2 = y2d(unmapY(this.map, r[i + 1]!)), h = noduleBumpAt(x2, y2), k = edgeFree(Math.abs(n[i + 2]!)), m = Math.hypot(n[i]!, n[i + 1]!);
        this.nb[v] = h; this.nbk[v] = h * k;
        this.rk[v] = m > 1e-3 ? ((1 - k) * rimDomeAt(x2, y2)) / m : 0;
      }
      if (ms > 0 && clock.now() - t0 >= ms) break;
    }
    return this.baked >= cnt;
  }
  /** Writes the shape for scarring `c` (0..1) into the position buffer; false when nothing changed (the caller recomputes normals only on true). */
  apply(c: number): boolean {
    if (c === this.lastC) return false;
    this.lastC = c;
    const pos = this.position.array, r = this.rest, n = this.normals;
    const nodS = liverSurface(c).nod, bump = nodS * NODULE_HEIGHT;
    if (bump > 0) this.warm();
    const nb = this.nb!, nbk = this.nbk, rk = this.rk, rim = bump > 0 ? RIM_HEIGHT * rimScale() * nodS : 0;
    for (let v = 0, i = 0; i < r.length; v++, i += 3) {
      const m = this.map, f = liverField(x2d(unmapX(m, r[i]!)), y2d(unmapY(m, r[i + 1]!)), c);
      let x = mapX(m, x3(f[0]!)), y = mapY(m, y3(f[1]!));
      if (bump > 0) {
        // the bumps push along the normal, but not sideways at the edge (nbk: the nodule's height times the share of its sideways push, edgeFree), and the outline is nodular too (Mohammad 20 Nov): at the rim the nodules stand out along the in-plane normal by the same dome (rk), outward only
        const hk = bump * nbk[v]!, rr = rim * rk[v]!;
        x += n[i]! * (hk + rr); y += n[i + 1]! * (hk + rr);
        pos[i + 2] = r[i + 2]! + n[i + 2]! * bump * nb[v]!;
      } else pos[i + 2] = r[i + 2]!;
      pos[i] = x; pos[i + 1] = y;
    }
    this.position.needsUpdate = true;
    return true;
  }
}
