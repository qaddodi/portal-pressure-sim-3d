// The anatomy editor's live vessel preview (?editor, WS-A): while a node or a course is dragged, the REAL tubes and junction skins of what is edited move with it, once a frame, on the CPU.
// A tube cannot be rebuilt cheaply (joins, skins, marks and the lens's data hang on it), so at drag start every vertex of an affected tube or skin is tied to the vessel's centreline as it stands:
// the nearest point on it (segment s, share t) and its offset from there. A frame then needs only the centreline's displacement (the edit's eased offsets: vessel-apply.ts, the draft over what the
// page was built with) and the turn of the tangent at each point: the vertex goes to the displaced centreline point plus its offset turned with the tangent. A skin vertex follows its nearest arm.
// No shader is touched, nothing is rebuilt; endVesselPreview() puts the built buffers back, and Save reloads, which builds the exact geometry.
import type { BufferGeometry } from 'three';
import { applyVesselOverrides, hasEdits } from '../../editor/vessel-apply.ts';
import { overrides } from '../../editor/store.ts';
import type { Overrides } from '../../editor/types.ts';
import { EDGES, dMinOf } from '../../engine/hales/portal/topology.js';
import { EDGE_PATH_2D } from './paths.copied.ts';
import { type Edge, widthPx } from './width.ts';
import { NETWORK_BY_ID } from './network.ts';
import { anchorsOf, organsOf } from './organ-follow.ts';
import { x3, y3 } from '../frame2d.ts';

/** What the scene hands over: each vessel tube's geometry by edge id, and each junction skin's geometry with its arms' vessel ids. */
export interface VesselPreviewParts { tubes: ReadonlyMap<string, BufferGeometry>; skins: readonly { geometry: BufferGeometry; arms: readonly string[] }[] }
let host: (() => VesselPreviewParts) | null = null;
/** The editor says where the scene's parts come from (scene.editorVesselParts). */
export const setVesselPreviewHost = (h: (() => VesselPreviewParts) | null): void => { host = h; };

const byId = new Map((EDGES as Edge[]).map((e) => [e.id, e]));
const radiusOf = (id: string): number => { const e = byId.get(id); return e ? widthPx(e, e.d ?? e.dMax ?? (dMinOf(e) || 3)) / 2 : 0; };
type Plan = Record<string, readonly (readonly [number, number])[]>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** One vessel's centreline as built (`pts`, flat) and what the draft does to it. */
interface Arm { id: string; n: number; p: Float64Array; t: Float64Array; d: Float64Array; rot: Float64Array; live: boolean }
/** One geometry's tie to its arms, and the buffers it had. */
/** Every vertex is tied to EACH arm of its geometry (a tube has one): the nearest place on that arm's centreline (segment, share), its offset from there, and a weight. The weights are a smooth partition of unity by
 *  distance to the arms (inverse fourth power: a vertex on an arm's wall goes with that arm, one between two arms with a smooth blend of both), so a junction skin is stretched, never torn. */
interface Rig {
  geo: BufferGeometry; arms: Arm[]; skin: boolean; slots: number;
  arm: Uint16Array; seg: Uint16Array; k: Float32Array; off: Float32Array; w: Float32Array;
  pos0: Float32Array; nor0: Float32Array | null; tang0: Float32Array | null; cen0: Float32Array | null;
}
let rigs: Rig[] = [], armsById = new Map<string, Arm>(), key = '';

/** The ids of the vessels the draft changes against what the page was built with. */
export function changedVessels(now: Overrides, loaded: Overrides): string[] {
  const out: string[] = [];
  for (const [id, v] of NETWORK_BY_ID) {
    if (v.feeder) continue;
    // (the vessels that lie in or on an organ follow its live edit too: a drag of the liver moves the hepatic veins' ends with it)
    if (same(now.nodes?.[v.from], loaded.nodes?.[v.from]) && same(now.nodes?.[v.to], loaded.nodes?.[v.to]) && same(now.vessels?.[id], loaded.vessels?.[id]) && organsOf(v).every((org) => same(now.organs?.[org], loaded.organs?.[org]))) continue;
    out.push(id);
  }
  return out;
}

function armOf(id: string): Arm | null {
  const v = NETWORK_BY_ID.get(id);
  if (!v || v.pts.length < 2) return null;
  const n = v.pts.length, p = new Float64Array(3 * n);
  v.pts.forEach((q, i) => { p[3 * i] = q[0]; p[3 * i + 1] = q[1]; p[3 * i + 2] = q[2]; });
  const a: Arm = { id, n, p, t: new Float64Array(3 * n), d: new Float64Array(3 * n), rot: new Float64Array(9 * n), live: false };
  tangents(a.p, n, a.t);
  for (let i = 0; i < n; i++) { a.rot[9 * i] = a.rot[9 * i + 4] = a.rot[9 * i + 8] = 1; }
  return a;
}
function tangents(p: Float64Array, n: number, out: Float64Array): void {
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let x = p[3 * b]! - p[3 * a]!, y = p[3 * b + 1]! - p[3 * a + 1]!, z = p[3 * b + 2]! - p[3 * a + 2]!;
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
}

/** The softening of the distance weights (scene units squared): well inside a tube's radius, so a vertex on a wall is its own arm's. */
const SOFT = 1e-5;
/** Ties every vertex to every arm (see Rig). */
function tie(geo: BufferGeometry, arms: Arm[], skin: boolean): Rig {
  const pa = geo.getAttribute('position'), pos = pa.array as Float32Array, count = pa.count, K = arms.length;
  const na = geo.getAttribute('normal'), ta = geo.getAttribute('tang'), ca = geo.getAttribute('cen');
  const r: Rig = {
    geo, arms, skin, slots: K, arm: new Uint16Array(count * K), seg: new Uint16Array(count * K), k: new Float32Array(count * K), off: new Float32Array(3 * count * K), w: new Float32Array(count * K), pos0: pos.slice(),
    nor0: na ? (na.array as Float32Array).slice() : null, tang0: ta ? (ta.array as Float32Array).slice() : null, cen0: ca ? (ca.array as Float32Array).slice() : null,
  };
  for (let v = 0; v < count; v++) {
    const x = pos[3 * v]!, y = pos[3 * v + 1]!, z = pos[3 * v + 2]!;
    let total = 0;
    for (let ai = 0; ai < K; ai++) {
      const a = arms[ai]!, p = a.p, j = v * K + ai;
      let best = Infinity;
      for (let s = 0; s < a.n - 1; s++) {
        const ax = p[3 * s]!, ay = p[3 * s + 1]!, az = p[3 * s + 2]!, bx = p[3 * s + 3]! - ax, by = p[3 * s + 4]! - ay, bz = p[3 * s + 5]! - az;
        const l2 = bx * bx + by * by + bz * bz;
        let t = l2 > 0 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - bx * t, dy = y - ay - by * t, dz = z - az - bz * t, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) { best = d2; r.arm[j] = ai; r.seg[j] = s; r.k[j] = t; r.off[3 * j] = dx; r.off[3 * j + 1] = dy; r.off[3 * j + 2] = dz; }
      }
      const q = 1 / (best + SOFT); r.w[j] = K === 1 ? 1 : q * q; total += r.w[j]!;
    }
    for (let ai = 0; ai < K; ai++) r.w[v * K + ai]! /= total;
  }
  return r;
}

/** The centreline displacement of one vessel under the draft over the loaded edit, per point of its built course (scene units), and the turn of the tangent at each point. */
function displace(a: Arm, now: Overrides, loaded: Overrides): void {
  const e = byId.get(a.id), base = (EDGE_PATH_2D as Plan)[a.id];
  if (!e) { a.d.fill(0); a.live = false; return; }
  const an = anchorsOf(e, now), al = anchorsOf(e, loaded);
  if (!base || base.length < 2 || (!hasEdits(now, e) && !hasEdits(loaded, e) && !an && !al)) { a.d.fill(0); a.live = false; return; }
  const r0 = radiusOf(a.id), rn = applyVesselOverrides(e, base, now, { radius: r0, anchors: an }), rl = applyVesselOverrides(e, base, loaded, { radius: r0, anchors: al }), m = base.length;
  // (the share along the vessel is by ARC LENGTH, on the course and on the plan alike: the plan's samples need not be even, and Save builds the course on arc length)
  const parc = new Float64Array(m), carc = new Float64Array(a.n);
  for (let j = 1; j < m; j++) parc[j] = parc[j - 1]! + Math.hypot(base[j]![0] - base[j - 1]![0], base[j]![1] - base[j - 1]![1]);
  for (let i = 1; i < a.n; i++) carc[i] = carc[i - 1]! + Math.hypot(a.p[3 * i]! - a.p[3 * i - 3]!, a.p[3 * i + 1]! - a.p[3 * i - 2]!, a.p[3 * i + 2]! - a.p[3 * i - 1]!);
  const pt = parc[m - 1]! || 1, ct = carc[a.n - 1]! || 1;
  let jj = 0;
  const at = (i: number): [number, number, number] => {
    const target = (carc[i]! / ct) * pt;
    while (jj < m - 2 && parc[jj + 1]! < target) jj++;
    if (i === 0) jj = 0;
    const j = jj, span = parc[j + 1]! - parc[j]!, w = span > 1e-12 ? Math.min(1, Math.max(0, (target - parc[j]!) / span)) : 0;
    const dx = (x3(rn.path[j]![0]) - x3(rl.path[j]![0])) * (1 - w) + (x3(rn.path[j + 1]![0]) - x3(rl.path[j + 1]![0])) * w;
    const dy = (y3(rn.path[j]![1]) - y3(rl.path[j]![1])) * (1 - w) + (y3(rn.path[j + 1]![1]) - y3(rl.path[j + 1]![1])) * w;
    const z = (q: typeof rn, jx: number): number => (q.dz ? q.dz[jx]! : 0);
    const dz = (z(rn, j) - z(rl, j)) * (1 - w) + (z(rn, j + 1) - z(rl, j + 1)) * w;
    return [dx, dy, dz];
  };
  for (let i = 0; i < a.n; i++) { const [dx, dy, dz] = at(i); a.d[3 * i] = dx; a.d[3 * i + 1] = dy; a.d[3 * i + 2] = dz; }
  a.live = true;
  const q = new Float64Array(3 * a.n), t2 = new Float64Array(3 * a.n);
  for (let i = 0; i < 3 * a.n; i++) q[i] = a.p[i]! + a.d[i]!;
  tangents(q, a.n, t2);
  for (let i = 0; i < a.n; i++) {
    const ax = a.t[3 * i]!, ay = a.t[3 * i + 1]!, az = a.t[3 * i + 2]!, bx = t2[3 * i]!, by = t2[3 * i + 1]!, bz = t2[3 * i + 2]!;
    const vx = ay * bz - az * by, vy = az * bx - ax * bz, vz = ax * by - ay * bx, c = ax * bx + ay * by + az * bz, o = 9 * i, R = a.rot;
    if (c < -0.999) { R.fill(0, o, o + 9); R[o] = R[o + 4] = R[o + 8] = 1; continue; }
    const k = 1 / (1 + c);   // R = I + [v]x + [v]x^2 / (1 + c)
    R[o] = 1 + k * (-vz * vz - vy * vy); R[o + 1] = -vz + k * vx * vy; R[o + 2] = vy + k * vx * vz;
    R[o + 3] = vz + k * vx * vy; R[o + 4] = 1 + k * (-vz * vz - vx * vx); R[o + 5] = -vx + k * vy * vz;
    R[o + 6] = -vy + k * vx * vz; R[o + 7] = vx + k * vy * vz; R[o + 8] = 1 + k * (-vy * vy - vx * vx);
  }
}

/** Writes the displaced vertices of one rig. Only the draft's change is applied, from the buffers as they stood at drag start: each vertex is the weighted sum, over its arms, of where that arm carries it. */
function write(r: Rig): void {
  const pos = r.geo.getAttribute('position').array as Float32Array, nor = r.nor0 ? (r.geo.getAttribute('normal').array as Float32Array) : null;
  const tg = r.tang0 ? (r.geo.getAttribute('tang').array as Float32Array) : null, cen = r.cen0 ? (r.geo.getAttribute('cen').array as Float32Array) : null;
  const n = r.geo.getAttribute('position').count, K = r.slots, p0 = r.pos0, n0 = r.nor0, t0 = r.tang0, c0 = r.cen0;
  for (let v = 0; v < n; v++) {
    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0, tx = 0, ty = 0, tz = 0, cx = 0, cy = 0, cz = 0;
    for (let ai = 0; ai < K; ai++) {
      const j = v * K + ai, wj = r.w[j]!, a = r.arms[r.arm[j]!]!;
      if (wj < 1e-6) continue;
      if (!a.live) {   // (an arm that does not move carries the vertex nowhere)
        px += wj * p0[3 * v]!; py += wj * p0[3 * v + 1]!; pz += wj * p0[3 * v + 2]!;
        if (n0) { nx += wj * n0[3 * v]!; ny += wj * n0[3 * v + 1]!; nz += wj * n0[3 * v + 2]!; }
        if (t0) { tx += wj * t0[3 * v]!; ty += wj * t0[3 * v + 1]!; tz += wj * t0[3 * v + 2]!; }
        if (c0) { cx += wj * c0[3 * v]!; cy += wj * c0[3 * v + 1]!; cz += wj * c0[3 * v + 2]!; }
        continue;
      }
      const s = r.seg[j]!, t = r.k[j]!, u = 1 - t, R = a.rot, d = a.d, p = a.p, i0 = 9 * s, i1 = 9 * (s + 1);
      const turn = (x: number, y: number, z: number): [number, number, number] => [
        u * (R[i0]! * x + R[i0 + 1]! * y + R[i0 + 2]! * z) + t * (R[i1]! * x + R[i1 + 1]! * y + R[i1 + 2]! * z),
        u * (R[i0 + 3]! * x + R[i0 + 4]! * y + R[i0 + 5]! * z) + t * (R[i1 + 3]! * x + R[i1 + 4]! * y + R[i1 + 5]! * z),
        u * (R[i0 + 6]! * x + R[i0 + 7]! * y + R[i0 + 8]! * z) + t * (R[i1 + 6]! * x + R[i1 + 7]! * y + R[i1 + 8]! * z)];
      const mx = u * d[3 * s]! + t * d[3 * s + 3]!, my = u * d[3 * s + 1]! + t * d[3 * s + 4]!, mz = u * d[3 * s + 2]! + t * d[3 * s + 5]!;
      // the vertex = the displaced centreline point + its offset turned with the tangent
      const o = turn(r.off[3 * j]!, r.off[3 * j + 1]!, r.off[3 * j + 2]!);
      px += wj * (u * p[3 * s]! + t * p[3 * s + 3]! + mx + o[0]); py += wj * (u * p[3 * s + 1]! + t * p[3 * s + 4]! + my + o[1]); pz += wj * (u * p[3 * s + 2]! + t * p[3 * s + 5]! + mz + o[2]);
      if (n0) { const q = turn(n0[3 * v]!, n0[3 * v + 1]!, n0[3 * v + 2]!); nx += wj * q[0]; ny += wj * q[1]; nz += wj * q[2]; }
      if (t0) { const q = turn(t0[3 * v]!, t0[3 * v + 1]!, t0[3 * v + 2]!); tx += wj * q[0]; ty += wj * q[1]; tz += wj * q[2]; }
      if (c0) { cx += wj * (c0[3 * v]! + mx); cy += wj * (c0[3 * v + 1]! + my); cz += wj * (c0[3 * v + 2]! + mz); }
    }
    pos[3 * v] = px; pos[3 * v + 1] = py; pos[3 * v + 2] = pz;
    if (nor && n0) { const l = Math.hypot(nx, ny, nz) || 1, l0 = Math.hypot(n0[3 * v]!, n0[3 * v + 1]!, n0[3 * v + 2]!) || 1; nor[3 * v] = (nx / l) * l0; nor[3 * v + 1] = (ny / l) * l0; nor[3 * v + 2] = (nz / l) * l0; }
    if (tg && t0) { const l = Math.hypot(tx, ty, tz) || 1; tg[3 * v] = tx / l; tg[3 * v + 1] = ty / l; tg[3 * v + 2] = tz / l; }
    if (cen) { cen[3 * v] = cx; cen[3 * v + 1] = cy; cen[3 * v + 2] = cz; }
  }
  for (const name of ['position', 'normal', 'tang', 'cen']) { const at = r.geo.getAttribute(name); if (at) at.needsUpdate = true; }
  r.geo.computeBoundingSphere();
}

function restore(r: Rig): void {
  const put = (name: string, src: Float32Array | null): void => { const at = r.geo.getAttribute(name); if (at && src) { (at.array as Float32Array).set(src); at.needsUpdate = true; } };
  put('position', r.pos0); put('normal', r.nor0); put('tang', r.tang0); put('cen', r.cen0);
  r.geo.computeBoundingSphere();
}

/** Shows the draft `o` live on the real tubes and skins of every vessel it changes (the loaded edit is what they were built with). Call it on every drag move; the first call of a drag ties the vertices. */
export function previewVesselEdits(o: Overrides): void {
  if (!host) return;
  const loaded = overrides(), ids = changedVessels(o, loaded);
  const k = ids.join();
  if (k !== key) {
    // (a different set of vessels is being edited: put the old buffers back and tie the new ones, once)
    endVesselPreview();
    key = k;
    if (!ids.length) return;
    const parts = host(), set = new Set(ids);
    for (const id of ids) { const a = armOf(id); if (a) armsById.set(id, a); }
    for (const id of ids) {
      const g = parts.tubes.get(id), a = armsById.get(id);
      if (g && a) rigs.push(tie(g, [a], false));
    }
    for (const s of parts.skins) {
      if (!s.arms.some((id) => set.has(id))) continue;
      const arms = s.arms.map((id) => armsById.get(id) ?? (() => { const a = armOf(id); if (a) armsById.set(id, a); return a; })()).filter((a): a is Arm => !!a);
      if (arms.length) rigs.push(tie(s.geometry, arms, true));
    }
  }
  for (const a of armsById.values()) displace(a, o, loaded);
  for (const r of rigs) write(r);
}

/** Puts the built buffers back (the drag ended; Save then reloads and builds the exact geometry). */
export function endVesselPreview(): void {
  for (const r of rigs) restore(r);
  rigs = []; armsById = new Map(); key = '';
}
/** Tests only: how many geometries are tied. */
export const previewRigCount = (): number => rigs.length;
