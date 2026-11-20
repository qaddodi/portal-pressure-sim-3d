// The normal the cel bands of an organ are cut by: the organ's own at rest, smoothed over its surface so that the shade and the lit tone are each one clean crescent along the silhouette (a pillow's fine triangles and the
// stomach's and the bowel's folds would otherwise break a hard band into blotches). Vertices at one place (a seam, a duplicated corner) are one vertex here. Pure arithmetic on typed arrays: the layer bakes it once per mesh.

/** `normals` (3 a vertex) averaged with the vertices around each, `passes` times, to unit length. `index` is the triangle list (empty: the vertices are taken in threes). */
export function smoothRestNormals(pos: ArrayLike<number>, normals: ArrayLike<number>, index: ArrayLike<number>, passes = 8): Float32Array {
  const n = pos.length / 3;
  // one id a place
  const ids = new Int32Array(n), seen = new Map<string, number>();
  let m = 0;
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[3 * i]! * 1e4)},${Math.round(pos[3 * i + 1]! * 1e4)},${Math.round(pos[3 * i + 2]! * 1e4)}`;
    let id = seen.get(key);
    if (id === undefined) { id = m++; seen.set(key, id); }
    ids[i] = id;
  }
  const tri = index.length ? index : Array.from({ length: n }, (_, i) => i);
  const nb: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
  for (let t = 0; t + 2 < tri.length; t += 3) {
    const a = ids[tri[t]!]!, b = ids[tri[t + 1]!]!, c = ids[tri[t + 2]!]!;
    nb[a]!.add(b).add(c); nb[b]!.add(a).add(c); nb[c]!.add(a).add(b);
  }
  let cur = new Float32Array(m * 3);
  for (let i = 0; i < n; i++) { const o = ids[i]! * 3; cur[o] += normals[3 * i]!; cur[o + 1] += normals[3 * i + 1]!; cur[o + 2] += normals[3 * i + 2]!; }
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(m * 3);
    for (let v = 0; v < m; v++) {
      let x = cur[3 * v]!, y = cur[3 * v + 1]!, z = cur[3 * v + 2]!;
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      for (const w of nb[v]!) { const lw = Math.hypot(cur[3 * w]!, cur[3 * w + 1]!, cur[3 * w + 2]!) || 1; x += cur[3 * w]! / lw; y += cur[3 * w + 1]! / lw; z += cur[3 * w + 2]! / lw; }
      next[3 * v] = x; next[3 * v + 1] = y; next[3 * v + 2] = z;
    }
    cur = next;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = ids[i]! * 3, l = Math.hypot(cur[o]!, cur[o + 1]!, cur[o + 2]!) || 1;
    out[3 * i] = cur[o]! / l; out[3 * i + 1] = cur[o + 1]! / l; out[3 * i + 2] = cur[o + 2]! / l;
  }
  return out;
}
