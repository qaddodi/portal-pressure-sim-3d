// The Anatomy's junction skins baked at BUILD time (scripts/bake-skins.mjs writes `anatomy/skins.bin` into the site), so a phone remeshes nothing at load: planning and meshing the 14 skins is
// about 6 s of CPU on a laptop
// (the cava's IVCS alone 2 s), a stall before the first picture. The page fetches this one file as soon as the scene module loads (`bakedReady`; the Circuit's twin is fetched later, see
// `requestCircuitSkins`), the boot waits for it with the fonts and the engine, the scene builds its skins from it
// and not from the planner, and the figure's first frame has them. The file carries the fingerprint of what it was made from (the junctions and every arm tube's input, scene/fingerprint.ts): a file for other
// numbers, or a page whose figure is not at rest
// when it loads, never lays it in, and the set plans and meshes live as before (a dev server, a build whose bake failed, a disease state loaded first).
// Layout, as the Lobule's (lobule/weld-codec.ts): "SKB2", u32 header length, the header as JSON (every typed array replaced by its reference {$t, o, n, m}), padding to 4 bytes, then the
// arrays' bytes, each through a reversible transform (bake-pack.ts: read back bit for bit).
import { fetchBin } from '../../../boot/fetch-bin.ts';
import { spanAsync } from '../../../boot/spans.ts';
import { Printer, printString } from '../../fingerprint.ts';
import { PackWriter, isRef, unpackRef } from '../../bake-pack.ts';
import type { ArmTube, SkinPlan } from './cuts.ts';
import type { ArmAxis } from './skin-object.ts';
import type { SkinJunction, SkinMesh } from './types.ts';
import { partOf, partSpecs, plainOf } from './plain.ts';

import { ANATOMY_ID } from '../../anatomy/source.ts';
/** One baked skin: the plan it was made from (its cuts, the vessels it hides whole, the node it merged with), the arms' drawn axes, the mesh, and the rung of the pace ladder (mesh.ts
 *  PACES) that closed it. */
export interface BakedSkin { plan: SkinPlan; axes: ArmAxis[]; mesh: SkinMesh; pace: number; /** the plain trunk of a skin with growing arms (plain.ts): its axes, mesh and pace; null when it could not be built (the weld then runs over the tubes' cut ends alone); absent on a skin with no growing arm */ plain?: PlainBake | null; /** the parts of a skin with more than one growing arm (plain.ts partOf), by the key of the growers that are there (partKey): the skin of the permanent arms and just those growers; null when one could not be built; absent in a file made before parts */ parts?: Record<string, PlainBake | null> }
/** The plain trunk of one baked skin: the welded skin's axes of the arms that stay, its mesh and the rung of the pace ladder that closed it. */
export interface PlainBake { axes: ArmAxis[]; mesh: SkinMesh; pace: number }
/** What `SkinSet.build` makes of the junctions it is given: the skins, the nodes that could not be built (named, with why) and the growing arms it dropped to build the rest. */
export interface BakedSkins { digest: string; skins: BakedSkin[]; lost: { node: string; message: string }[]; dropped: string[] }

const MAGIC = 0x32424b53;   // "SKB2"

/** What the skins are made from (the junctions, and what every arm tube was made from), as a fingerprint (scene/fingerprint.ts). Compare two with `samePrint`, never `===`. */
export function skinsDigest(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>): string {
  // (a fingerprint, scene/fingerprint.ts: the junctions as one group, then each tube as its own, its id and ring count exactly. What a tube was made FROM is walked (its courses' points, radii
  // and tapers); only a
  // tube with no recorded input gives its vertices. Numbers are summed, never rounded and hashed: rounding put Safari's last bits on the other side of a grid line, and every Mac and iPhone
  // meshed its skins live)
  const p = new Printer();
  // (the approved placement's skins are named as such: a file the 2D figure's anatomy baked under the same name (before the cut-over) never passes for them, whatever its numbers)
  p.text(ANATOMY_ID);
  p.walk(js);
  p.group();
  for (const id of [...tubes.keys()].sort()) {
    const t = tubes.get(id)!;
    p.text(id); p.exact(t.tubular);
    // (`hold`: how a pinned course spaces its rings, the same tube at rest)
    if (t.input !== undefined) p.walk(t.input, (k) => k === 'hold');
    else { const g = t.geometry.getAttribute('position'); for (let i = 0; i < g.count; i++) { p.number(g.getX(i)); p.number(g.getY(i)); p.number(g.getZ(i)); } }
    p.group();
  }
  return `${ANATOMY_ID}/${printString(p.finish())}`;
}

/** The skin mesh's blend numbers and directions whose low mantissa bits are written as zeros (25 Nov): the position is not here, so the seams still meet the tubes' own rings exactly. */
export const ROUNDED_KEYS: ReadonlySet<string> = new Set(['normal', 'cen', 'weight', 'weight2', 'restR']);
/**
 * Mantissa bits dropped from those: 8 of 23 leaves a relative step of 2^-15 (3e-5): a unit normal moves by 3e-5, a blend weight
 * and a radius by 3e-5 of themselves: far under what a pixel can show.
 */
export const ROUND_DROP = 8;
/** `a` with its `drop` lowest mantissa bits rounded to the nearest (ties up), as a new array; zeros, infinities and NaN stay as they are. */
export function roundMantissa(a: Float32Array, drop = ROUND_DROP): Float32Array {
  const out = new Float32Array(a.length), u = new Uint32Array(out.buffer), src = new Uint32Array(a.buffer, a.byteOffset, a.length), half = 1 << (drop - 1);
  for (let i = 0; i < u.length; i++) {
    const exp = (src[i]! >>> 23) & 255;
    u[i] = exp === 255 || exp === 0 ? src[i]! : (((src[i]! + half) >>> drop) << drop) >>> 0;
  }
  return out;
}

export function encodeSkins(b: BakedSkins, gz?: (b: Uint8Array) => number): Uint8Array {
  const w = new PackWriter(gz);
  const pack = (v: unknown): unknown => {
    if (v instanceof Float32Array || v instanceof Uint32Array || v instanceof Int32Array) return w.add(v);
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v)) {
        const x = (v as Record<string, unknown>)[k];
        out[k] = x instanceof Float32Array && ROUNDED_KEYS.has(k) ? w.add(roundMantissa(x)) : pack(x);
      }
      return out;
    }
    return v;
  };
  // (the mesh holds the plan's junction and cuts again: they are put back on unpacking, not written twice)
  const skins = b.skins.map((s) => ({ plan: pack(s.plan), axes: pack(s.axes), pace: s.pace, mesh: pack({ ...s.mesh, junction: undefined, cuts: undefined }),
    ...(s.plain === undefined ? {} : { plain: s.plain === null ? null : { axes: pack(s.plain.axes), pace: s.plain.pace, mesh: pack({ ...s.plain.mesh, junction: undefined, cuts: undefined }) } }),
    ...(s.parts === undefined ? {} : { parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, v === null ? null : { axes: pack(v.axes), pace: v.pace, mesh: pack({ ...v.mesh, junction: undefined, cuts: undefined }) }])) }) }));
  const head = new TextEncoder().encode(JSON.stringify({ digest: b.digest, lost: b.lost, dropped: b.dropped, skins }));
  const data = w.finish(), headPad = (4 - ((8 + head.length) % 4)) % 4, start = 8 + head.length + headPad;
  const out = new Uint8Array(start + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, head.length, true); out.set(head, 8); out.set(data, start);
  return out;
}

/** The skins in a baked file, or null when the file is not one. (Whether it is the file for THESE tubes is the caller's: `digest`.) */
export function decodeSkins(buf: ArrayBuffer): BakedSkins | null {
  if (buf.byteLength < 8) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) return null;
  const hl = dv.getUint32(4, true), headPad = (4 - ((8 + hl) % 4)) % 4, start = 8 + hl + headPad;
  let head: { digest: string; lost: BakedSkins['lost']; dropped: string[]; skins: { plan: unknown; axes: unknown; pace: number; mesh: unknown; plain?: { axes: unknown; pace: number; mesh: unknown } | null; parts?: Record<string, { axes: unknown; pace: number; mesh: unknown } | null> }[] };
  try { head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))); } catch { return null; }
  const unpack = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (isRef(o)) return unpackRef(buf, start, o);
      const out: Record<string, unknown> = {}; for (const k of Object.keys(o)) out[k] = unpack(o[k]); return out;
    }
    return v;
  };
  try {
    const skins = head.skins.map((s) => {
      const plan = unpack(s.plan) as SkinPlan, mesh = unpack(s.mesh) as SkinMesh;
      mesh.junction = plan.junction; mesh.cuts = plan.cuts;
      const out: BakedSkin = { plan, axes: unpack(s.axes) as ArmAxis[], mesh, pace: s.pace };
      if (s.plain === null) out.plain = null;
      else if (s.plain) {
        const pp = plainOf(plan), pm = unpack(s.plain.mesh) as SkinMesh;
        if (!pp) return null;
        pm.junction = pp.junction; pm.cuts = pp.cuts;
        out.plain = { axes: unpack(s.plain.axes) as ArmAxis[], mesh: pm, pace: s.plain.pace };
      }
      if (s.parts) {
        out.parts = {};
        const sets = new Map(partSpecs(plan).map((t) => [t.key, t]));
        for (const [k, v] of Object.entries(s.parts)) {
          if (v === null) { out.parts[k] = null; continue; }
          const spec = sets.get(k), pp = spec && partOf(plan, spec.there, spec.leave);
          if (!pp) return null;
          const pm = unpack(v.mesh) as SkinMesh;
          pm.junction = pp.junction; pm.cuts = pp.cuts;
          out.parts[k] = { axes: unpack(v.axes) as ArmAxis[], mesh: pm, pace: v.pace };
        }
      }
      return out;
    });
    if (skins.some((k) => !k)) return null;
    return { digest: head.digest, lost: head.lost, dropped: head.dropped, skins: skins as BakedSkin[] };
  } catch { return null; }
}

// ---- the page's side: fetched once, as early as the scene module loads, waited for by the boot -------------------------------------------------

/** Where the baked files are, next to the page (the same folder in a preview and on the live site): the Anatomy's skins and the Circuit's (circuit/skins.ts, made by the same script). */
export const BAKED_SKINS = 'anatomy/skins.bin';
export const BAKED_CIRCUIT_SKINS = 'anatomy/circuit-skins.bin';

let held: BakedSkins | null = null;
let heldCircuit: BakedSkins | null = null;
const browser = typeof window !== 'undefined' && typeof fetch !== 'undefined' && typeof DecompressionStream !== 'undefined';
/** The fetch is bounded by PROGRESS, not the clock (boot/fetch-bin.ts, F12): a file that keeps arriving is waited for however long it takes; one that stops for BIN_QUIET_MS is dropped, asked for once more, and after that the scene plans its
 *  skins live (slower, never blank) and says why in the console. The decode is CPU on the page, so it has no clock to be held to. */
async function fetchSkins(name: string): Promise<BakedSkins | null> {
  try {
    const env = (import.meta as { env?: { BASE_URL?: string } }).env;
    const buf = await fetchBin(`${env?.BASE_URL ?? '/'}${name}`, { gunzip: true, label: name });
    if (!buf) return null;
    return await spanAsync(`decode:${name}`, async () => decodeSkins(buf));
  } catch (e) { console.warn(`[boot] baked skins ${name} unavailable, planning live:`, e instanceof Error ? e.message : e); return null; }
}
async function load(): Promise<void> { held = await fetchSkins(BAKED_SKINS); }
const loading: Promise<void> | null = browser ? load() : null;

// The Circuit's file (583 kB on the wire, a gzip decode) is NOT on the boot path: the first picture is the Anatomy, and the boot waits only for its file (`bakedReady`). The scene asks for the
// Circuit's in the background slot after
// the lift, and sooner when the Circuit is opened (`requestCircuitSkins`); the Circuit's skins are built when it is in (scene.ts buildCircuitSkins). 22 Nov splash review, item 6.
let loadingCircuit: Promise<void> | null = null;
let circuitSettled = !browser;
/** Starts the Circuit's file (once) and resolves, never rejects, when it is in or known to be missing. Under node it is already read from disk. */
export function requestCircuitSkins(): Promise<void> {
  loadingCircuit ??= browser ? fetchSkins(BAKED_CIRCUIT_SKINS).then((b) => { heldCircuit = b; circuitSettled = true; }) : Promise.resolve();
  return loadingCircuit;
}
/** Whether the Circuit's file has still to come (false off the page, and once it has settled either way). */
export const bakedCircuitPending = (): boolean => !circuitSettled;

/** Under node (a test, a script) the baked files are read from disk, synchronously, when they are there: `new CelScene()` then lays the skins in (the digest still rejects a file for another figure, which plans live as before) instead of remeshing all of them, about 35 s a scene.
 * `PPS_NO_BAKED=1` skips it (the bake script itself, a test of the live path). `process.getBuiltinModule` keeps `node:fs` out of the page's bundle. */
function readDisk(name: string): BakedSkins | null {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown; env?: Record<string, string | undefined> } }).process;
    if (browser || !proc?.getBuiltinModule || proc.env?.PPS_NO_BAKED) return null;
    const fs = proc.getBuiltinModule('node:fs') as typeof import('node:fs'), zlib = proc.getBuiltinModule('node:zlib') as typeof import('node:zlib');
    const root = new URL('../../../../public/', import.meta.url);
    const b = zlib.gunzipSync(fs.readFileSync(new URL(name, root)));
    return decodeSkins(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  } catch { return null; }
}
if (!loading) { held = readDisk(BAKED_SKINS); heldCircuit = readDisk(BAKED_CIRCUIT_SKINS); }   // (under node both are on disk at once)

/** The skins baked for this build, once `bakedReady` has settled (null: none, or not the file for this figure: the set then plans live). */
export const bakedSkins = (): BakedSkins | null => held;
/** The Circuit's skins baked for this build (the same file's twin: null when none, or not for this figure). */
export const bakedCircuitSkins = (): BakedSkins | null => heldCircuit;
/** Whether the page is still fetching the baked file (always false off the page: a test, a script). */
export const bakedPending = (): boolean => loading !== null && !settled;
let settled = !loading;
/** Resolves, never rejects, when the file is in or known to be missing. The scene builds its skins after it, the boot waits for it. */
export const bakedReady: Promise<void> = (loading ?? Promise.resolve()).then(() => { settled = true; });
