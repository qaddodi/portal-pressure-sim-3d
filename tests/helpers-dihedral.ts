// How pointy or creased an edit leaves a mesh: per edge (faces sharing two vertex PLACES of the reference, so welded seams count as shared) the angle between its two faces, before and after.
import type { BufferGeometry } from 'three';

function placeIds(ref: BufferGeometry): Int32Array {
  const p = ref.getAttribute('position').array, key = new Map<string, number>(), id = new Int32Array(p.length / 3);
  for (let i = 0; i < id.length; i++) {
    const k = `${Math.round(p[3 * i]! * 1e4)},${Math.round(p[3 * i + 1]! * 1e4)},${Math.round(p[3 * i + 2]! * 1e4)}`;
    let v = key.get(k); if (v === undefined) { v = key.size; key.set(k, v); } id[i] = v;
  }
  return id;
}
function edgeAngles(g: BufferGeometry, id: Int32Array): Map<string, number> {
  const p = g.getAttribute('position').array, idx = g.index!.array, nf: number[][] = [], edges = new Map<string, number[]>();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
    const ux = p[3 * b]! - p[3 * a]!, uy = p[3 * b + 1]! - p[3 * a + 1]!, uz = p[3 * b + 2]! - p[3 * a + 2]!, vx = p[3 * c]! - p[3 * a]!, vy = p[3 * c + 1]! - p[3 * a + 1]!, vz = p[3 * c + 2]! - p[3 * a + 2]!;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z);
    if (l < 1e-14) continue;
    const f = nf.length; nf.push([x / l, y / l, z / l]);
    for (const [s, e] of [[a, b], [b, c], [c, a]] as const) { const i = id[s]!, j = id[e]!, k = i < j ? `${i}_${j}` : `${j}_${i}`; (edges.get(k) ?? edges.set(k, []).get(k)!).push(f); }
  }
  const out = new Map<string, number>();
  for (const [k, fs] of edges) if (fs.length === 2) { const a = nf[fs[0]!]!, b = nf[fs[1]!]!; out.set(k, Math.acos(Math.min(1, Math.max(-1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)))); }
  return out;
}
/** The largest and 99.9th-percentile increase (radians) of any edge's face-to-face angle from `ref` to `edited` (same index buffer): a crease or a point the edit made. */
export function creaseGain(ref: BufferGeometry, refAngles: Map<string, number>, edited: BufferGeometry): { max: number; p999: number } {
  const after = edgeAngles(edited, placeIds(ref)), gains: number[] = [];
  for (const [k, a] of after) gains.push(a - (refAngles.get(k) ?? a));
  gains.sort((a, b) => a - b);
  return { max: gains[gains.length - 1] ?? 0, p999: gains[Math.floor(gains.length * 0.999)] ?? 0 };
}
export const anglesOf = (ref: BufferGeometry): Map<string, number> => edgeAngles(ref, placeIds(ref));
