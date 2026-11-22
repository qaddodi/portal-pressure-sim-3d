// The baked network mesh file (public/anatomy/net-<n>.bin, gzip): written by `node scripts/bake-skins.mjs --net` at build time, so the page meshes nothing at load. One file per network (mesh.ts `networksOf`).
// Layout (little endian): u32 magic 'NETM', u32 version, u32 vertices V, u32 index length I, u32 digest length D; D bytes of digest (padded to 4); f32 position[3V]; u16 bone[4V] (padded to 4 bytes); f32 weight[4V]; f32 offset[12V]; u32 index[I].
import type { NetMesh, Skeleton } from './types.ts';

const MAGIC = 0x4d54454e, VERSION = 1;

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
export function encodeNet(m: NetMesh, digest: string): ArrayBuffer {
  const V = m.position.length / 3, I = m.index.length, d = new TextEncoder().encode(digest);
  const head = 20, dEnd = head + pad4(d.length), pEnd = dEnd + 12 * V, bEnd = pEnd + pad4(8 * V), wEnd = bEnd + 16 * V, oEnd = wEnd + 48 * V, total = oEnd + 4 * I;
  const buf = new ArrayBuffer(total), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, V, true); dv.setUint32(12, I, true); dv.setUint32(16, d.length, true);
  new Uint8Array(buf, head, d.length).set(d);
  new Float32Array(buf, dEnd, 3 * V).set(m.position);
  new Uint16Array(buf, pEnd, 4 * V).set(m.bone);
  new Float32Array(buf, bEnd, 4 * V).set(m.weight);
  new Float32Array(buf, wEnd, 12 * V).set(m.offset);
  new Uint32Array(buf, oEnd, I).set(m.index);
  return buf;
}
export function decodeNet(buf: ArrayBuffer): { digest: string; mesh: NetMesh } | null {
  if (buf.byteLength < 20) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== VERSION) return null;
  const V = dv.getUint32(8, true), I = dv.getUint32(12, true), D = dv.getUint32(16, true), head = 20, dEnd = head + pad4(D), pEnd = dEnd + 12 * V, bEnd = pEnd + pad4(8 * V), wEnd = bEnd + 16 * V, oEnd = wEnd + 48 * V;
  if (buf.byteLength !== oEnd + 4 * I) return null;
  return {
    digest: new TextDecoder().decode(new Uint8Array(buf, head, D)),
    mesh: { position: new Float32Array(buf.slice(dEnd, pEnd)), bone: new Uint16Array(buf.slice(pEnd, pEnd + 8 * V)), weight: new Float32Array(buf.slice(bEnd, wEnd)), offset: new Float32Array(buf.slice(wEnd, oEnd)), index: new Uint32Array(buf.slice(oEnd, oEnd + 4 * I)) },
  };
}
