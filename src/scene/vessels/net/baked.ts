// The baked network mesh file (public/anatomy/net-<n>.bin, gzip): written by `node scripts/bake-skins.mjs --net` at build time, so the page meshes nothing at load. One file per network (mesh.ts `networksOf`).
// Layout (little endian): u32 magic 'NETM', u32 version, u32 vertices V, u32 index length I, u32 digest length D; D bytes of digest (padded to 4); f32 position[3V]; u16 bone[4V] (padded to 4 bytes); f32 weight[4V]; f32 offset[12V]; f32 normal[12V]; u32 index[I]; f32 offsetMap[12V]; u32 edges E; f32 bakeScale[E]. (Version 5 appends, after the keys, the junction REPORTS the shader's region rows are built from (net/regions.ts `regionsOf`): u32 length and that many bytes of JSON, padded to 4 (node, variant, ranges, arms, seams, capsules, bones, windows).) (Version 4 appends the wide junctions' KEYS (net/keys.ts) after bakeScale: u32 R; per region: u32 node length, node bytes (padded to 4), u32 variant, u32 vertStart, u32 vertCount, u32 A, u32 arms[A], u32 K; per key: u32 state, u32 folds at the body pose, u32 folds at the map pose, f32 swell[A], f32 offset[12n], f32 offsetMap[12n], n = vertCount.) (Version 3: the map-pose fit, net/fit.ts, and the bake radius factors, ranges.ts.)
import type { NetMesh, Skeleton } from './types.ts';
import type { NodeReport } from './mesh.ts';

const MAGIC = 0x4d54454e, VERSION = 7;

/** A digest of the skeleton a mesh was baked from (FNV-1a over every bone's numbers and every edge's and node's ids): the file is current when it matches. */
export function skeletonDigest(skel: Skeleton): string {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1), u = new Uint32Array(f64.buffer);
  const num = (x: number): void => { f64[0] = x; for (const w of u) { h ^= w; h = Math.imul(h, 0x01000193) >>> 0; } };
  const str = (s: string): void => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const e of skel.edges) { str(e.id); str(e.from); str(e.to); num(e.bones[0]); num(e.bones[1]); }
  for (const n of skel.nodes) { str(n.id); for (const p of n.pos) p.forEach(num); for (const x of n.edges) { num(x.edge); num(x.end); } if (n.runOn) n.runOn.forEach(num); }
  for (const b of skel.bones) { num(b.edge); num(b.u); for (const p of b.pos) p.forEach(num); b.r.forEach(num); for (const f of b.frame) f.forEach(num); }
  return `${skel.edges.length}e${skel.nodes.length}n${skel.bones.length}b-${h.toString(16)}`;
}

const pad4 = (n: number): number => (n + 3) & ~3;
function keysBytes(keys: NetMesh['keys']): number {
  let n = 4;
  for (const r of keys ?? []) { n += 4 + pad4(new TextEncoder().encode(r.node).length) + 20 + 4 * r.arms.length; for (const k of r.keys) n += 12 + 4 * r.arms.length + 4 * (k.offset.length + k.offsetMap.length); }
  return n;
}
function writeKeys(buf: ArrayBuffer, at: number, keys: NetMesh['keys']): void {
  const dv = new DataView(buf); let o = at;
  const u32 = (x: number): void => { dv.setUint32(o, x, true); o += 4; }, f32s = (a: ArrayLike<number>): void => { for (let i = 0; i < a.length; i++) { dv.setFloat32(o, a[i]!, true); o += 4; } };
  u32(keys?.length ?? 0);
  for (const r of keys ?? []) {
    const name = new TextEncoder().encode(r.node); u32(name.length); new Uint8Array(buf, o, name.length).set(name); o += pad4(name.length);
    u32(r.variant); u32(r.vertStart); u32(r.vertCount); u32(r.arms.length); for (const a of r.arms) u32(a); u32(r.keys.length);
    for (const k of r.keys) { u32(k.state); u32(k.folds[0]); u32(k.folds[1]); f32s(k.swell); f32s(k.offset); f32s(k.offsetMap); }
  }
}
function readKeys(buf: ArrayBuffer, at: number): { keys: NonNullable<NetMesh['keys']>; end: number } | null {
  if (buf.byteLength < at + 4) return null;
  const dv = new DataView(buf); let o = at; const out: NonNullable<NetMesh['keys']> = [];
  const u32 = (): number => { const x = dv.getUint32(o, true); o += 4; return x; };
  const f32s = (n: number): Float32Array => { const a = new Float32Array(buf.slice(o, o + 4 * n)); o += 4 * n; return a; };
  for (let R = u32(); R > 0; R--) {
    if (o + 4 > buf.byteLength) return null;
    const len = u32(); if (o + pad4(len) + 20 > buf.byteLength) return null;
    const node = new TextDecoder().decode(new Uint8Array(buf, o, len)); o += pad4(len);
    const variant = u32() as 0 | 1, vertStart = u32(), vertCount = u32(), A = u32(), arms: number[] = []; for (let i = 0; i < A; i++) arms.push(u32());
    const keys: NonNullable<NetMesh['keys']>[number]['keys'] = [];
    for (let K = u32(); K > 0; K--) { if (o + 12 + 4 * (A + 24 * vertCount) > buf.byteLength) return null; keys.push({ state: u32(), folds: [u32(), u32()], swell: Array.from(f32s(A)), offset: f32s(12 * vertCount), offsetMap: f32s(12 * vertCount) }); }
    out.push({ node, variant, vertStart, vertCount, arms, keys });
  }
  return { keys: out, end: o };
}
/** What of a junction's report is kept: everything the region rows and the draw need (not the rings' ids or the through-pair diagnostics). */
export const keptReport = (r: NodeReport): Partial<NodeReport> => ({ node: r.node, kind: r.kind, variant: r.variant, switchT: r.switchT, seams: r.seams, arms: r.arms, triStart: r.triStart, triCount: r.triCount, vertStart: r.vertStart, vertCount: r.vertCount, caps: r.caps, capBones: r.capBones, regionBones: r.regionBones });
export function encodeNet(m: NetMesh, digest: string, nodes: readonly NodeReport[] = []): ArrayBuffer {
  const V = m.position.length / 3, I = m.index.length, d = new TextEncoder().encode(digest);
  const head = 20, dEnd = head + pad4(d.length), pEnd = dEnd + 12 * V, bEnd = pEnd + pad4(8 * V), wEnd = bEnd + 16 * V, oEnd = wEnd + 48 * V, nEnd = oEnd + 48 * V, iEnd = nEnd + 4 * I, E = m.bakeScale?.length ?? 0, kBytes = keysBytes(m.keys), json = new TextEncoder().encode(JSON.stringify(nodes.filter((n) => n.kind === 'junction').map(keptReport))), total = iEnd + 48 * V + 4 + 4 * E + kBytes + 4 + pad4(json.length);
  const buf = new ArrayBuffer(total), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, V, true); dv.setUint32(12, I, true); dv.setUint32(16, d.length, true);
  new Uint8Array(buf, head, d.length).set(d);
  new Float32Array(buf, dEnd, 3 * V).set(m.position);
  new Uint16Array(buf, pEnd, 4 * V).set(m.bone);
  new Float32Array(buf, bEnd, 4 * V).set(m.weight);
  new Float32Array(buf, wEnd, 12 * V).set(m.offset);
  new Float32Array(buf, oEnd, 12 * V).set(m.normal);
  new Uint32Array(buf, nEnd, I).set(m.index);
  new Float32Array(buf, iEnd, 12 * V).set(m.offsetMap);
  dv.setUint32(iEnd + 48 * V, E, true);
  if (m.bakeScale) new Float32Array(buf, iEnd + 48 * V + 4, E).set(m.bakeScale);
  writeKeys(buf, iEnd + 48 * V + 4 + 4 * E, m.keys);
  const jAt = iEnd + 48 * V + 4 + 4 * E + kBytes;
  dv.setUint32(jAt, json.length, true); new Uint8Array(buf, jAt + 4, json.length).set(json);
  return buf;
}
export function decodeNet(buf: ArrayBuffer): { digest: string; mesh: NetMesh; /** the junction reports (`keptReport`) */ nodes: Partial<NodeReport>[] } | null {
  if (buf.byteLength < 24) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== VERSION) return null;
  const V = dv.getUint32(8, true), I = dv.getUint32(12, true), D = dv.getUint32(16, true), head = 20, dEnd = head + pad4(D), pEnd = dEnd + 12 * V, bEnd = pEnd + pad4(8 * V), wEnd = bEnd + 16 * V, oEnd = wEnd + 48 * V, nEnd = oEnd + 48 * V, iEnd = nEnd + 4 * I;
  if (buf.byteLength < iEnd + 48 * V + 4) return null;
  const E = dv.getUint32(iEnd + 48 * V, true);
  const keys = readKeys(buf, iEnd + 48 * V + 4 + 4 * E);
  if (!keys || keys.end + 4 > buf.byteLength) return null;
  const jl = dv.getUint32(keys.end, true);
  if (keys.end + 4 + pad4(jl) !== buf.byteLength) return null;
  const nodes = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, keys.end + 4, jl))) as Partial<NodeReport>[];
  return {
    digest: new TextDecoder().decode(new Uint8Array(buf, head, D)), nodes,
    mesh: { position: new Float32Array(buf.slice(dEnd, pEnd)), bone: new Uint16Array(buf.slice(pEnd, pEnd + 8 * V)), weight: new Float32Array(buf.slice(bEnd, wEnd)), offset: new Float32Array(buf.slice(wEnd, oEnd)), normal: new Float32Array(buf.slice(oEnd, nEnd)), index: new Uint32Array(buf.slice(nEnd, iEnd)), keys: keys.keys.length ? keys.keys : undefined, offsetMap: new Float32Array(buf.slice(iEnd, iEnd + 48 * V)), bakeScale: new Float32Array(buf.slice(iEnd + 48 * V + 4, iEnd + 48 * V + 4 + 4 * E)) },
  };
}
