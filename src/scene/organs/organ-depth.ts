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
/** The groups that are one organ for contact: the atrium is part of the heart. */
const GROUP_OF: Record<string, string> = { 'heart-ra': 'heart' };

export interface DepthPart { pos: ArrayLike<number>; normal: ArrayLike<number>; index: ArrayLike<number> }

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
function smooth(v: Float32Array, index: ArrayLike<number>, passes: number): Float32Array {
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
  const nx = Math.ceil((x1 - x0) / CELL) + 3, ny = Math.ceil((y1 - y0) / CELL) + 3, nz = Math.ceil((z1 - z0) / CELL) + 3;
  const cells = new Uint16Array(nx * ny * nz);
  const cellOf = (x: number, y: number, z: number) => (Math.floor((x - x0) / CELL) + 1) + nx * ((Math.floor((y - y0) / CELL) + 1) + ny * (Math.floor((z - z0) / CELL) + 1));
  for (const id of ids) { const p = parts[id]!.pos, b = bit(id); for (let i = 0; i < p.length; i += 3) cells[cellOf(p[i]!, p[i + 1]!, p[i + 2]!)]! |= b; }
  const out: Record<string, Uint8Array> = {};
  for (const id of ids) {
    const part = parts[id]!, p = part.pos, n = p.length / 3, mine = ~bit(id) & 0xffff;
    const contact = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cx = Math.floor((p[i * 3]! - x0) / CELL) + 1, cy = Math.floor((p[i * 3 + 1]! - y0) / CELL) + 1, cz = Math.floor((p[i * 3 + 2]! - z0) / CELL) + 1;
      let s = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
        const row = nx * (cy + dy + ny * (cz + dz));
        for (let dx = -1; dx <= 1; dx++) if (cells[row + cx + dx]! & mine) s += W[dx * dx + dy * dy + dz * dz]!;
      }
      contact[i] = clamp01(s / FULL);
    }
    // crease and contact joined (a tuck is a tuck), then smoothed over two rings so neither the mesh's noise nor the contact grid's cells show
    const cr = creaseOf(part, 0), bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) contact[i] = 1 - (1 - 0.85 * cr[i]!) * (1 - 0.9 * contact[i]!);
    const tuck = smooth(contact, part.index, 2);
    for (let i = 0; i < n; i++) bytes[i] = Math.round(255 * clamp01(tuck[i]!));
    out[id] = bytes;
  }
  return out;
}
