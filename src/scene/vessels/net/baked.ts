// The baked network mesh file (public/anatomy/net-<n>.bin, gzip): written by `node scripts/bake-skins.mjs --net` at build time, so the page meshes nothing at load. One file per network (mesh.ts `networksOf`).
// VERSION 9 (plan owner, 22 Nov: u16 indices for a network of at most 65535 vertices (the high bit of the index count says so), and every key as a sparse snorm8 delta from the mesh's own offsets of its region, KEY_DELTA_MIN). VERSION 8 (plan owner, 22 Nov, "Rulings on WP2"): the offsets and the keys are snorm16 in the bone frame (per array: f32 scale = its largest |value|, i16 q = round(value / scale * 32767)) and the rest normals oct-encoded to 2 x int8 per bone slot (-128, -128 = no normal), decoded to f32 on load: the GPU and every consumer see the same f32 NetMesh. The layout below says f32 where v8 stores the quantised form: position f32[3V]; bone u16[4V]; weight f32[4V]; f32 offsetScale, f32 offsetMapScale; offset i16[12V]; normal i8[8V]; index u32[I]; offsetMap i16[12V]; E; bakeScale; keys (per key: swell f32[A], f32 scale, i16 offset[12n], f32 scale, i16 offsetMap[12n]).
// Layout (little endian): u32 magic 'NETM', u32 version, u32 vertices V, u32 index length I, u32 digest length D; D bytes of digest (padded to 4); f32 position[3V]; u16 bone[4V] (padded to 4 bytes); f32 weight[4V]; f32 offset[12V]; f32 normal[12V]; u32 index[I]; f32 offsetMap[12V]; u32 edges E; f32 bakeScale[E]. (Version 5 appends, after the keys, the junction REPORTS the shader's region rows are built from (net/regions.ts `regionsOf`): u32 length and that many bytes of JSON, padded to 4 (node, variant, ranges, arms, seams, capsules, bones, windows).) (Version 4 appends the wide junctions' KEYS (net/keys.ts) after bakeScale: u32 R; per region: u32 node length, node bytes (padded to 4), u32 variant, u32 vertStart, u32 vertCount, u32 A, u32 arms[A], u32 K; per key: u32 state, u32 folds at the body pose, u32 folds at the map pose, f32 swell[A], f32 offset[12n], f32 offsetMap[12n], n = vertCount.) (Version 3: the map-pose fit, net/fit.ts, and the bake radius factors, ranges.ts.)
import type { NetMesh, Skeleton } from './types.ts';
import type { NodeReport } from './mesh.ts';

const MAGIC = 0x4d54454e, VERSION = 9;

/** A digest of the skeleton a mesh was baked from (FNV-1a over every bone's numbers, rounded to 1e-6 so a browser whose sin and cos differ from node's in the last bit still knows its own file (and a value that is +1e-17 here and -1e-17 there, which rounds to +0 and -0, hashes alike: the sign bit of a zero made the iPhone's digest differ from the build's in the top bit, 22 Nov), and every edge's and node's ids): the file is current when it matches. */
export function skeletonDigest(skel: Skeleton): string {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1), u = new Uint32Array(f64.buffer);
  const num = (x: number): void => { f64[0] = Math.round(x * 1e6) || 0; for (const w of u) { h ^= w; h = Math.imul(h, 0x01000193) >>> 0; } };
  const str = (s: string): void => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const e of skel.edges) { str(e.id); str(e.from); str(e.to); num(e.bones[0]); num(e.bones[1]); }
  for (const n of skel.nodes) { str(n.id); for (const p of n.pos) p.forEach(num); for (const x of n.edges) { num(x.edge); num(x.end); } if (n.runOn) n.runOn.forEach(num); }
  for (const b of skel.bones) { num(b.edge); num(b.u); for (const p of b.pos) p.forEach(num); b.r.forEach(num); for (const f of b.frame) f.forEach(num); }
  return `${skel.edges.length}e${skel.nodes.length}n${skel.bones.length}b-${h.toString(16)}`;
}


/** snorm16 in a per-array scale (the array's largest |value|, so the error is that over 65534: a few 1e-4 of a bone radius). */
export function quantize(a: ArrayLike<number>): { scale: number; q: Int16Array } {
  let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]!));
  const q = new Int16Array(a.length); if (m > 0) for (let i = 0; i < a.length; i++) q[i] = Math.round((a[i]! / m) * 32767);
  return { scale: m, q };
}
export function dequantize(q: Int16Array, scale: number): Float32Array { const out = new Float32Array(q.length); for (let i = 0; i < q.length; i++) out[i] = (q[i]! / 32767) * scale; return out; }
/** A unit vector in 2 x int8 (octahedral; (-128, -128) marks the zero vector). */
export function octEncode(x: number, y: number, z: number, out: Int8Array, at: number): void {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (!(l > 1e-12)) { out[at] = -128; out[at + 1] = -128; return; }
  let u = x / l, v = y / l;
  if (z < 0) { const a = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), b = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = a; v = b; }
  out[at] = Math.round(u * 127); out[at + 1] = Math.round(v * 127);
}
export function octDecode(src: Int8Array, at: number, out: Float32Array, to: number): void {
  if (src[at] === -128 && src[at + 1] === -128) { out[to] = 0; out[to + 1] = 0; out[to + 2] = 0; return; }
  const u = src[at]! / 127, v = src[at + 1]! / 127;
  let x = u, y = v; const z = 1 - Math.abs(u) - Math.abs(v);
  if (z < 0) { x = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1); y = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); }
  const l = Math.hypot(x, y, z) || 1; out[to] = x / l; out[to + 1] = y / l; out[to + 2] = z / l;
}

/** u16 values as a delta sequence (wrapping), low bytes then high bytes: neighbours in an ordered mesh differ little, so gzip finds runs. */
export function planarDelta16(v: ArrayLike<number>, out: Uint8Array, at: number): void {
  const n = v.length; let prev = 0;
  for (let i = 0; i < n; i++) { const d = (v[i]! - prev) & 0xffff; prev = v[i]!; out[at + i] = d & 255; out[at + n + i] = d >> 8; }
}
export function unplanarDelta16(src: Uint8Array, at: number, n: number): Uint16Array {
  const out = new Uint16Array(n); let prev = 0;
  for (let i = 0; i < n; i++) { prev = (prev + (src[at + i]! | (src[at + n + i]! << 8))) & 0xffff; out[i] = prev; }
  return out;
}

const pad4 = (n: number): number => (n + 3) & ~3;
/** A key's vertex is stored only when it differs from key 0 by more than this (in bone radii, any component): a quarter of the fillet's tolerance (plan owner, 22 Nov). */
export const KEY_DELTA_MIN = 0.01;
const te = new TextEncoder();
/** The keys of every region, as bytes: each key as the sparse snorm8 delta from the mesh's own (decoded) offsets of the region's vertices. */
function encodeKeys(keys: NetMesh['keys'], baseOff: Float32Array, baseMap: Float32Array): Uint8Array {
  const parts: Uint8Array[] = [];
  const u32 = (...x: number[]): void => { const b = new Uint8Array(4 * x.length), dv = new DataView(b.buffer); x.forEach((v, i) => dv.setUint32(4 * i, v, true)); parts.push(b); };
  const f32 = (a: ArrayLike<number>): void => { const b = new Uint8Array(4 * a.length), dv = new DataView(b.buffer); for (let i = 0; i < a.length; i++) dv.setFloat32(4 * i, a[i]!, true); parts.push(b); };
  const raw = (a: ArrayBufferView): void => { const n = pad4(a.byteLength), b = new Uint8Array(n); b.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); parts.push(b); };
  u32(keys?.length ?? 0);
  for (const r of keys ?? []) {
    const name = te.encode(r.node); u32(name.length); raw(name);
    u32(r.variant, r.vertStart, r.vertCount, r.arms.length, ...r.arms, r.keys.length);
    const zero = { offset: baseOff.subarray(12 * r.vertStart, 12 * (r.vertStart + r.vertCount)), offsetMap: baseMap.subarray(12 * r.vertStart, 12 * (r.vertStart + r.vertCount)) };
    r.keys.forEach((k, kk) => {
      u32(k.state, k.folds[0], k.folds[1]); f32(k.swell);
      for (const nm of ['offset', 'offsetMap'] as const) {
        // the vertices that differ from key 0 by more than KEY_DELTA_MIN, and their deltas as snorm8 in the region's delta range
        const base = zero[nm], idx: number[] = [], n = r.vertCount;
        for (let v = 0; v < n; v++) { let big = false; for (let j = 0; j < 12; j++) if (Math.abs(k[nm][12 * v + j]! - base[12 * v + j]!) > KEY_DELTA_MIN) big = true; if (big) idx.push(v); }
        let scale = 0; for (const v of idx) for (let j = 0; j < 12; j++) scale = Math.max(scale, Math.abs(k[nm][12 * v + j]! - base[12 * v + j]!));
        const d = new Int8Array(12 * idx.length); idx.forEach((v, i) => { for (let j = 0; j < 12; j++) d[12 * i + j] = scale > 0 ? Math.round(((k[nm][12 * v + j]! - base[12 * v + j]!) / scale) * 127) : 0; });
        u32(idx.length); f32([scale]); raw(Uint16Array.from(idx)); raw(d);
      }
    });
  }
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function readKeys(buf: ArrayBuffer, at: number, baseOff: Float32Array, baseMap: Float32Array): { keys: NonNullable<NetMesh['keys']>; end: number } | null {
  if (buf.byteLength < at + 4) return null;
  const dv = new DataView(buf); let o = at; const out: NonNullable<NetMesh['keys']> = [];
  const u32 = (): number => { const x = dv.getUint32(o, true); o += 4; return x; };
  const f32 = (): number => { const x = dv.getFloat32(o, true); o += 4; return x; };
  const f32s = (n: number): Float32Array => { const a = new Float32Array(buf.slice(o, o + 4 * n)); o += 4 * n; return a; };
  for (let R = u32(); R > 0; R--) {
    if (o + 4 > buf.byteLength) return null;
    const len = u32(); if (o + pad4(len) + 20 > buf.byteLength) return null;
    const node = new TextDecoder().decode(new Uint8Array(buf, o, len)); o += pad4(len);
    const variant = u32() as 0 | 1, vertStart = u32(), vertCount = u32(), A = u32(), arms: number[] = []; for (let i = 0; i < A; i++) arms.push(u32());
    const keys: NonNullable<NetMesh['keys']>[number]['keys'] = [];
    if ((vertStart + vertCount) * 12 > baseOff.length) return null;
    const zero = { offset: baseOff.subarray(12 * vertStart, 12 * (vertStart + vertCount)), offsetMap: baseMap.subarray(12 * vertStart, 12 * (vertStart + vertCount)) };
    for (let K = u32(); K > 0; K--) {
      if (o + 12 + 4 * A + 8 > buf.byteLength) return null;
      const state = u32(), folds: [number, number] = [u32(), u32()], swell = Array.from(f32s(A)), arrs: Float32Array[] = [];
      for (const nm of ['offset', 'offsetMap'] as const) {
        const c = u32(), sc = f32(); if (c > vertCount || o + pad4(2 * c) + pad4(12 * c) > buf.byteLength) return null;
        const idx = new Uint16Array(buf.slice(o, o + 2 * c)); o += pad4(2 * c);
        const d = new Int8Array(buf.slice(o, o + 12 * c)); o += pad4(12 * c);
        const a = zero[nm].slice(); idx.forEach((v, i) => { for (let j = 0; j < 12; j++) a[12 * v + j] = a[12 * v + j]! + (d[12 * i + j]! / 127) * sc; });
        arrs.push(a);
      }
      keys.push({ state, folds, swell, offset: arrs[0]!, offsetMap: arrs[1]! });
    }
    out.push({ node, variant, vertStart, vertCount, arms, keys });
  }
  return { keys: out, end: o };
}
/** What of a junction's report is kept: everything the region rows and the draw need (not the rings' ids or the through-pair diagnostics). */
export const keptReport = (r: NodeReport): Partial<NodeReport> => ({ node: r.node, kind: r.kind, variant: r.variant, switchT: r.switchT, seams: r.seams, arms: r.arms, triStart: r.triStart, triCount: r.triCount, vertStart: r.vertStart, vertCount: r.vertCount, caps: r.caps, capBones: r.capBones, regionBones: r.regionBones });
export function encodeNet(m: NetMesh, digest: string, nodes: readonly NodeReport[] = []): ArrayBuffer {
  const V = m.position.length / 3, I = m.index.length, d = new TextEncoder().encode(digest), E = m.bakeScale?.length ?? 0;
  const json = new TextEncoder().encode(JSON.stringify(nodes.filter((n) => n.kind === 'junction').map(keptReport)));
  const qo = quantize(m.offset), qm = quantize(m.offsetMap), oct = new Int8Array(8 * V);
  const keyBlob = encodeKeys(m.keys, dequantize(qo.q, qo.scale), dequantize(qm.q, qm.scale)), kBytes = keyBlob.length;
  for (let v = 0; v < V; v++) for (let i = 0; i < 4; i++) octEncode(m.normal[12 * v + 3 * i]!, m.normal[12 * v + 3 * i + 1]!, m.normal[12 * v + 3 * i + 2]!, oct, 8 * v + 2 * i);
  const small = V <= 65535, ib = small ? 2 : 4, head = 20, total = head + pad4(d.length) + pad4(24 + 6 * V) + pad4(8 * V) + 16 * V + 8 + 24 * V + 8 * V + pad4(ib * I) + 24 * V + 4 + 4 * E + kBytes + 4 + pad4(json.length);
  const buf = new ArrayBuffer(total), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, V, true); dv.setUint32(12, small ? I | 0x80000000 : I, true); dv.setUint32(16, d.length, true);
  let o = head;
  new Uint8Array(buf, o, d.length).set(d); o += pad4(d.length);
  { // positions: u16 in the figure's box (the shader places every vertex from its bones; this is the rest shape for bounds), delta-coded per axis
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < V; v++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c]!, m.position[3 * v + c]!); hi[c] = Math.max(hi[c]!, m.position[3 * v + c]!); }
    new Float32Array(buf, o, 6).set([...lo, ...hi].map((x) => (Number.isFinite(x) ? x : 0)));
    const bytes = new Uint8Array(buf, o + 24, 6 * V);
    for (let c = 0; c < 3; c++) { const q = new Uint16Array(V), span = hi[c]! - lo[c]!; for (let v = 0; v < V; v++) q[v] = span > 0 ? Math.round(((m.position[3 * v + c]! - lo[c]!) / span) * 65535) : 0; planarDelta16(q, bytes, 2 * V * c); }
    o += pad4(24 + 6 * V);
  }
  new Uint16Array(buf, o, 4 * V).set(m.bone); o += pad4(8 * V);
  new Float32Array(buf, o, 4 * V).set(m.weight); o += 16 * V;
  dv.setFloat32(o, qo.scale, true); dv.setFloat32(o + 4, qm.scale, true); o += 8;
  new Int16Array(buf, o, 12 * V).set(qo.q); o += 24 * V;
  new Int8Array(buf, o, 8 * V).set(oct); o += 8 * V;
  if (small) planarDelta16(m.index, new Uint8Array(buf, o, 2 * I), 0); else new Uint32Array(buf, o, I).set(m.index);
  o += pad4(ib * I);
  new Int16Array(buf, o, 12 * V).set(qm.q); o += 24 * V;
  dv.setUint32(o, E, true); o += 4;
  if (m.bakeScale) new Float32Array(buf, o, E).set(m.bakeScale);
  o += 4 * E;
  new Uint8Array(buf, o, kBytes).set(keyBlob); o += kBytes;
  dv.setUint32(o, json.length, true); new Uint8Array(buf, o + 4, json.length).set(json);
  return buf;
}
export function decodeNet(buf: ArrayBuffer): { digest: string; mesh: NetMesh; /** the junction reports (`keptReport`) */ nodes: Partial<NodeReport>[] } | null {
  if (buf.byteLength < 24) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== VERSION) return null;
  const V = dv.getUint32(8, true), I0 = dv.getUint32(12, true), small = (I0 & 0x80000000) !== 0, I = I0 & 0x7fffffff, ib = small ? 2 : 4, D = dv.getUint32(16, true), head = 20;
  const fixed = head + pad4(D) + pad4(24 + 6 * V) + pad4(8 * V) + 16 * V + 8 + 24 * V + 8 * V + pad4(ib * I) + 24 * V + 4;
  if (buf.byteLength < fixed) return null;
  let o = head;
  const digest = new TextDecoder().decode(new Uint8Array(buf, o, D)); o += pad4(D);
  const position = new Float32Array(3 * V), pb = new Uint8Array(buf, o + 24, 6 * V), box = new Float32Array(buf.slice(o, o + 24));
  for (let c = 0; c < 3; c++) { const q = unplanarDelta16(pb, 2 * V * c, V), span = box[3 + c]! - box[c]!; for (let v = 0; v < V; v++) position[3 * v + c] = box[c]! + (q[v]! / 65535) * span; }
  o += pad4(24 + 6 * V);
  const bone = new Uint16Array(buf.slice(o, o + 8 * V)); o += pad4(8 * V);
  const weight = new Float32Array(buf.slice(o, o + 16 * V)); o += 16 * V;
  const so = dv.getFloat32(o, true), sm = dv.getFloat32(o + 4, true); o += 8;
  const offset = dequantize(new Int16Array(buf.slice(o, o + 24 * V)), so); o += 24 * V;
  const oct = new Int8Array(buf.slice(o, o + 8 * V)), normal = new Float32Array(12 * V); o += 8 * V;
  for (let v = 0; v < V; v++) for (let i = 0; i < 4; i++) octDecode(oct, 8 * v + 2 * i, normal, 12 * v + 3 * i);
  const index = small ? Uint32Array.from(unplanarDelta16(new Uint8Array(buf, o, 2 * I), 0, I)) : new Uint32Array(buf.slice(o, o + 4 * I)); o += pad4(ib * I);
  const offsetMap = dequantize(new Int16Array(buf.slice(o, o + 24 * V)), sm); o += 24 * V;
  const E = dv.getUint32(o, true); o += 4;
  if (buf.byteLength < o + 4 * E) return null;
  const bakeScale = new Float32Array(buf.slice(o, o + 4 * E)); o += 4 * E;
  const keys = readKeys(buf, o, offset, offsetMap);
  if (!keys || keys.end + 4 > buf.byteLength) return null;
  const jl = dv.getUint32(keys.end, true);
  if (keys.end + 4 + pad4(jl) !== buf.byteLength) return null;
  const nodes = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, keys.end + 4, jl))) as Partial<NodeReport>[];
  return { digest, nodes, mesh: { position, bone, weight, offset, normal, index, keys: keys.keys.length ? keys.keys : undefined, offsetMap, bakeScale } };
}
