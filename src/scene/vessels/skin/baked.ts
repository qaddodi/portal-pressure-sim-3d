// The Anatomy's junction skins baked at BUILD time (scripts/bake-skins.mjs writes `anatomy/skins.bin` into the site), so a phone remeshes nothing at load: planning and meshing the 14 skins is about 6 s of CPU on a laptop
// (the cava's IVCS alone 2 s), a stall before the first picture. The page fetches this one file as soon as the scene module loads (`bakedReady`), the boot waits for it with the fonts and the engine, the scene builds its skins from it
// and not from the planner, and the figure's first frame has them. The file carries the digest of what it was made from (the junctions and every arm tube's vertices, to 1e-4): a file for other numbers, or a page whose figure is not at rest
// when it loads, never lays it in, and the set plans and meshes live as before (a dev server, a build whose bake failed, a disease state loaded first).
// Layout, as the Lobule's (lobule/weld-codec.ts): "SKB1", u32 header length, the header as JSON (every typed array replaced by {$t, o, n}), padding to 4 bytes, then the arrays' bytes one after another.
import { weldDigest } from '../../lobule/weld-codec.ts';
import type { ArmTube, SkinPlan } from './cuts.ts';
import type { ArmAxis } from './skin-object.ts';
import type { SkinJunction, SkinMesh } from './types.ts';

/** One baked skin: the plan it was made from (its cuts, the vessels it hides whole, the node it merged with), the arms' drawn axes, the mesh, and the rung of the pace ladder (mesh.ts PACES) that closed it. */
export interface BakedSkin { plan: SkinPlan; axes: ArmAxis[]; mesh: SkinMesh; pace: number }
/** What `SkinSet.build` makes of the junctions it is given: the skins, the nodes that could not be built (named, with why) and the growing arms it dropped to build the rest. */
export interface BakedSkins { digest: string; skins: BakedSkin[]; lost: { node: string; message: string }[]; dropped: string[] }

const MAGIC = 0x31424b53;   // "SKB1"
type TA = Float32Array | Uint32Array | Int32Array;
const KINDS = { Float32Array, Uint32Array, Int32Array } as const;

/** What the skins are made from: the junctions (arms, centres, widths) and every arm tube's vertices to 1e-4 (the browser's sin and cos may differ from node's in the last bits, a phone must still know the file for its own). */
export function skinsDigest(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593, n = 0;
  const mix = (x: number) => { h1 = Math.imul(h1 ^ x, 16777619) >>> 0; h2 = Math.imul(h2 + x, 0x85ebca6b) >>> 0; h2 ^= h2 >>> 13; n++; };
  for (const id of [...tubes.keys()].sort()) {
    for (let i = 0; i < id.length; i++) mix(id.charCodeAt(i));
    const g = tubes.get(id)!.geometry.getAttribute('position');
    mix(tubes.get(id)!.tubular);
    for (let i = 0; i < g.count; i++) { mix(Math.round(g.getX(i) * 1e4) | 0); mix(Math.round(g.getY(i) * 1e4) | 0); mix(Math.round(g.getZ(i) * 1e4) | 0); }
  }
  return `${weldDigest(js)}/${h1.toString(16)}-${h2.toString(16)}-${n}`;
}

export function encodeSkins(b: BakedSkins): Uint8Array {
  const blobs: TA[] = []; let bytes = 0;
  const pack = (v: unknown): unknown => {
    if (v instanceof Float32Array || v instanceof Uint32Array || v instanceof Int32Array) { const o = bytes; blobs.push(v); bytes += v.byteLength; return { $t: v.constructor.name, o, n: v.length }; }
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object') { const out: Record<string, unknown> = {}; for (const k of Object.keys(v)) out[k] = pack((v as Record<string, unknown>)[k]); return out; }
    return v;
  };
  // (the mesh holds the plan's junction and cuts again: they are put back on unpacking, not written twice)
  const skins = b.skins.map((s) => ({ plan: pack(s.plan), axes: pack(s.axes), pace: s.pace, mesh: pack({ ...s.mesh, junction: undefined, cuts: undefined }) }));
  const head = new TextEncoder().encode(JSON.stringify({ digest: b.digest, lost: b.lost, dropped: b.dropped, skins }));
  const headPad = (4 - ((8 + head.length) % 4)) % 4, start = 8 + head.length + headPad;
  const out = new Uint8Array(start + bytes), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, head.length, true); out.set(head, 8);
  let at = start;
  for (const t of blobs) { out.set(new Uint8Array(t.buffer, t.byteOffset, t.byteLength), at); at += t.byteLength; }
  return out;
}

/** The skins in a baked file, or null when the file is not one. (Whether it is the file for THESE tubes is the caller's: `digest`.) */
export function decodeSkins(buf: ArrayBuffer): BakedSkins | null {
  if (buf.byteLength < 8) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) return null;
  const hl = dv.getUint32(4, true), headPad = (4 - ((8 + hl) % 4)) % 4, start = 8 + hl + headPad;
  let head: { digest: string; lost: BakedSkins['lost']; dropped: string[]; skins: { plan: unknown; axes: unknown; pace: number; mesh: unknown }[] };
  try { head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))); } catch { return null; }
  const unpack = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.$t === 'string') { const K = KINDS[o.$t as keyof typeof KINDS]; return new K(buf.slice(start + (o.o as number), start + (o.o as number) + (o.n as number) * 4)); }
      const out: Record<string, unknown> = {}; for (const k of Object.keys(o)) out[k] = unpack(o[k]); return out;
    }
    return v;
  };
  try {
    const skins = head.skins.map((s) => {
      const plan = unpack(s.plan) as SkinPlan, mesh = unpack(s.mesh) as SkinMesh;
      mesh.junction = plan.junction; mesh.cuts = plan.cuts;
      return { plan, axes: unpack(s.axes) as ArmAxis[], mesh, pace: s.pace };
    });
    return { digest: head.digest, lost: head.lost, dropped: head.dropped, skins };
  } catch { return null; }
}

// ---- the page's side: fetched once, as early as the scene module loads, waited for by the boot -------------------------------------------------

/** Where the baked files are, next to the page (the same folder in a preview and on the live site): the Anatomy's skins and the Circuit's (circuit/skins.ts, made by the same script). */
export const BAKED_SKINS = 'anatomy/skins.bin';
export const BAKED_CIRCUIT_SKINS = 'anatomy/circuit-skins.bin';

let held: BakedSkins | null = null;
let heldCircuit: BakedSkins | null = null;
const browser = typeof window !== 'undefined' && typeof fetch !== 'undefined' && typeof DecompressionStream !== 'undefined';
async function fetchSkins(name: string): Promise<BakedSkins | null> {
  try {
    const env = (import.meta as { env?: { BASE_URL?: string } }).env;
    const r = await fetch(`${env?.BASE_URL ?? '/'}${name}`);
    if (!r.ok || !r.body) return null;
    return decodeSkins(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  } catch { return null; }
}
async function load(): Promise<void> { [held, heldCircuit] = await Promise.all([fetchSkins(BAKED_SKINS), fetchSkins(BAKED_CIRCUIT_SKINS)]); }
const loading: Promise<void> | null = browser ? load() : null;

/** The skins baked for this build, once `bakedReady` has settled (null: none, or not the file for this figure: the set then plans live). */
export const bakedSkins = (): BakedSkins | null => held;
/** The Circuit's skins baked for this build (the same file's twin: null when none, or not for this figure). */
export const bakedCircuitSkins = (): BakedSkins | null => heldCircuit;
/** Whether the page is still fetching the baked file (always false off the page: a test, a script). */
export const bakedPending = (): boolean => loading !== null && !settled;
let settled = !loading;
/** Resolves, never rejects, when the file is in or known to be missing. The scene builds its skins after it, the boot waits for it. */
export const bakedReady: Promise<void> = (loading ?? Promise.resolve()).then(() => { settled = true; });
