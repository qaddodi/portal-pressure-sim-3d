// The organs, finished at BUILD time (scripts/bake-organs.mjs writes `anatomy/organs-baked.bin` into the site). prepare.ts is about 2 s of CPU on a laptop (the rim's silhouette and welds, the smoothed normals twice an organ,
// the depth term, the tail fade) and gives the same numbers on every start, so a phone does it once, in the build, and reads the result. The file is the organs AFTER prepare.ts: the positions (int16 at 1/8000, the
// resolution of the source file), the triangles, the baked depth (bytes), the outline's steps from the rim (0..3, bytes), the two smoothed normals (snorm16) and the duodenum's tail fade; the surface normal is
// recomputed from the positions on load (a few ms). The digest it carries is of everything it was made from (the organs file, the caudate outline's code, the pipeline's source): a page built from other inputs
// never lays it in and runs prepare.ts live, as before (a dev server, a build whose bake failed).
// Layout: "ORB2", u32 header length, the header as JSON (each array a reference: where, how many, and the reversible transform it was written under, bake-pack.ts), then the
// arrays' bytes. The arrays come back bit for bit; the
// stomach as the organs file has it (RAW_IDS) is the finished stomach's own positions and triangles (the placed organs keep their vertices where the file has them), so the file holds it once.
import { splitIndex } from './subdivide.ts';
import { PackWriter, unpackRef, type PackArray, type PackRef } from '../bake-pack.ts';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';

const MAGIC = 0x33425f4f;   // "O_B3" little-endian: bytes 'O','_','B','3'
/** Position resolution: the organs file's own (organs-manifest.json q). */
export const BAKED_Q = 8000;
/**
 * The octahedral normals' resolution: each of the two numbers a normal is stored as is a whole number from -SNORM to SNORM
 * (11 bits and a sign; 25 Nov, before: 32767). The step is 1/1023 of the fold's square, which turns a unit normal by at most
 * 1.5e-3 radians (a tenth of a degree): a shade (dot with the light) moves by under 0.4 of a level in 255, and a cel band's edge
 * by less than a thousandth of a pixel's run. The low bits of sixteen were noise that gzip could not shrink: a third of the
 * organs' bytes (tests/organs-baked.test.ts holds the error).
 */
export const SNORM = 1023;
/** The organs kept as the organs file has them, besides the finished ones: the scope fits its esophagus to the raw stomach (devices/probes/scope.ts), and with the file laid in the page never fetches organs.bin. */
export const RAW_IDS: readonly string[] = ['stomach'];

interface Head { digest: string; organs: { id: string; /** the organ's arrays by name (q, ix, depthAo, ringD, rimD, rimC, shadeN, hullN, esoA, nrm, and each EXTRA_ATTRS name) */ a: Record<string, PackRef>; verts: number; indices: number; wide: boolean; eso: boolean; /** a subdivided organ keeps only its parent triangles (this many indices); the children are made on load */ sub?: number; /** the rim strip's profile (rim-profile.ts), when the organ has one */ prof?: number[]; /** further per-vertex floats it carries (EXTRA_ATTRS: the placed stomach's cut, the duodenum's share of the stomach's look) */ extra?: string[]; /** its surface normal is kept in the file, not made again from the triangles: a gut tube's round one, or one the file's grid cannot give back (the placed stomach's twice-split esophagus has triangles a few grid steps wide) */ nrm?: true; /** a gut tube (prepare.ts userData.tube) */ tube?: true }[]; raw: { id: string; verts: number; indices: number; /** the finished organ whose positions and triangles these are (no arrays of its own) */ of?: string; a?: { q: PackRef; ix: PackRef } }[] }
const pad4 = (n: number) => (n + 3) & ~3;
/** The per-vertex floats an organ may carry besides the ones every organ has (the approved placement's: organs/placed.ts stomachCut `cutA`, organs/gut-tubes.ts `tos`), kept exactly. */
export const EXTRA_ATTRS: readonly string[] = ['cutA', 'tos'];

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

/** The finished geometries as a file's bytes (what `prepareOrgans` returned, in its order). `gz`: the size gzip gives some bytes (bake-pack.ts PackWriter; node's by default). */
export function encodeOrgans(
  made: readonly (readonly [string, BufferGeometry])[],
  digest: string,
  raw: readonly (readonly [string, BufferGeometry])[] = [],
  gz?: (b: Uint8Array) => number,
): Uint8Array {
  const w = new PackWriter(gz);
  const head: Head = { digest, organs: [], raw: [] };
  const kept = new Map<string, { q: Int16Array; ix: Uint16Array }>();   // (what the raw organs may point at)
  for (const [id, g] of made) {
    const pos = g.getAttribute('position').array, n = pos.length / 3, idx = g.index!.array;
    let top = 0; for (let i = 0; i < idx.length; i++) if (idx[i]! > top) top = idx[i]!;
    const wide = top > 65535;
    const q = new Int16Array(n * 3);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(pos[i]! * BAKED_Q);
    const a: Record<string, PackRef> = { q: w.add(q) };
    const parent = g.userData.subParent as Uint32Array | undefined;   // (subdivide.ts: the file keeps the parent triangles and the page splits them again: a third of the bytes)
    const ix = parent && parent.length * 4 === idx.length ? Uint16Array.from(parent) : wide ? new Uint32Array(idx) : new Uint16Array(idx);
    a.ix = w.add(ix);
    if (ix instanceof Uint16Array && !(parent && parent.length * 4 === idx.length)) kept.set(id, { q, ix });
    a.depthAo = w.add(g.getAttribute('depthAo').array as Uint8Array);
    a.ringD = w.add(Uint8Array.from(g.getAttribute('ringD').array, (v) => v));
    const prof = g.userData.rimProfile as number[] | undefined;   // (rim-profile.ts: two whole bytes a vertex and the organ's eight-point profile)
    if (prof) for (const k of ['rimD', 'rimC']) a[k] = w.add(Uint8Array.from(g.getAttribute(k).array, (v) => Math.round(v * 255)));
    for (const k of ['shadeN', 'hullN']) { const s = new Int16Array(n * 2); octEncode(g.getAttribute(k).array, s); a[k] = w.add(s); }
    const eso = g.getAttribute('esoA');
    if (eso) a.esoA = w.add(eso.array as Float32Array);
    const extra = EXTRA_ATTRS.filter((k) => g.getAttribute(k));
    for (const k of extra) a[k] = w.add(Float32Array.from(g.getAttribute(k).array));
    const tube = !!g.userData.tube, nrm = tube || !gridKeepsNormals(q, idx, g.getAttribute('normal').array);
    if (nrm) { const s = new Int16Array(n * 2); octEncode(g.getAttribute('normal').array, s); a.nrm = w.add(s); }
    head.organs.push({
      id, a, verts: n, indices: idx.length, wide, eso: !!eso,
      ...(parent && parent.length * 4 === idx.length ? { sub: parent.length } : {}),
      ...(prof ? { prof } : {}), ...(extra.length ? { extra } : {}), ...(nrm ? { nrm: true as const } : {}), ...(tube ? { tube: true as const } : {}),
    });
  }
  for (const [id, g] of raw) {   // (organs as the file gives them, before prepare: what the scope's esophagus is fitted to; the stomach's mesh in meshes.ts)
    const pos = g.getAttribute('position').array, q = new Int16Array(pos.length);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(pos[i]! * BAKED_Q);
    const ix = new Uint16Array(g.index!.array), twin = kept.get(id);
    const alike = !!twin && twin.q.length === q.length && twin.ix.length === ix.length && twin.q.every((v, i) => v === q[i]) && twin.ix.every((v, i) => v === ix[i]);
    head.raw.push({ id, verts: pos.length / 3, indices: g.index!.array.length, ...(alike ? { of: id } : { a: { q: w.add(q), ix: w.add(ix) } }) });
  }
  const json = new TextEncoder().encode(JSON.stringify(head)), data = w.finish(), start = pad4(8 + json.length);
  const out = new Uint8Array(start + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, json.length, true); out.set(json, 8); out.set(data, start);
  return out;
}

/** Whether the surface normals made again from the file's positions (on the grid) are the live ones, within 0.99 (the bar tests/organs-baked.test.ts holds them to; today's organs all pass it, so their file is as before): when not, the file keeps the normals. */
function gridKeepsNormals(q: Int16Array, idx: ArrayLike<number>, live: ArrayLike<number>): boolean {
  const g = new BufferGeometry(), pos = Float32Array.from(q, (v) => v / BAKED_Q);
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(Array.from(idx)); g.computeVertexNormals();
  const m = g.getAttribute('normal').array;
  for (let i = 0; i < m.length; i += 3) if (m[i]! * live[i]! + m[i + 1]! * live[i + 1]! + m[i + 2]! * live[i + 2]! <= 0.99) return false;
  return true;
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
  const start = pad4(8 + hl);
  const get = <T extends PackArray>(r: PackRef | undefined): T => { if (!r) throw new Error('baked organs: an array is missing'); return unpackRef(buf, start, r) as T; };
  try {
    const own = new Map<string, { q: Int16Array; ix: Uint16Array }>();
    const organs = head.organs.map((o): [string, BufferGeometry] => {
      const g = new BufferGeometry(), n = o.verts, A = o.a;
      const q = get<Int16Array>(A.q), pos = new Float32Array(n * 3);
      for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / BAKED_Q;
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      if (o.sub) { const kids = splitIndex(get<Uint16Array>(A.ix)).index; g.setIndex(o.wide ? new Uint32BufferAttribute(kids, 1) : new Uint16BufferAttribute(Uint16Array.from(kids), 1)); }
      else if (o.wide) g.setIndex(new Uint32BufferAttribute(get<Uint32Array>(A.ix), 1));
      else { const ix = get<Uint16Array>(A.ix); g.setIndex(new Uint16BufferAttribute(ix, 1)); own.set(o.id, { q, ix }); }
      g.computeVertexNormals();
      g.setAttribute('depthAo', new BufferAttribute(get<Uint8Array>(A.depthAo), 1, true));
      g.setAttribute('ringD', new Float32BufferAttribute(Float32Array.from(get<Uint8Array>(A.ringD)), 1));
      if (o.prof) { for (const k of ['rimD', 'rimC']) g.setAttribute(k, new Float32BufferAttribute(Float32Array.from(get<Uint8Array>(A[k]), (v) => v / 255), 1)); g.userData.rimProfile = o.prof; }
      for (const k of ['shadeN', 'hullN']) { const f = new Float32Array(n * 3); octDecode(get<Int16Array>(A[k]), f); g.setAttribute(k, new Float32BufferAttribute(f, 3)); }
      if (o.eso) g.setAttribute('esoA', new Float32BufferAttribute(get<Float32Array>(A.esoA), 1));
      for (const k of o.extra ?? []) g.setAttribute(k, new Float32BufferAttribute(get<Float32Array>(A[k]), 1));
      if (o.nrm) { const f = new Float32Array(n * 3); octDecode(get<Int16Array>(A.nrm), f); g.setAttribute('normal', new Float32BufferAttribute(f, 3)); }
      if (o.tube) g.userData.tube = true;
      g.computeBoundingBox(); g.boundingSphere = null;
      return [o.id, g];
    });
    const raw: BakedOrgans['raw'] = {};
    for (const r of head.raw) {
      const twin = r.of ? own.get(r.of) : undefined;
      if (r.of && !twin) return null;
      const q = twin ? twin.q : get<Int16Array>(r.a?.q), ix = twin ? twin.ix : get<Uint16Array>(r.a?.ix);
      raw[r.id] = () => { const g = new BufferGeometry(), pos = new Float32Array(q.length); for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / BAKED_Q; g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(new Uint16BufferAttribute(ix.slice(), 1)); g.computeVertexNormals(); return g; };
    }
    return { digest: head.digest, organs, raw };
  } catch { return null; }
}
