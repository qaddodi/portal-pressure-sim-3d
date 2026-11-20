// The liver's surface, made calm for the cel look (Mohammad, 20 Nov: the cirrhotic liver read as "a dense pitted honeycomb, sponge or leather", and the liver was too shiny). The artist's cirrhotic
// liver carries many small nodules in its normals (each one catches the light) and a mottled wash. Cel shading wants a few broad flat bands, so the normals are low-passed twice: a heavy pass that
// the light bands read (the liver's form), and a middle pass whose difference from the heavy one is the broad nodules, drawn as one flat low-contrast band (shaders.ts `detail`, `uNod`).
// Both are done once, when the organ file is read, on the CPU, by averaging each vertex with the vertices it shares an edge with.

/** The vertices each vertex shares a triangle with, as a compressed list: `start[i]..start[i + 1]` index into `list`. */
function neighbours(n: number, index: ArrayLike<number>): { start: Uint32Array; list: Uint32Array } {
  const count = new Uint32Array(n + 1);
  for (let t = 0; t < index.length; t++) count[index[t]! + 1]! += 2;
  for (let i = 0; i < n; i++) count[i + 1]! += count[i]!;
  const start = count, fill = new Uint32Array(n), list = new Uint32Array(start[n]!);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!, b = index[t + 1]!, c = index[t + 2]!;
    list[start[a]! + fill[a]!++] = b; list[start[a]! + fill[a]!++] = c;
    list[start[b]! + fill[b]!++] = a; list[start[b]! + fill[b]!++] = c;
    list[start[c]! + fill[c]!++] = a; list[start[c]! + fill[c]!++] = b;
  }
  return { start, list };
}

/** `iters` rounds of averaging each unit vector with its neighbours' (renormalised): the surface's normals with the small relief taken out. */
export function smoothNormals(normal: ArrayLike<number>, index: ArrayLike<number>, iters: number): Float32Array {
  const n = normal.length / 3, { start, list } = neighbours(n, index);
  let cur = Float32Array.from(normal as ArrayLike<number>), next = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let x = cur[i * 3]!, y = cur[i * 3 + 1]!, z = cur[i * 3 + 2]!;
      for (let k = start[i]!; k < start[i + 1]!; k++) { const j = list[k]! * 3; x += cur[j]!; y += cur[j + 1]!; z += cur[j + 2]!; }
      const l = Math.hypot(x, y, z) || 1;
      next[i * 3] = x / l; next[i * 3 + 1] = y / l; next[i * 3 + 2] = z / l;
    }
    [cur, next] = [next, cur];
  }
  return cur;
}

/** The artist's wash with its mottle calmed: `iters` rounds of averaging, then `keep` of the original detail put back, then its contrast about the mean scaled by `contrast`. */
export function calmWash(color: ArrayLike<number>, index: ArrayLike<number>, iters: number, keep: number, contrast: number): Float32Array {
  const n = color.length / 3, { start, list } = neighbours(n, index);
  let cur = Float32Array.from(color as ArrayLike<number>), next = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      let s = cur[i * 3 + c]!, k = 1;
      for (let e = start[i]!; e < start[i + 1]!; e++) { s += cur[list[e]! * 3 + c]!; k++; }
      next[i * 3 + c] = s / k;
    }
    [cur, next] = [next, cur];
  }
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c]! += color[i * 3 + c]! / n;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const v = cur[i * 3 + c]! + keep * (color[i * 3 + c]! - cur[i * 3 + c]!);
    out[i * 3 + c] = Math.min(1, Math.max(0, mean[c]! + contrast * (v - mean[c]!)));
  }
  return out;
}
