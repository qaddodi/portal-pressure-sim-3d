// Liquify live (the editor only): the strokes the draft adds to an organ are applied to its on-screen geometry as they are made, the same falloff and per-vertex clamp as organ-apply.ts,
// so what shows is what Save builds. The geometry on screen is the organ built with the loaded edit (L); the strokes are written in the reference frame, so each vertex is taken back to it
// (toReference), pulled there, and the pull carried back through L (scale and turn). One stroke costs one pass over the vertices; an undo or a cleared list rebuilds from the start.
import { type BufferGeometry, Float32BufferAttribute } from 'three';
import { LIQUIFY_LIMIT, type Cage, type OrganEdit, type Stroke, type V3 } from '../../../editor/types.ts';
import { cageDisplace, clampEdit, organBox, softLimit3, wendland, type Box } from '../../../editor/organ-apply.ts';
import { smoothRestNormals } from '../../../scene/organs/normal-smooth.ts';
import { toReference } from './state.ts';

export class LiveStrokes {
  private readonly base: Float32Array;     // the built positions (L), kept
  private readonly ref: Float32Array;      // each vertex in the reference frame
  private readonly sum: Float32Array;      // the raw (unclamped) pull of the applied strokes, reference frame
  private applied: readonly Stroke[] = [];
  private readonly k: number; private readonly cs: number; private readonly sn: number;
  readonly firstNew: number;
  private readonly loadedCage: Cage | null;
  private readonly box: Box;

  private readonly g: BufferGeometry;
  constructor(g: BufferGeometry, loaded: OrganEdit | undefined, centroid: V3, box?: Box) {
    const a = g.getAttribute('position').array as Float32Array;
    this.g = g; this.base = Float32Array.from(a); this.ref = new Float32Array(a.length); this.sum = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) { const r = toReference([a[i]!, a[i + 1]!, a[i + 2]!], loaded, centroid); this.ref[i] = r[0]; this.ref[i + 1] = r[1]; this.ref[i + 2] = r[2]; }
    const e = clampEdit(loaded ?? {});
    this.k = e.scale; this.cs = Math.cos(e.rotY); this.sn = Math.sin(e.rotY);
    this.firstNew = e.strokes.length; this.loadedCage = e.cage; this.box = box ?? organBox(g);
  }

  private add(s: Stroke): void {
    const r = this.ref, sum = this.sum, n = r.length;
    for (let i = 0; i < n; i += 3) {
      const d = Math.hypot(r[i]! - s.at[0], r[i + 1]! - s.at[1], r[i + 2]! - s.at[2]);
      if (d >= s.radius) continue;
      const w = wendland(d / s.radius);
      sum[i] += s.by[0] * w; sum[i + 1] += s.by[1] * w; sum[i + 2] += s.by[2] * w;
    }
  }
  /** Shows `strokes` (the draft's list; the first `firstNew` are the loaded edit's, already in the geometry) on the geometry. Cheap when the list only grew. */
  set(strokes: readonly Stroke[] | undefined, cage?: Cage): void {
    const nowCage = cage ? clampEdit({ cage }).cage : null;
    const list = (strokes ?? []).slice(this.firstNew);
    const prefix = this.applied.length <= list.length && this.applied.every((s, i) => s === list[i]);
    if (!prefix) { this.sum.fill(0); this.applied = []; }
    for (let i = this.applied.length; i < list.length; i++) this.add(list[i]!);
    this.applied = list;
    const a = this.g.getAttribute('position').array as Float32Array, b = this.base, s = this.sum;
    for (let i = 0; i < a.length; i += 3) {
      let dx = s[i]!, dy = s[i + 1]!, dz = s[i + 2]!;
      [dx, dy, dz] = softLimit3(dx, dy, dz, LIQUIFY_LIMIT);
      if (nowCage || this.loadedCage) {   // (the cage's change since the loaded edit, at the vertex's reference place: the geometry already holds the loaded cage's pull)
        const p: V3 = [this.ref[i]!, this.ref[i + 1]!, this.ref[i + 2]!];
        const n = nowCage ? cageDisplace(nowCage, this.box, p) : [0, 0, 0], l0 = this.loadedCage ? cageDisplace(this.loadedCage, this.box, p) : [0, 0, 0];
        dx += n[0]! - l0[0]!; dy += n[1]! - l0[1]!; dz += n[2]! - l0[2]!;
      }
      // the pull is in the reference frame; the geometry shows it through L: scale, then the turn about Y (organ-apply.ts)
      a[i] = b[i]! + (dx * this.cs + dz * this.sn) * this.k; a[i + 1] = b[i + 1]! + dy * this.k; a[i + 2] = b[i + 2]! + (-dx * this.sn + dz * this.cs) * this.k;
    }
    this.g.getAttribute('position').needsUpdate = true;
    this.g.computeVertexNormals();
    this.g.computeBoundingBox(); this.g.boundingSphere = null;
  }
  /** When the hand lets go: the smoothed rest normals the shading reads (shadeN, hullN) are redone too (a few passes over the mesh: not every frame). */
  settle(): void {
    const g = this.g, a = g.getAttribute('position').array as Float32Array, nrm = g.getAttribute('normal').array, idx = g.index ? g.index.array : [];
    if (g.getAttribute('shadeN')) g.setAttribute('shadeN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx, 6), 3));
    if (g.getAttribute('hullN')) g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx), 3));
  }
}
