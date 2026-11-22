// The organs, finished at BUILD time (scripts/bake-organs.mjs writes `anatomy/organs-baked.bin` into the site). prepare.ts is about 2 s of CPU on a laptop (the rim's silhouette and welds, the smoothed normals twice an organ,
// the depth term, the tail fade) and gives the same numbers on every start, so a phone does it once, in the build, and reads the result. The file is the organs AFTER prepare.ts: the positions (int16 at 1/8000, the
// resolution of the source file), the triangles, the baked depth (bytes), the outline's steps from the rim (0..3, bytes), the two smoothed normals (snorm16) and the duodenum's tail fade; the surface normal is
// recomputed from the positions on load (a few ms). The digest it carries is of everything it was made from (the organs file, the caudate outline's code, the pipeline's source): a page built from other inputs
// never lays it in and runs prepare.ts live, as before (a dev server, a build whose bake failed).
// Layout: "ORB1", u32 header length, the header as JSON, padding to 4 bytes, then each organ's arrays one after another, each padded to 4.
import { splitIndex } from './subdivide.ts';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';

const MAGIC = 0x31425f4f;   // "O_B1" little-endian: bytes 'O','_','B','1'
/** Position resolution: the organs file's own (organs-manifest.json q). */
export const BAKED_Q = 8000;
const SNORM = 32767;
/** The organs kept as the organs file has them, besides the finished ones: the scope fits its esophagus to the raw stomach (devices/probes/scope.ts), and with the file laid in the page never fetches organs.bin. */
export const RAW_IDS: readonly string[] = ['stomach'];

interface Head { digest: string; organs: { id: string; verts: number; indices: number; wide: boolean; eso: boolean; /** a subdivided organ keeps only its parent triangles (this many indices); the children are made on load */ sub?: number }[]; raw: { id: string; verts: number; indices: number }[] }
const pad4 = (n: number) => (n + 3) & ~3;

/** A unit vector as two snorm16 (octahedral: the sphere folded onto a square; error under 1e-4, 4 bytes where snorm16 x3 is 6). */
function octEncode(a: ArrayLike<number>, out: Int16Array): void {
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i]!, y = a[i + 1]!, z = a[i + 2]!, l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
    let px = x / l, py = y / l;
    if (z < 0) { const qx = (1 - Math.abs(py)) * (px >= 0 ? 1 : -1), qy = (1 - Math.abs(px)) * (py >= 0 ? 1 : -1); px = qx; py = qy; }
    out[(i / 3) * 2] = Math.round(px * SNORM); out[(i / 3) * 2 + 1] = Math.round(py * SNORM);
  }
}
function octDecode(s: Int16Array, out: Float32Array): void {
  for (let i = 0; i < s.length; i += 2) {
    let x = s[i]! / SNORM, y = s[i + 1]! / SNORM;
    const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) { const qx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1), qy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1); x = qx; y = qy; }
    const l = Math.hypot(x, y, z) || 1, o = (i / 2) * 3;
    out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
  }
}

/** The finished geometries as a file's bytes (what `prepareOrgans` returned, in its order). */
export function encodeOrgans(made: readonly (readonly [string, BufferGeometry])[], digest: string, raw: readonly (readonly [string, BufferGeometry])[] = []): Uint8Array {
  const parts: Uint8Array[] = [];
  const head: Head = { digest, organs: [], raw: [] };
  const put = (view: ArrayBufferView) => { const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength); const p = new Uint8Array(pad4(b.length)); p.set(b); parts.push(p); };
  for (const [id, g] of made) {
    const pos = g.getAttribute('position').array, n = pos.length / 3, idx = g.index!.array;
    let top = 0; for (let i = 0; i < idx.length; i++) if (idx[i]! > top) top = idx[i]!;
    const wide = top > 65535;
    const q = new Int16Array(n * 3);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(pos[i]! * BAKED_Q);
    put(q);
    const parent = g.userData.subParent as Uint32Array | undefined;   // (subdivide.ts: the file keeps the parent triangles and the page splits them again: a third of the bytes)
    if (parent && parent.length * 4 === idx.length) put(Uint16Array.from(parent)); else put(wide ? new Uint32Array(idx) : new Uint16Array(idx));
    put(g.getAttribute('depthAo').array as Uint8Array);
    put(Uint8Array.from(g.getAttribute('ringD').array, (v) => v));
    for (const k of ['shadeN', 'hullN']) { const s = new Int16Array(n * 2); octEncode(g.getAttribute(k).array, s); put(s); }
    const eso = g.getAttribute('esoA');
    if (eso) put(eso.array as Float32Array);
    head.organs.push({ id, verts: n, indices: idx.length, wide, eso: !!eso, ...(parent && parent.length * 4 === idx.length ? { sub: parent.length } : {}) });
  }
  for (const [id, g] of raw) {   // (organs as the file gives them, before prepare: what the scope's esophagus is fitted to; ORGAN_MESHES.stomach in meshes.ts)
    const pos = g.getAttribute('position').array, q = new Int16Array(pos.length);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(pos[i]! * BAKED_Q);
    put(q); put(new Uint16Array(g.index!.array));
    head.raw.push({ id, verts: pos.length / 3, indices: g.index!.array.length });
  }
  const json = new TextEncoder().encode(JSON.stringify(head)), start = pad4(8 + json.length);
  const total = parts.reduce((s, p) => s + p.length, start), out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, json.length, true); out.set(json, 8);
  let at = start;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export interface BakedOrgans { digest: string; organs: [string, BufferGeometry][]; /** the organs as the organs file has them (before prepare), by id: made on first ask */ raw: Record<string, () => BufferGeometry> }

/** The organs in a baked file (finished geometries, what prepareOrgans makes), or null when the bytes are not one. Whether it is the file for THIS build is the caller's: `digest`. */
export function decodeOrgans(buf: ArrayBuffer): BakedOrgans | null {
  if (buf.byteLength < 8) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) return null;
  const hl = dv.getUint32(4, true);
  let head: Head;
  try { head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))); } catch { return null; }
  let at = pad4(8 + hl);
  const take = <T extends ArrayBufferView>(K: { new (b: ArrayBuffer, o: number, n: number): T; BYTES_PER_ELEMENT: number }, n: number): T => { const v = new K(buf, at, n); at += pad4(n * K.BYTES_PER_ELEMENT); return v; };
  try {
    const organs = head.organs.map((o): [string, BufferGeometry] => {
      const g = new BufferGeometry(), n = o.verts;
      const q = take(Int16Array, n * 3), pos = new Float32Array(n * 3);
      for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / BAKED_Q;
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      if (o.sub) { const kids = splitIndex(take(Uint16Array, o.sub)).index; g.setIndex(o.wide ? new Uint32BufferAttribute(kids, 1) : new Uint16BufferAttribute(Uint16Array.from(kids), 1)); }
      else g.setIndex(o.wide ? new Uint32BufferAttribute(take(Uint32Array, o.indices).slice(), 1) : new Uint16BufferAttribute(take(Uint16Array, o.indices).slice(), 1));
      g.computeVertexNormals();
      g.setAttribute('depthAo', new BufferAttribute(take(Uint8Array, n).slice(), 1, true));
      g.setAttribute('ringD', new Float32BufferAttribute(Float32Array.from(take(Uint8Array, n)), 1));
      for (const k of ['shadeN', 'hullN']) { const f = new Float32Array(n * 3); octDecode(take(Int16Array, n * 2), f); g.setAttribute(k, new Float32BufferAttribute(f, 3)); }
      if (o.eso) g.setAttribute('esoA', new Float32BufferAttribute(take(Float32Array, n).slice(), 1));
      g.computeBoundingBox(); g.boundingSphere = null;
      return [o.id, g];
    });
    const raw: BakedOrgans['raw'] = {};
    for (const r of head.raw) {
      const q = take(Int16Array, r.verts * 3), ix = take(Uint16Array, r.indices);
      raw[r.id] = () => { const g = new BufferGeometry(), pos = new Float32Array(q.length); for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / BAKED_Q; g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(new Uint16BufferAttribute(ix.slice(), 1)); g.computeVertexNormals(); return g; };
    }
    return { digest: head.digest, organs, raw };
  } catch { return null; }
}
