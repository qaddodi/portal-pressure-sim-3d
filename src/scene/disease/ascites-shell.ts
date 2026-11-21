// The ascites as a body of water (21 Nov 2026; Mohammad: "the ascites is not volumetric; it looks like a curtain in front of the figure"). The pool's front face (ascites.ts) is half of it. This file is the rest of the shell:
//   - the BACK FACE: the pool's own mesh again, SHELL_BACK behind the belly's plane (the same program with POOL_BACK defined: no swell, shifted back), drawn BEFORE the organs;
//   - the WALLS: the cavity's outline below the surface, as a ribbon from the belly's plane back to the back face, the water's side. Both sides are drawn from one mesh: the far inner faces (BackSide) before the organs, so
//     the organs lie in front of them, and the near outer faces (FrontSide) after them, over the organs, exactly as a tank of water is seen. Faces wind outward, so which is which follows from the camera, not from a flag;
//   - the lid (the water's top) is ascites-top.ts.
// All of them use the pool's own uniforms object and the pool's program (defines pick the part), so the ripple, the living switch, the ink, the liver cut and the dim reach every face the same way, and the alpha is
// split between the two layers of any ray (ascites.ts shellHalf) so that, head-on, the layers stack to 2D's one alpha. With Living fluid off none of it is drawn: 2D's flat pool.
// Imports from ascites.ts are read lazily (inside functions): ascites.ts owns the layer that owns these meshes, and the modules import each other.
import { BackSide, BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Mesh, ShaderMaterial, type IUniform, type Side } from 'three';
import { x3, y3 } from '../frame2d.ts';
import * as A from './ascites.ts';

/** A wall point of the cavity below the water: its 2D position and its depth under the surface (2D units). */
export interface WallPoint { x: number; y: number; d: number }

/** The cavity's wall polyline (2D units, y down) cut to the part under the surface: `surfaceY(x)` is the surface's y (2D units) at x. Points where the wall is under the surface keep their depth; where the polyline crosses the
 *  surface a point of depth 0 is added. In the polyline's own order. */
export function wallBelow(poly: readonly (readonly [number, number])[], surfaceY: (x: number) => number): WallPoint[] {
  const out: WallPoint[] = [];
  const depth = (i: number): number => poly[i]![1] - surfaceY(poly[i]![0]);
  const cross = (i: number, j: number): WallPoint => {
    const da = depth(i), db = depth(j), t = da / (da - db), a = poly[i]!, b = poly[j]!;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, d: 0 };
  };
  for (let i = 0; i < poly.length; i++) {
    const d = depth(i), wet = d > 0, was = i > 0 && depth(i - 1) > 0;
    if (wet && i > 0 && !was) out.push(cross(i - 1, i));
    if (wet) out.push({ x: poly[i]![0], y: poly[i]![1], d });
    if (!wet && was) out.push(cross(i - 1, i));
  }
  return out;
}

export class AscitesShell {
  /** back face, far walls, near walls: the first two are drawn before the organs, the third after them. */
  readonly back: Mesh; readonly wallFar: Mesh; readonly wallNear: Mesh;
  private pos = new Float32Array(0); private aD = new Float32Array(0); private aW = new Float32Array(0); private idx = new Uint32Array(0);
  private readonly wall = new BufferGeometry();
  /** The number of wall points laid (for the tests). */
  points = 0;
  constructor(uniforms: Record<string, IUniform>, poolGeometry: BufferGeometry) {
    const mk = (name: string, defines: Record<string, string>, side: Side, g: BufferGeometry, order: number): Mesh => {
      const m = new Mesh(g, new ShaderMaterial({ name, defines, vertexShader: A.POOL_VS, fragmentShader: A.POOL_FS, uniforms, transparent: true, depthWrite: false, depthTest: false, side }));
      m.renderOrder = order; m.frustumCulled = false; m.visible = false; return m;
    };
    this.back = mk('pool-back', { POOL_BACK: '' }, DoubleSide, poolGeometry, A.SHELL_BACK_ORDER);
    this.wallFar = mk('pool-wall-far', { POOL_WALL: '' }, BackSide, this.wall, A.SHELL_BACK_ORDER + 0.01);
    this.wallNear = mk('pool-wall-near', { POOL_WALL: '' }, FrontSide, this.wall, A.POOL_ORDER);
  }
  get meshes(): Mesh[] { return [this.back, this.wallFar, this.wallNear]; }
  /** Lays the wall for the cavity `poly` (2D units) under the surface `surfaceY(x)`. */
  lay(poly: readonly (readonly [number, number])[], surfaceY: (x: number) => number): void {
    const pts = wallBelow(poly, surfaceY), n = pts.length, z0 = A.bellyZ(), z1 = z0 - A.SHELL_BACK;
    if (2 * n > this.pos.length / 3) {
      const cap = 2 * Math.max(n, poly.length + 4);
      this.pos = new Float32Array(cap * 3); this.aD = new Float32Array(cap); this.aW = new Float32Array(cap); this.idx = new Uint32Array(cap * 3);
      this.wall.setAttribute('position', new BufferAttribute(this.pos, 3));
      this.wall.setAttribute('aD', new BufferAttribute(this.aD, 1));
      this.wall.setAttribute('aW', new BufferAttribute(this.aW, 1));
      this.wall.setIndex(new BufferAttribute(this.idx, 1));
    }
    let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
    for (let k = 0; k < n; k++) {
      const p = pts[k]!;
      for (let r = 0; r < 2; r++) { const v = 2 * k + r; this.pos[v * 3] = x3(p.x); this.pos[v * 3 + 1] = y3(p.y); this.pos[v * 3 + 2] = r ? z1 : z0; this.aD[v] = p.d; this.aW[v] = 0; }
    }
    // Faces wind OUTWARD (away from the water's middle), so the far inner faces are the back faces and the near outer faces the front ones. For a quad (front a, front b, back a) with the tangent t = b - a in the
    // scene's x and y and the back face behind (-z), the winding (front a, front b, back a) has the normal (-ty, tx, 0); when that points toward the cavity's centre the other winding is used.
    let ni = 0;
    for (let k = 0; k + 1 < n; k++) {
      const a = pts[k]!, b = pts[k + 1]!, ax = x3(a.x), ay = y3(a.y), tx = x3(b.x) - ax, ty = y3(b.y) - ay;
      const outx = (ax + x3(b.x)) / 2 - x3(cx), outy = (ay + y3(b.y)) / 2 - y3(cy);
      const f0 = 2 * k, b0 = f0 + 1, f1 = f0 + 2, b1 = f0 + 3;
      if (-ty * outx + tx * outy >= 0) this.idx.set([f0, f1, b0, f1, b1, b0], ni); else this.idx.set([f0, b0, f1, f1, b0, b1], ni);
      ni += 6;
    }
    this.wall.setDrawRange(0, ni);
    this.points = n;
    for (const nm of ['position', 'aD', 'aW']) (this.wall.getAttribute(nm) as BufferAttribute).needsUpdate = true;
    if (this.wall.index) this.wall.index.needsUpdate = true;
    this.wall.boundingSphere = null;
  }
  /** The triangles of the wall as laid, for the tests: [a, b, c] vertex indices. */
  get triangles(): [number, number, number][] {
    const out: [number, number, number][] = [], dr = this.wall.drawRange.count;
    for (let i = 0; i + 2 < dr; i += 3) out.push([this.idx[i]!, this.idx[i + 1]!, this.idx[i + 2]!]);
    return out;
  }
  get positions(): Float32Array { return this.pos; }
  show(on: boolean): void { for (const m of this.meshes) m.visible = on; }
  dispose(): void { this.wall.dispose(); for (const m of [this.back, this.wallFar, this.wallNear]) (m.material as ShaderMaterial).dispose(); }
}
