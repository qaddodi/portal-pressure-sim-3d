// Geometry batches for the lobule and sinusoid views: many tubes and blobs merged into one BufferGeometry, so a whole kind of part is two draw
// calls (ink and toon). Built from plain numbers; three's geometry classes only (no renderer), so the unit tests build them in node.
// Every vertex carries what the cel shaders read: position, normal, uv and `tang` (the unit tangent the flow chevrons use).
//   uv.x  per tube, set by the caller's `uvx(i, arc)`: arc length in chevron pitches for chevrons; the distance from the lobule's centre for
//         the amber wash (the toon pass cuts at `reveal`); anything the part needs.
//   uv.y  angle round the tube, 0..1.
import { BufferGeometry, Float32BufferAttribute, Matrix3, Matrix4, type SphereGeometry, Vector3 } from 'three';

export type V3 = [number, number, number];

export interface TubeOptions {
  /** Radius, constant or by point index. */
  radius: number | ((i: number, n: number) => number);
  /** uv.x at point i, given the arc length so far (scene units). Default: arc length. */
  uvx?: (i: number, arc: number) => number;
  /** Sides round the tube. */
  radial?: number;
  /** Flat caps at both ends (axial vessels seen end-on). */
  capped?: boolean;
}

export class Batch {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private tan: number[] = [];
  private idx: number[] = [];
  private count = 0;

  get vertices(): number { return this.count; }

  /** A tube along a polyline (parallel-transport frames, no twist). Returns its length. */
  tube(pts: readonly V3[], o: TubeOptions): number {
    const n = pts.length, radial = o.radial ?? 8;
    if (n < 2) return 0;
    const P = pts.map((p) => new Vector3(...p));
    const T: Vector3[] = P.map((p, i) => P[Math.min(n - 1, i + 1)]!.clone().sub(P[Math.max(0, i - 1)]!).normalize());
    // first normal: any vector not parallel to the first tangent
    const up = Math.abs(T[0]!.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    let N = up.clone().sub(T[0]!.clone().multiplyScalar(up.dot(T[0]!))).normalize();
    let arc = 0;
    const base = this.count;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        arc += P[i]!.distanceTo(P[i - 1]!);
        // transport the normal: remove its component along the new tangent
        N = N.clone().sub(T[i]!.clone().multiplyScalar(N.dot(T[i]!)));
        if (N.lengthSq() < 1e-12) N = new Vector3(0, 0, 1).sub(T[i]!.clone().multiplyScalar(T[i]!.z));
        N.normalize();
      }
      const B = new Vector3().crossVectors(T[i]!, N);
      const r = typeof o.radius === 'number' ? o.radius : o.radius(i, n);
      const ux = o.uvx ? o.uvx(i, arc) : arc;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        this.pos.push(P[i]!.x + nx * r, P[i]!.y + ny * r, P[i]!.z + nz * r);
        this.nor.push(nx, ny, nz);
        this.uv.push(ux, j / radial);
        this.tan.push(T[i]!.x, T[i]!.y, T[i]!.z);
        this.count++;
      }
    }
    const ring = radial + 1;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = base + i * ring + j, b = a + ring, c = b + 1, d = a + 1;
      this.idx.push(a, d, b, b, d, c);   // (counter-clockwise seen from outside: the toon pass draws front faces only, so a tube wound the other way is drawn as ink alone)
    }
    if (o.capped) {
      for (const end of [0, n - 1]) {
        const sign = end === 0 ? -1 : 1, axis = T[end]!.clone().multiplyScalar(sign);
        const ux = o.uvx ? o.uvx(end, end === 0 ? 0 : arc) : (end === 0 ? 0 : arc);
        const centre = this.count;
        this.pos.push(P[end]!.x, P[end]!.y, P[end]!.z); this.nor.push(axis.x, axis.y, axis.z); this.uv.push(ux, 0.5); this.tan.push(T[end]!.x, T[end]!.y, T[end]!.z); this.count++;
        const first = this.count;
        const r = typeof o.radius === 'number' ? o.radius : o.radius(end, n);
        const B = new Vector3().crossVectors(T[end]!, new Vector3(Math.abs(T[end]!.y) < 0.9 ? 0 : 1, Math.abs(T[end]!.y) < 0.9 ? 1 : 0, 0)).normalize();
        const Nn = new Vector3().crossVectors(B, T[end]!).normalize();
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          this.pos.push(P[end]!.x + (Nn.x * c + B.x * s) * r, P[end]!.y + (Nn.y * c + B.y * s) * r, P[end]!.z + (Nn.z * c + B.z * s) * r);
          this.nor.push(axis.x, axis.y, axis.z); this.uv.push(ux, j / radial); this.tan.push(T[end]!.x, T[end]!.y, T[end]!.z); this.count++;
        }
        for (let j = 0; j < radial; j++) { if (end === 0) this.idx.push(centre, first + j + 1, first + j); else this.idx.push(centre, first + j, first + j + 1); }
      }
    }
    return arc;
  }

  /** A transformed copy of a three geometry (a sphere for a cell, a ring for a collagen collar), with a fixed uv.x. */
  shape(g: BufferGeometry | SphereGeometry, m: Matrix4, uvx = 0, tang: V3 = [1, 0, 0]): void {
    const p = g.getAttribute('position'), nm = g.getAttribute('normal'), ix = g.getIndex();
    const nmat = new Matrix3().getNormalMatrix(m);
    const v = new Vector3(), w = new Vector3();
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      w.fromBufferAttribute(nm, i).applyMatrix3(nmat).normalize();
      this.pos.push(v.x, v.y, v.z); this.nor.push(w.x, w.y, w.z); this.uv.push(uvx, 0.5); this.tan.push(...tang);
      this.count++;
    }
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('tang', new Float32BufferAttribute(this.tan, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
