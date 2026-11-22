// Evening out a junction's fillet on a surface: the vertices and triangles stay, only the free vertices move. Each round a free vertex moves a share of the way to the mean of its neighbours ALONG the surface (the tangential smooth) and a share
// of the way onto the surface itself (the shrink), along the union's gradient; a move that would turn one of its faces against its old normal is halved, twice, then given up. Optionally the interior edges are flipped where that raises the
// smallest angle of the pair (the same vertices, other triangles: used once, at the body pose, to clean a sliver the skin builder's remesh left; never at the map pose, where the triangles must be the body pose's). The same rules as skin/mesh.ts's
// remesh loop (which this cannot reuse: it is a closure of the build), on plain arrays.
import { sdUnionGrad, type Capsule } from '../skin/sdf.ts';
import { minAngleSin } from '../skin/mesh.ts';

const LAMBDA = 0.5;

export interface RelaxInput { pos: Float64Array; tris: number[]; /** 1: a vertex that does not move (the seam rings, which the tubes own) */ fixed: Uint8Array; caps: readonly Capsule[]; k: number }
export interface RelaxOptions { rounds: number; /** the share pulled onto the surface per round for the first `soft` rounds (then all the way) */ pull?: number; soft?: number; flips?: boolean }

export function relax(inp: RelaxInput, opts: RelaxOptions): void {
  const { pos, tris, fixed, caps, k } = inp, V = pos.length / 3, g = new Float64Array(3), before = [0, 0, 0], after = [0, 0, 0];
  const triNormal = (a: number, b: number, c: number, out: number[]): void => {
    const ux = pos[3 * b]! - pos[3 * a]!, uy = pos[3 * b + 1]! - pos[3 * a + 1]!, uz = pos[3 * b + 2]! - pos[3 * a + 2]!, vx = pos[3 * c]! - pos[3 * a]!, vy = pos[3 * c + 1]! - pos[3 * a + 1]!, vz = pos[3 * c + 2]! - pos[3 * a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  };
  const smooth = (pull: number): void => {
    const vt: number[][] = Array.from({ length: V }, () => []);
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) vt[tris[i + s]!]!.push(i);
    for (let v = 0; v < V; v++) {
      const ts = vt[v]!;
      if (fixed[v] || !ts.length) continue;
      const x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
      let mx = 0, my = 0, mz = 0, c = 0;
      for (const t of ts) for (let s = 0; s < 3; s++) { const u = tris[t + s]!; if (u !== v) { mx += pos[3 * u]!; my += pos[3 * u + 1]!; mz += pos[3 * u + 2]!; c++; } }
      let dx = mx / c - x, dy = my / c - y, dz = mz / c - z;
      const sd = sdUnionGrad(caps, k, x, y, z, g), gg = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
      if (gg < 1e-14) continue;
      const gl = Math.sqrt(gg), nx = g[0]! / gl, ny = g[1]! / gl, nz = g[2]! / gl, dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const f = (pull * sd) / gg, mvx = LAMBDA * dx - f * g[0]!, mvy = LAMBDA * dy - f * g[1]!, mvz = LAMBDA * dz - f * g[2]!;
      for (let tryI = 0, sc = 1; tryI < 3; tryI++, sc /= 2) {
        let ok = true;
        for (const t of ts) {
          const a = tris[t]!, b = tris[t + 1]!, d = tris[t + 2]!;
          pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z; triNormal(a, b, d, before);
          pos[3 * v] = x + sc * mvx; pos[3 * v + 1] = y + sc * mvy; pos[3 * v + 2] = z + sc * mvz; triNormal(a, b, d, after);
          if (before[0]! * after[0]! + before[1]! * after[1]! + before[2]! * after[2]! < 0.2) { ok = false; break; }
        }
        if (ok) break;
        if (tryI === 2) { pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z; }
      }
    }
  };
  const ekey = (a: number, b: number): number => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const flip = (): number => {
    const owner = new Map<number, [number, number]>();
    for (let i = 0; i < tris.length; i += 3) for (let s = 0; s < 3; s++) { const e = ekey(tris[i + s]!, tris[i + (s + 1) % 3]!), o = owner.get(e); if (!o) owner.set(e, [i, -1]); else o[1] = i; }
    let n = 0;
    const n1 = [0, 0, 0], n2 = [0, 0, 0];
    for (const [e, o] of owner) {
      if (o[1] < 0) continue;
      const t1 = o[0], t2 = o[1];
      let a = -1, b = -1, c = -1;
      for (let s = 0; s < 3; s++) { const p = tris[t1 + s]!, q = tris[t1 + (s + 1) % 3]!; if (ekey(p, q) === e) { a = p; b = q; c = tris[t1 + (s + 2) % 3]!; } }
      if (a < 0) continue;   // (a triangle an earlier flip of this pass changed no longer has this edge)
      let d = -1, has = 0;
      for (let s = 0; s < 3; s++) { const x = tris[t2 + s]!; if (x !== a && x !== b) d = x; else has++; }
      if (d < 0 || has !== 2 || (fixed[a] && fixed[b]) || owner.has(ekey(c, d))) continue;
      const was = Math.min(minAngleSin(pos, a, b, c), minAngleSin(pos, b, a, d)), now = Math.min(minAngleSin(pos, a, d, c), minAngleSin(pos, d, b, c));
      if (now <= was * 1.05) continue;
      // (both new triangles must face where the old pair did, so no flip folds the surface)
      const old = [0, 0, 0];
      triNormal(a, b, c, n1); triNormal(b, a, d, n2);
      old[0] = n1[0]! + n2[0]!; old[1] = n1[1]! + n2[1]!; old[2] = n1[2]! + n2[2]!;
      const ol = Math.hypot(old[0]!, old[1]!, old[2]!) || 1;
      triNormal(a, d, c, n1); triNormal(d, b, c, n2);
      if ((n1[0]! * old[0]! + n1[1]! * old[1]! + n1[2]! * old[2]!) / ol < 0.5 || (n2[0]! * old[0]! + n2[1]! * old[1]! + n2[2]! * old[2]!) / ol < 0.5) continue;
      tris[t1] = a; tris[t1 + 1] = d; tris[t1 + 2] = c; tris[t2] = d; tris[t2 + 1] = b; tris[t2 + 2] = c;
      owner.delete(e); owner.set(ekey(c, d), [t1, t2]); n++;
    }
    return n;
  };
  const pull = opts.pull ?? 0.3, soft = opts.soft ?? Math.floor(opts.rounds / 2);
  for (let r = 0; r < opts.rounds; r++) {
    if (opts.flips && r % 2 === 0) flip();
    smooth(r < soft ? pull : 1);
  }
  if (opts.flips) { for (let r = 0; r < 4; r++) { flip(); smooth(1); } }
}
