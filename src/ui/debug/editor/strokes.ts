// Live organ edits (the editor only): the strokes, the cage and the grid the draft adds to an organ are applied to its on-screen geometry as they are made, with the arithmetic of organ-apply.ts,
// so what shows is what Save builds. The geometry on screen is the organ built with the loaded edit (L); the edits are written in the reference frame, so each vertex is taken back to it
// (toReference), pulled there, and the pull carried back through L (scale and turn).
// Cost (audit 21): a stroke touches only the vertices inside its radius, found through a spatial index of the reference places; a cage drag moves one handle, whose share at a vertex is three small weights;
// positions are written only where something changed, and the normals are redone only for the faces round those vertices (a cage drag moves them all: one pass). One pass per call; the panel calls once a frame.
import { type BufferGeometry, Float32BufferAttribute } from 'three';
import { CAGE_LIMIT, type Cage, type Grid, type OrganEdit, type Stroke, type V3, LIQUIFY_LIMIT } from '../../../editor/types.ts';
import { cageBox, cageDisplace, cageWeights, clampEdit, gridSample, organBox, resolveEdit, softLimit, softLimit3, strokeDisplace, wendland, type Box } from '../../../editor/organ-apply.ts';
import { smoothRestNormals } from '../../../scene/organs/normal-smooth.ts';
import { toReference } from './state.ts';

const CELLS = 20;   // the spatial index: cells along the longest side of the organ

export class LiveStrokes {
  private readonly g: BufferGeometry;
  private readonly n: number;
  private readonly base: Float32Array;     // the built positions (L), kept
  private readonly ref: Float32Array;      // each vertex in the reference frame
  private readonly sum: Float32Array;      // the raw (unlimited) pull of the applied strokes, reference frame
  private readonly lt: Float32Array;       // what the loaded edit's strokes and grid already pulled (in `base`)
  private readonly cl: Float32Array;       // what the loaded edit's cage already pulled
  private readonly gridNow: Float32Array;
  private readonly cageNow: Float32Array;
  private applied: readonly Stroke[] = [];
  private gridSeen: Grid | undefined = undefined; private cageSeen: Cage | undefined = undefined;
  private readonly k: number; private readonly cs: number; private readonly sn: number;
  private readonly box: Box;
  // spatial index (cell -> vertices) and which vertices the applied strokes touched
  private readonly lo: V3; private readonly cell: number; private readonly dim: [number, number, number];
  private readonly cellStart: Int32Array; private readonly cellVerts: Int32Array;
  private sumTouched: number[] = []; private readonly sumFlag: Uint8Array;
  // faces round each vertex, and each face's area-weighted normal as last computed (what computeVertexNormals adds up)
  private vfStart: Int32Array | null = null; private vf: Int32Array | null = null; private faceCross: Float32Array | null = null;
  /** Vertices the last `set` moved (all of them when `all`), for tests and the panel's counters. */
  lastMoved = 0;
  private started = false;

  constructor(g: BufferGeometry, loaded: OrganEdit | undefined, centroid: V3, box?: Box) {
    const a = g.getAttribute('position').array as Float32Array, n = a.length / 3;
    this.g = g; this.n = n; this.base = Float32Array.from(a); this.ref = new Float32Array(a.length);
    this.sum = new Float32Array(a.length); this.lt = new Float32Array(a.length); this.cl = new Float32Array(a.length); this.gridNow = new Float32Array(a.length); this.cageNow = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) { const r = toReference([a[i]!, a[i + 1]!, a[i + 2]!], loaded, centroid); this.ref[i] = r[0]; this.ref[i + 1] = r[1]; this.ref[i + 2] = r[2]; }
    const e = clampEdit(resolveEdit(loaded ?? {}));
    this.k = e.scale; this.cs = Math.cos(e.rotY); this.sn = Math.sin(e.rotY);
    this.box = box ?? organBox(g);
    this.sumFlag = new Uint8Array(n);
    // the loaded edit's own pull, once (the exact arithmetic of the build: organ-apply strokeDisplace reads strokes and grid the way applyOrganEdit does)
    if (loaded && (loaded.strokes?.length || loaded.grid)) for (let i = 0; i < a.length; i += 3) { const d = strokeDisplace(loaded, [this.ref[i]!, this.ref[i + 1]!, this.ref[i + 2]!]); this.lt[i] = d[0]; this.lt[i + 1] = d[1]; this.lt[i + 2] = d[2]; }
    if (e.cage) for (let i = 0; i < a.length; i += 3) { const d = cageDisplace(e.cage, this.box, [this.ref[i]!, this.ref[i + 1]!, this.ref[i + 2]!]); this.cl[i] = d[0]; this.cl[i + 1] = d[1]; this.cl[i + 2] = d[2]; }
    // the spatial index
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3) for (let c = 0; c < 3; c++) { const v = this.ref[i + c]!; if (v < lo[c]!) lo[c] = v; if (v > hi[c]!) hi[c] = v; }
    this.lo = [lo[0]!, lo[1]!, lo[2]!];
    this.cell = Math.max(1e-6, Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / CELLS);
    this.dim = [Math.floor((hi[0]! - lo[0]!) / this.cell) + 1, Math.floor((hi[1]! - lo[1]!) / this.cell) + 1, Math.floor((hi[2]! - lo[2]!) / this.cell) + 1];
    const cells = this.dim[0] * this.dim[1] * this.dim[2], count = new Int32Array(cells + 1), where = new Int32Array(n);
    for (let v = 0; v < n; v++) { const c = this.cellOf(this.ref[3 * v]!, this.ref[3 * v + 1]!, this.ref[3 * v + 2]!); where[v] = c; count[c + 1]!++; }
    for (let c = 0; c < cells; c++) count[c + 1]! += count[c]!;
    this.cellStart = count; this.cellVerts = new Int32Array(n);
    const fill = count.slice(0, cells);
    for (let v = 0; v < n; v++) this.cellVerts[fill[where[v]!]!++] = v;
  }

  private cellOf(x: number, y: number, z: number): number {
    const ix = Math.min(this.dim[0] - 1, Math.max(0, Math.floor((x - this.lo[0]) / this.cell))), iy = Math.min(this.dim[1] - 1, Math.max(0, Math.floor((y - this.lo[1]) / this.cell))), iz = Math.min(this.dim[2] - 1, Math.max(0, Math.floor((z - this.lo[2]) / this.cell)));
    return ix + this.dim[0] * (iy + this.dim[1] * iz);
  }
  /** Calls `f(v)` for every vertex whose reference place is within `r` of `at`. */
  private near(at: V3, r: number, f: (v: number) => void): void {
    const c0 = [0, 1, 2].map((c) => Math.max(0, Math.floor((at[c]! - r - this.lo[c]!) / this.cell))), c1 = [0, 1, 2].map((c) => Math.min(this.dim[c]! - 1, Math.floor((at[c]! + r - this.lo[c]!) / this.cell)));
    const rr = r * r, ref = this.ref;
    for (let iz = c0[2]!; iz <= c1[2]!; iz++) for (let iy = c0[1]!; iy <= c1[1]!; iy++) for (let ix = c0[0]!; ix <= c1[0]!; ix++) {
      const c = ix + this.dim[0] * (iy + this.dim[1] * iz);
      for (let q = this.cellStart[c]!; q < this.cellStart[c + 1]!; q++) {
        const v = this.cellVerts[q]!, dx = ref[3 * v]! - at[0], dy = ref[3 * v + 1]! - at[1], dz = ref[3 * v + 2]! - at[2];
        if (dx * dx + dy * dy + dz * dz < rr) f(v);
      }
    }
  }

  /** Shows the draft (`strokes`, `cage`, `grid` as the draft has them) on the geometry. Cheap when only a stroke or a handle changed. */
  set(strokes: readonly Stroke[] | undefined, cage?: Cage, grid?: Grid): void {
    const list = strokes ?? [], n = this.n, dirty: number[] = [], flag = new Uint8Array(n);
    let all = !this.started;   // (the first call shows the whole draft, whatever it differs from)
    this.started = true;
    const mark = (v: number): void => { if (!flag[v]) { flag[v] = 1; dirty.push(v); } };
    const touch = (v: number): void => { if (!this.sumFlag[v]) { this.sumFlag[v] = 1; this.sumTouched.push(v); } mark(v); };
    // strokes: only what is new, unless the list is no longer an extension of what is applied (an undo, a fold)
    if (!(this.applied.length <= list.length && this.applied.every((s, i) => s === list[i]))) {
      for (const v of this.sumTouched) { this.sum[3 * v] = 0; this.sum[3 * v + 1] = 0; this.sum[3 * v + 2] = 0; this.sumFlag[v] = 0; mark(v); }
      this.sumTouched = []; this.applied = [];
    }
    for (let i = this.applied.length; i < list.length; i++) {
      const s = list[i]!;
      this.near(s.at, s.radius, (v) => {
        const d = Math.hypot(this.ref[3 * v]! - s.at[0], this.ref[3 * v + 1]! - s.at[1], this.ref[3 * v + 2]! - s.at[2]), w = wendland(d / s.radius);
        this.sum[3 * v] += s.by[0] * w; this.sum[3 * v + 1] += s.by[1] * w; this.sum[3 * v + 2] += s.by[2] * w; touch(v);
      });
    }
    this.applied = list;
    // the grid: read once per grid object (a fold or an undo past one)
    if (grid !== this.gridSeen) {
      const cl = clampEdit({ grid }).grid;
      for (let v = 0; v < n; v++) { const d = cl ? gridSample(cl, [this.ref[3 * v]!, this.ref[3 * v + 1]!, this.ref[3 * v + 2]!]) : [0, 0, 0]; this.gridNow[3 * v] = d[0]!; this.gridNow[3 * v + 1] = d[1]!; this.gridNow[3 * v + 2] = d[2]!; }
      this.gridSeen = grid; all = true;
    }
    // the cage: one handle moved is three weights a vertex; a new cage (other dims, or the first) is a full pass
    if (cage !== this.cageSeen) {
      const nowC = clampEdit({ cage }).cage, was = clampEdit({ cage: this.cageSeen }).cage;
      if (!nowC || !was || nowC.n.some((m, i) => m !== was.n[i])) {
        for (let v = 0; v < n; v++) { const d = nowC ? cageDisplace(nowC, this.box, [this.ref[3 * v]!, this.ref[3 * v + 1]!, this.ref[3 * v + 2]!]) : [0, 0, 0]; this.cageNow[3 * v] = d[0]!; this.cageNow[3 * v + 1] = d[1]!; this.cageNow[3 * v + 2] = d[2]!; }
      } else {
        const size = cageBox(this.box), lim = [0, 1, 2].map((c) => (size.hi[c]! - size.lo[c]!) * CAGE_LIMIT), [nx, ny] = nowC.n, changed: [number, number, number, number, number, number][] = [];
        nowC.d.forEach((h, idx) => { const o = was.d[idx]!; if (h[0] !== o[0] || h[1] !== o[1] || h[2] !== o[2]) changed.push([idx, softLimit(h[0], lim[0]!) - softLimit(o[0], lim[0]!), softLimit(h[1], lim[1]!) - softLimit(o[1], lim[1]!), softLimit(h[2], lim[2]!) - softLimit(o[2], lim[2]!), 0, 0]); });
        const wx: number[] = [], wy: number[] = [], wz: number[] = [];
        for (let v = 0; v < n; v++) {
          cageWeights(nowC.n, this.box, [this.ref[3 * v]!, this.ref[3 * v + 1]!, this.ref[3 * v + 2]!], wx, wy, wz);
          for (const [idx, ax, ay, az] of changed) { const i = idx % nx, j = Math.floor(idx / nx) % ny, k = Math.floor(idx / (nx * ny)), w = wx[i]! * wy[j]! * wz[k]!; this.cageNow[3 * v] += w * ax; this.cageNow[3 * v + 1] += w * ay; this.cageNow[3 * v + 2] += w * az; }
        }
      }
      this.cageSeen = cage; all = true;
    }
    // positions: only where something changed
    const a = this.g.getAttribute('position').array as Float32Array, b = this.base, s = this.sum;
    const put = (v: number): void => {
      const i = 3 * v, [px, py, pz] = softLimit3(s[i]!, s[i + 1]!, s[i + 2]!, LIQUIFY_LIMIT);
      const dx = px + this.gridNow[i]! + this.cageNow[i]! - this.lt[i]! - this.cl[i]!, dy = py + this.gridNow[i + 1]! + this.cageNow[i + 1]! - this.lt[i + 1]! - this.cl[i + 1]!, dz = pz + this.gridNow[i + 2]! + this.cageNow[i + 2]! - this.lt[i + 2]! - this.cl[i + 2]!;
      // the pull is in the reference frame; the geometry shows it through L: scale, then the turn about Y (organ-apply.ts)
      a[i] = b[i]! + (dx * this.cs + dz * this.sn) * this.k; a[i + 1] = b[i + 1]! + dy * this.k; a[i + 2] = b[i + 2]! + (-dx * this.sn + dz * this.cs) * this.k;
    };
    if (all) for (let v = 0; v < n; v++) put(v); else for (const v of dirty) put(v);
    this.lastMoved = all ? n : dirty.length;
    this.g.getAttribute('position').needsUpdate = true;
    if (all || !this.g.index || dirty.length > n / 4) { this.g.computeVertexNormals(); this.faceCross = null; } else if (dirty.length) this.normals(dirty);
    this.g.computeBoundingBox(); this.g.boundingSphere = null;
  }

  /** The normals of the vertices on faces that touch `moved`, from the faces' area-weighted normals (what computeVertexNormals sums), and nothing else. */
  private normals(moved: readonly number[]): void {
    const g = this.g, idx = g.index!.array, p = g.getAttribute('position').array as Float32Array, nrm = g.getAttribute('normal').array as Float32Array, nf = idx.length / 3;
    if (!this.vfStart) {   // (once: the faces round each vertex)
      const start = new Int32Array(this.n + 1);
      for (let t = 0; t < idx.length; t++) start[idx[t]! + 1]!++;
      for (let v = 0; v < this.n; v++) start[v + 1]! += start[v]!;
      const fill = start.slice(0, this.n), vf = new Int32Array(idx.length);
      for (let f = 0; f < nf; f++) for (let c = 0; c < 3; c++) vf[fill[idx[3 * f + c]!]!++] = f;
      this.vfStart = start; this.vf = vf;
    }
    const vfStart = this.vfStart, vf = this.vf!, cross = (f: number): void => {
      const A = idx[3 * f]!, B = idx[3 * f + 1]!, C = idx[3 * f + 2]!, fc = this.faceCross!;
      const ux = p[3 * C]! - p[3 * B]!, uy = p[3 * C + 1]! - p[3 * B + 1]!, uz = p[3 * C + 2]! - p[3 * B + 2]!, vx = p[3 * A]! - p[3 * B]!, vy = p[3 * A + 1]! - p[3 * B + 1]!, vz = p[3 * A + 2]! - p[3 * B + 2]!;
      fc[3 * f] = uy * vz - uz * vy; fc[3 * f + 1] = uz * vx - ux * vz; fc[3 * f + 2] = ux * vy - uy * vx;
    };
    if (!this.faceCross) { this.faceCross = new Float32Array(nf * 3); for (let f = 0; f < nf; f++) cross(f); }   // (after a whole-mesh pass: every face again)
    const faces = new Set<number>(), verts = new Set<number>();
    for (const v of moved) for (let q = vfStart[v]!; q < vfStart[v + 1]!; q++) faces.add(vf[q]!);
    for (const f of faces) { cross(f); verts.add(idx[3 * f]!); verts.add(idx[3 * f + 1]!); verts.add(idx[3 * f + 2]!); }
    const fc = this.faceCross;
    for (const v of verts) {
      let x = 0, y = 0, z = 0;
      for (let q = vfStart[v]!; q < vfStart[v + 1]!; q++) { const f = vf[q]!; x += fc[3 * f]!; y += fc[3 * f + 1]!; z += fc[3 * f + 2]!; }
      const l = Math.hypot(x, y, z) || 1;
      nrm[3 * v] = x / l; nrm[3 * v + 1] = y / l; nrm[3 * v + 2] = z / l;
    }
    g.getAttribute('normal').needsUpdate = true;
  }

  /** When the hand lets go: the smoothed rest normals the shading reads (shadeN, hullN) are redone too (a few passes over the mesh: not every frame), and the surface normals once whole. */
  settle(): void {
    const g = this.g, a = g.getAttribute('position').array as Float32Array;
    g.computeVertexNormals(); this.faceCross = null;
    const nrm = g.getAttribute('normal').array, idx = g.index ? g.index.array : [];
    if (g.getAttribute('shadeN')) g.setAttribute('shadeN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx, 6), 3));
    if (g.getAttribute('hullN')) g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(a, nrm, idx), 3));
  }
}
