// A tube of varying radius along a centreline, in the cel objects' attribute layout (position, normal, uv.x along the flow, `tang`): the clots, the strands of the
// plexuses and the bleed's stream are all made with it. The rings are carried along the line by parallel transport from the first, so a bend never twists them.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export function ringTube(centres: readonly Vector3[], radii: readonly number[], radial = 10, caps = true): BufferGeometry {
  const n = centres.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], tang: number[] = [], idx: number[] = [];
  const T = new Vector3(), N = new Vector3(), B = new Vector3(), prevT = new Vector3(), tmp = new Vector3();
  for (let i = 0; i < n; i++) {
    const a = centres[Math.max(0, i - 1)]!, b = centres[Math.min(n - 1, i + 1)]!;
    T.subVectors(b, a); if (T.lengthSq() < 1e-12) T.set(1, 0, 0); T.normalize();
    if (i === 0) { N.crossVectors(T, tmp.set(0, 0, 1)); if (N.lengthSq() < 1e-6) N.crossVectors(T, tmp.set(0, 1, 0)); N.normalize(); }
    else { const axis = tmp.crossVectors(prevT, T); const s = axis.length(); if (s > 1e-6) { axis.divideScalar(s); N.applyAxisAngle(axis, Math.asin(Math.min(1, s))); } }
    B.crossVectors(T, N).normalize(); prevT.copy(T);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
      const r = radii[i]!, p = centres[i]!;
      pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); nor.push(nx, ny, nz); uv.push(n > 1 ? i / (n - 1) : 0, j / radial); tang.push(T.x, T.y, T.z);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * stride + j, b = a + stride;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps && n > 1) for (const end of [0, n - 1]) {
    const c = centres[end]!, base = pos.length / 3, dir = end === 0 ? -1 : 1;
    const a = centres[Math.max(0, end - 1)]!, b = centres[Math.min(n - 1, end + 1)]!;
    T.subVectors(b, a).normalize();
    pos.push(c.x + T.x * radii[end]! * 0.35 * dir, c.y + T.y * radii[end]! * 0.35 * dir, c.z + T.z * radii[end]! * 0.35 * dir);
    nor.push(T.x * dir, T.y * dir, T.z * dir); uv.push(end === 0 ? 0 : 1, 0.5); tang.push(T.x, T.y, T.z);
    for (let j = 0; j < radial; j++) { const r0 = end * stride + j; if (end === 0) idx.push(base, r0 + 1, r0); else idx.push(base, r0, r0 + 1); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('tang', new Float32BufferAttribute(tang, 3));
  g.setIndex(idx);
  return g;
}

/** Points of a polyline at the given shares (0..1) of its arc length. */
export function sampleAlong(pts: readonly Vector3[], shares: readonly number[]): Vector3[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
  const L = acc[acc.length - 1]! || 1;
  return shares.map((s) => {
    const d = Math.min(1, Math.max(0, s)) * L;
    let k = 1; while (k < acc.length - 1 && acc[k]! < d) k++;
    const span = acc[k]! - acc[k - 1]! || 1;
    return pts[k - 1]!.clone().lerp(pts[k]!, (d - acc[k - 1]!) / span);
  });
}
