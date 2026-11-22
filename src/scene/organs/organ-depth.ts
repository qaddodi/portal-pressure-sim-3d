// Organ depth (Settings > Figure depth > Organ depth; a deliberate step beyond 2D, owner 19 Nov 2026): one baked number per organ vertex, `depthAo` in 0..1 (stored as one normalized byte),
// that says how tucked in that point is: high in a crease (the surface curves in on itself) and where one organ meets another. The organ shader (organ-shader.ts) turns it into
// a soft three-step shade in the look's own dark tone, and it reads a hint of light from the upper left off the normal; nothing else is stored, no texture, no extra pass.
//
// Worked out once, at load, from the geometry alone (about 80 000 vertices in all; a few ms: tests/organ-depth.test.ts measures it), never at a frame, and never shipped:
//   crease   the vertex against the mean of its neighbours along the normal (the umbrella Laplacian: positive when the neighbours stand out in front of it, as in a fold or a
//            valley between two lobes), in units of the mean edge length;
//   contact  a coarse voxel grid (cell CELL) records which organ occupies each cell; a vertex counts the other organs' cells in its 3x3x3 neighbourhood, nearer ones heavier.
//            Organs that are one thing in 2D (the heart and its atrium) are one group and never darken each other.
// Pure arithmetic on typed arrays (no three.js), so the tests run it on the real organs file in node.

/** The side of a contact cell in the shared frame (300 units are one figure unit of 2D: 0.03 is 9 SVG units). */
export const CELL = 0.03;
/** The groups that are one organ for contact: the atrium is part of the heart, the caudate lobe part of the liver. */
const GROUP_OF: Record<string, string> = { 'heart-ra': 'heart', caudate: 'liver' };

export interface DepthPart { pos: ArrayLike<number>; normal: ArrayLike<number>; index: ArrayLike<number> }

/** Empty cells kept round the grid: the trilinear read reaches two cells past a vertex's own. */
const PAD = 3;
/** The mean edge length the two smoothing passes were made for (0.02: the organ files' 6 units); a finer mesh takes more passes so the smoothing is the same distance. */
const H_REF = 0.02;
/** Smoothing passes for a mesh: 2 at the organ file's own spacing, in proportion to (H_REF / mean edge)^2 below it (a pass is a diffusion step: its reach grows as the edge times the root of the passes). */
export function smoothPasses(part: DepthPart): number {
  return Math.min(16, Math.max(2, Math.round(2 * (H_REF / meanEdge(part)) ** 2)));
}
/** The mesh's mean edge length (each edge counted at both its ends). */
export function meanEdge(part: DepthPart): number {
  const { cnt, len } = rings(part.pos, part.index, part.pos.length / 3);
  let s = 0, c = 0; for (let i = 0; i < cnt.length; i++) { s += len[i]!; c += cnt[i]!; }
  return c ? s / c : H_REF;
}

/** Weight of a neighbouring cell by squared cell distance 0..3 (the cell itself, a face, an edge, a corner). */
const W = [1, 0.55, 0.3, 0.15];
/** What a flat contact (a whole plane of cells of another organ across the neighbourhood) sums to: 1 + 4*.55 + 4*.3, and a little more for the cells in front and behind. */
const FULL = 5;

/** The vertices' neighbour sums over the mesh's triangles: sum of the other two corners, the count and the edge lengths, for the crease and the smoothing. */
function rings(pos: ArrayLike<number>, index: ArrayLike<number>, n: number) {
  const sum = new Float32Array(n * 3), cnt = new Uint16Array(n), len = new Float32Array(n);
  // each edge once per triangle side: both of its ends take the other end and its length
  const edge = (a: number, b: number) => {
    const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!, bx = pos[b * 3]!, by = pos[b * 3 + 1]!, bz = pos[b * 3 + 2]!;
    const l = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by) + (az - bz) * (az - bz));
    sum[a * 3] += bx; sum[a * 3 + 1] += by; sum[a * 3 + 2] += bz; cnt[a]++; len[a] += l;
    sum[b * 3] += ax; sum[b * 3 + 1] += ay; sum[b * 3 + 2] += az; cnt[b]++; len[b] += l;
  };
  for (let t = 0; t < index.length; t += 3) { const a = index[t]!, b = index[t + 1]!, c = index[t + 2]!; edge(a, b); edge(b, c); edge(c, a); }
  return { sum, cnt, len };
}

/** Averages `v` over each vertex's neighbours `passes` times. */
export function smooth(v: Float32Array, index: ArrayLike<number>, passes: number): Float32Array {
  const n = v.length;
  let cur = v;
  for (let p = 0; p < passes; p++) {
    const s = new Float32Array(n), c = new Uint16Array(n);
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t]!, b = index[t + 1]!, d = index[t + 2]!;
      s[a] += cur[b]! + cur[d]!; s[b] += cur[a]! + cur[d]!; s[d] += cur[a]! + cur[b]!;
      c[a] += 2; c[b] += 2; c[d] += 2;
    }
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (cur[i]! + s[i]!) / (1 + c[i]!);
    cur = out;
  }
  return cur;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The crease of every vertex, 0 (flat or bulging) to 1 (a deep fold). */
export function creaseOf(part: DepthPart, passes = 2): Float32Array {
  const n = part.pos.length / 3;
  const { sum, cnt, len } = rings(part.pos, part.index, n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) continue;
    const mx = sum[i * 3]! / cnt[i]! - part.pos[i * 3]!, my = sum[i * 3 + 1]! / cnt[i]! - part.pos[i * 3 + 1]!, mz = sum[i * 3 + 2]! / cnt[i]! - part.pos[i * 3 + 2]!;
    const h = len[i]! / cnt[i]!;   // the mean edge length here
    const conc = (mx * part.normal[i * 3]! + my * part.normal[i * 3 + 1]! + mz * part.normal[i * 3 + 2]!) / Math.max(h, 1e-6);
    out[i] = clamp01((conc - 0.03) / 0.3);
  }
  return passes ? smooth(out, part.index, passes) : out;
}

/** The depth term of every organ, 0..255 per vertex, from all the organs' geometry at once (contact needs them together). Deterministic: the same meshes give the same bytes. */
export function bakeOrganDepth(parts: Record<string, DepthPart>): Record<string, Uint8Array> {
  const ids = Object.keys(parts).sort();
  const groups = [...new Set(ids.map((id) => GROUP_OF[id] ?? id))];
  const bit = (id: string) => 1 << groups.indexOf(GROUP_OF[id] ?? id);
  // the grid: the box of every vertex, one cell of padding
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const id of ids) {
    const p = parts[id]!.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  const nx = Math.ceil((x1 - x0) / CELL) + 2 * PAD + 1, ny = Math.ceil((y1 - y0) / CELL) + 2 * PAD + 1, nz = Math.ceil((z1 - z0) / CELL) + 2 * PAD + 1;
  const cells = new Uint16Array(nx * ny * nz);
  const at = (cx: number, cy: number, cz: number) => cx + nx * (cy + ny * cz);
  const cellOf = (x: number, y: number, z: number) => at(Math.floor((x - x0) / CELL) + PAD, Math.floor((y - y0) / CELL) + PAD, Math.floor((z - z0) / CELL) + PAD);
  // Which organs occupy each cell: from the SURFACE (points on every triangle, no farther apart than half a cell), never from the mesh's vertices alone, so the grid is the same whatever the mesh's density
  // (a coarse mesh left holes in it, and a mesh with more points filled them: the contact shade followed the vertices).
  for (const id of ids) {
    const part = parts[id]!, p = part.pos, ix = part.index, b = bit(id);
    const mark = (x: number, y: number, z: number) => { cells[cellOf(x, y, z)]! |= b; };
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t]! * 3, c1 = ix[t + 1]! * 3, c2 = ix[t + 2]! * 3;
      const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!, bx = p[c1]!, by = p[c1 + 1]!, bz = p[c1 + 2]!, cx = p[c2]!, cy = p[c2 + 1]!, cz = p[c2 + 2]!;
      const L = Math.max(Math.hypot(ax - bx, ay - by, az - bz), Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(cx - ax, cy - ay, cz - az));
      const n = Math.min(12, Math.max(1, Math.ceil(L / (CELL * 0.5))));
      for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) { const u = i / n, v = j / n, w = 1 - u - v; mark(w * ax + u * bx + v * cx, w * ay + u * by + v * cy, w * az + u * bz + v * cz); }
    }
  }
  const out: Record<string, Uint8Array> = {};
  for (const id of ids) {
    const part = parts[id]!, p = part.pos, n = p.length / 3, mine = ~bit(id) & 0xffff;
    // the contact field: a cell's weighted count of the other organs' cells round it (W by distance), worked out once a cell, and read by TRILINEAR blend at the vertex, so it is a continuous field. A vertex used to take its own
    // cell's value, a staircase one cell (9 units) wide, and the three steps of the shade (organ-shader.ts tuck) drew that staircase as saw-teeth along the organ's shadow.
    const field = new Float32Array(cells.length).fill(-1);
    const cellVal = (cx: number, cy: number, cz: number): number => {
      const k = at(cx, cy, cz), v = field[k]!;
      if (v >= 0) return v;
      let s = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cells[at(cx + dx, cy + dy, cz + dz)]! & mine) s += W[dx * dx + dy * dy + dz * dz]!;
      return (field[k] = s);
    };
    const contact = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const fx = (p[i * 3]! - x0) / CELL + PAD - 0.5, fy = (p[i * 3 + 1]! - y0) / CELL + PAD - 0.5, fz = (p[i * 3 + 2]! - z0) / CELL + PAD - 0.5;   // (cell k's centre is at k + 0.5)
      const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
      let s = 0;
      for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) s += (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz) * cellVal(ix + dx, iy + dy, iz + dz);
      contact[i] = clamp01(s / FULL);
    }
    // crease and contact joined (a tuck is a tuck), then smoothed over the mesh so neither the mesh's noise nor the contact grid's cells show. The smoothing is a radius in the figure, not a number of rings: a mesh with
    // more points has shorter edges, so it takes more passes (a pass moves a value one edge), else the shade is less smooth on the finer mesh.
    const cr = creaseOf(part, 0), bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) contact[i] = 1 - (1 - 0.85 * cr[i]!) * (1 - 0.9 * contact[i]!);
    const tuck = smooth(contact, part.index, smoothPasses(part));
    for (let i = 0; i < n; i++) bytes[i] = Math.round(255 * clamp01(tuck[i]!));
    out[id] = bytes;
  }
  return out;
}
