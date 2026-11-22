// The baked network mesh file (public/anatomy/net-<n>.bin, gzip): written by `node scripts/bake-skins.mjs --net` at build time, so the page meshes nothing at load. One file per network (mesh.ts `networksOf`).
// VERSION 8 (plan owner, 22 Nov, "Rulings on WP2"): the offsets and the keys are snorm16 in the bone frame (per array: f32 scale = its largest |value|, i16 q = round(value / scale * 32767)) and the rest normals oct-encoded to 2 x int8 per bone slot (-128, -128 = no normal), decoded to f32 on load: the GPU and every consumer see the same f32 NetMesh. The layout below says f32 where v8 stores the quantised form: position f32[3V]; bone u16[4V]; weight f32[4V]; f32 offsetScale, f32 offsetMapScale; offset i16[12V]; normal i8[8V]; index u32[I]; offsetMap i16[12V]; E; bakeScale; keys (per key: swell f32[A], f32 scale, i16 offset[12n], f32 scale, i16 offsetMap[12n]).
// Layout (little endian): u32 magic 'NETM', u32 version, u32 vertices V, u32 index length I, u32 digest length D; D bytes of digest (padded to 4); f32 position[3V]; u16 bone[4V] (padded to 4 bytes); f32 weight[4V]; f32 offset[12V]; f32 normal[12V]; u32 index[I]; f32 offsetMap[12V]; u32 edges E; f32 bakeScale[E]. (Version 5 appends, after the keys, the junction REPORTS the shader's region rows are built from (net/regions.ts `regionsOf`): u32 length and that many bytes of JSON, padded to 4 (node, variant, ranges, arms, seams, capsules, bones, windows).) (Version 4 appends the wide junctions' KEYS (net/keys.ts) after bakeScale: u32 R; per region: u32 node length, node bytes (padded to 4), u32 variant, u32 vertStart, u32 vertCount, u32 A, u32 arms[A], u32 K; per key: u32 state, u32 folds at the body pose, u32 folds at the map pose, f32 swell[A], f32 offset[12n], f32 offsetMap[12n], n = vertCount.) (Version 3: the map-pose fit, net/fit.ts, and the bake radius factors, ranges.ts.)
import type { NetMesh, Skeleton } from './types.ts';
import type { NodeReport } from './mesh.ts';

const MAGIC = 0x4d54454e, VERSION = 8;

/** A digest of the skeleton a mesh was baked from (FNV-1a over every bone's numbers, rounded to 1e-6 so a browser whose sin and cos differ from node's in the last bit still knows its own file, and every edge's and node's ids): the file is current when it matches. */
export function skeletonDigest(skel: Skeleton): string {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1), u = new Uint32Array(f64.buffer);
  const num = (x: number): void => { f64[0] = Math.round(x * 1e6); for (const w of u) { h ^= w; h = Math.imul(h, 0x01000193) >>> 0; } };
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

const pad4 = (n: number): number => (n + 3) & ~3;
function keysBytes(keys: NetMesh['keys']): number {
  let n = 4;
  for (const r of keys ?? []) { n += 4 + pad4(new TextEncoder().encode(r.node).length) + 20 + 4 * r.arms.length; for (const k of r.keys) n += 12 + 4 * r.arms.length + 8 + 2 * (k.offset.length + k.offsetMap.length); }
  return n;
}
function writeKeys(buf: ArrayBuffer, at: number, keys: NetMesh['keys']): void {
  const dv = new DataView(buf); let o = at;
  const u32 = (x: number): void => { dv.setUint32(o, x, true); o += 4; }, f32s = (a: ArrayLike<number>): void => { for (let i = 0; i < a.length; i++) { dv.setFloat32(o, a[i]!, true); o += 4; } }, snorm = (a: ArrayLike<number>): void => { const { scale, q } = quantize(a); dv.setFloat32(o, scale, true); o += 4; new Int16Array(buf, o, q.length).set(q); o += 2 * q.length; };
  u32(keys?.length ?? 0);
  for (const r of keys ?? []) {
    const name = new TextEncoder().encode(r.node); u32(name.length); new Uint8Array(buf, o, name.length).set(name); o += pad4(name.length);
    u32(r.variant); u32(r.vertStart); u32(r.vertCount); u32(r.arms.length); for (const a of r.arms) u32(a); u32(r.keys.length);
    for (const k of r.keys) { u32(k.state); u32(k.folds[0]); u32(k.folds[1]); f32s(k.swell); snorm(k.offset); snorm(k.offsetMap); }
  }
}
function readKeys(buf: ArrayBuffer, at: number): { keys: NonNullable<NetMesh['keys']>; end: number } | null {
  if (buf.byteLength < at + 4) return null;
  const dv = new DataView(buf); let o = at; const out: NonNullable<NetMesh['keys']> = [];
  const u32 = (): number => { const x = dv.getUint32(o, true); o += 4; return x; };
  const f32s = (n: number): Float32Array => { const a = new Float32Array(buf.slice(o, o + 4 * n)); o += 4 * n; return a; }, snorm = (n: number): Float32Array => { const sc = dv.getFloat32(o, true); o += 4; const a = dequantize(new Int16Array(buf.slice(o, o + 2 * n)), sc); o += 2 * n; return a; };
  for (let R = u32(); R > 0; R--) {
    if (o + 4 > buf.byteLength) return null;
    const len = u32(); if (o + pad4(len) + 20 > buf.byteLength) return null;
    const node = new TextDecoder().decode(new Uint8Array(buf, o, len)); o += pad4(len);
    const variant = u32() as 0 | 1, vertStart = u32(), vertCount = u32(), A = u32(), arms: number[] = []; for (let i = 0; i < A; i++) arms.push(u32());
    const keys: NonNullable<NetMesh['keys']>[number]['keys'] = [];
    for (let K = u32(); K > 0; K--) { if (o + 12 + 4 * A + 8 + 48 * vertCount > buf.byteLength) return null; keys.push({ state: u32(), folds: [u32(), u32()], swell: Array.from(f32s(A)), offset: snorm(12 * vertCount), offsetMap: snorm(12 * vertCount) }); }
    out.push({ node, variant, vertStart, vertCount, arms, keys });
  }
  return { keys: out, end: o };
}
/** What of a junction's report is kept: everything the region rows and the draw need (not the rings' ids or the through-pair diagnostics). */
export const keptReport = (r: NodeReport): Partial<NodeReport> => ({ node: r.node, kind: r.kind, variant: r.variant, switchT: r.switchT, seams: r.seams, arms: r.arms, triStart: r.triStart, triCount: r.triCount, vertStart: r.vertStart, vertCount: r.vertCount, caps: r.caps, capBones: r.capBones, regionBones: r.regionBones });
export function encodeNet(m: NetMesh, digest: string, nodes: readonly NodeReport[] = []): ArrayBuffer {
  const V = m.position.length / 3, I = m.index.length, d = new TextEncoder().encode(digest), E = m.bakeScale?.length ?? 0, kBytes = keysBytes(m.keys);
  const json = new TextEncoder().encode(JSON.stringify(nodes.filter((n) => n.kind === 'junction').map(keptReport)));
  const qo = quantize(m.offset), qm = quantize(m.offsetMap), oct = new Int8Array(8 * V);
  for (let v = 0; v < V; v++) for (let i = 0; i < 4; i++) octEncode(m.normal[12 * v + 3 * i]!, m.normal[12 * v + 3 * i + 1]!, m.normal[12 * v + 3 * i + 2]!, oct, 8 * v + 2 * i);
  const head = 20, total = head + pad4(d.length) + 12 * V + pad4(8 * V) + 16 * V + 8 + 24 * V + 8 * V + 4 * I + 24 * V + 4 + 4 * E + kBytes + 4 + pad4(json.length);
  const buf = new ArrayBuffer(total), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, V, true); dv.setUint32(12, I, true); dv.setUint32(16, d.length, true);
  let o = head;
  new Uint8Array(buf, o, d.length).set(d); o += pad4(d.length);
  new Float32Array(buf, o, 3 * V).set(m.position); o += 12 * V;
  new Uint16Array(buf, o, 4 * V).set(m.bone); o += pad4(8 * V);
  new Float32Array(buf, o, 4 * V).set(m.weight); o += 16 * V;
  dv.setFloat32(o, qo.scale, true); dv.setFloat32(o + 4, qm.scale, true); o += 8;
  new Int16Array(buf, o, 12 * V).set(qo.q); o += 24 * V;
  new Int8Array(buf, o, 8 * V).set(oct); o += 8 * V;
  new Uint32Array(buf, o, I).set(m.index); o += 4 * I;
  new Int16Array(buf, o, 12 * V).set(qm.q); o += 24 * V;
  dv.setUint32(o, E, true); o += 4;
  if (m.bakeScale) new Float32Array(buf, o, E).set(m.bakeScale);
  o += 4 * E;
  writeKeys(buf, o, m.keys); o += kBytes;
  dv.setUint32(o, json.length, true); new Uint8Array(buf, o + 4, json.length).set(json);
  return buf;
}
export function decodeNet(buf: ArrayBuffer): { digest: string; mesh: NetMesh; /** the junction reports (`keptReport`) */ nodes: Partial<NodeReport>[] } | null {
  if (buf.byteLength < 24) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== VERSION) return null;
  const V = dv.getUint32(8, true), I = dv.getUint32(12, true), D = dv.getUint32(16, true), head = 20;
  const fixed = head + pad4(D) + 12 * V + pad4(8 * V) + 16 * V + 8 + 24 * V + 8 * V + 4 * I + 24 * V + 4;
  if (buf.byteLength < fixed) return null;
  let o = head;
  const digest = new TextDecoder().decode(new Uint8Array(buf, o, D)); o += pad4(D);
  const position = new Float32Array(buf.slice(o, o + 12 * V)); o += 12 * V;
  const bone = new Uint16Array(buf.slice(o, o + 8 * V)); o += pad4(8 * V);
  const weight = new Float32Array(buf.slice(o, o + 16 * V)); o += 16 * V;
  const so = dv.getFloat32(o, true), sm = dv.getFloat32(o + 4, true); o += 8;
  const offset = dequantize(new Int16Array(buf.slice(o, o + 24 * V)), so); o += 24 * V;
  const oct = new Int8Array(buf.slice(o, o + 8 * V)), normal = new Float32Array(12 * V); o += 8 * V;
  for (let v = 0; v < V; v++) for (let i = 0; i < 4; i++) octDecode(oct, 8 * v + 2 * i, normal, 12 * v + 3 * i);
  const index = new Uint32Array(buf.slice(o, o + 4 * I)); o += 4 * I;
  const offsetMap = dequantize(new Int16Array(buf.slice(o, o + 24 * V)), sm); o += 24 * V;
  const E = dv.getUint32(o, true); o += 4;
  if (buf.byteLength < o + 4 * E) return null;
  const bakeScale = new Float32Array(buf.slice(o, o + 4 * E)); o += 4 * E;
  const keys = readKeys(buf, o);
  if (!keys || keys.end + 4 > buf.byteLength) return null;
  const jl = dv.getUint32(keys.end, true);
  if (keys.end + 4 + pad4(jl) !== buf.byteLength) return null;
  const nodes = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, keys.end + 4, jl))) as Partial<NodeReport>[];
  return { digest, nodes, mesh: { position, bone, weight, offset, normal, index, keys: keys.keys.length ? keys.keys : undefined, offsetMap, bakeScale } };
}
