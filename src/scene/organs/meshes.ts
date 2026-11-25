// Simple organs inflated from the 2D app's organ outlines (art/organs-simple/build.py). Shared frame:
// X=(x-700)/300, Y=-(y-556)/300, organs straddle z=0, every front face at z <= 0.26. The esophagus is part of 'stomach' (2D SEAM_D).
// The vertex data is a static asset (public/anatomy/organs.bin, int16 positions at 1/q, uint16 indices), fetched once at boot so it
// stays out of the entry chunk. ORGAN_MESHES[id]() is synchronous and works once `organsReady` has resolved.
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import manifest from './organs-manifest.json' with { type: 'json' };
import { decodeOrgans, type BakedOrgans } from './baked.ts';
import { spanAsync } from '../../boot/spans.ts';
import { placedMesh } from './placed.ts';

type Entry = [posByte: number, verts: number, idxByte: number, indices: number];
const M = manifest as unknown as { q: number; organs: Record<string, Entry> };
export const ORGAN_IDS = Object.keys(M.organs);

let buf: ArrayBuffer | null = null;
let loaded: () => void = () => {};
const inBrowser = typeof fetch === 'function' && typeof window !== 'undefined';
/** Resolves once the organ file is in; the scene adds the organs then. Outside a browser it waits for setOrganData. */
export const organsReady: Promise<void> = new Promise((res) => { loaded = res; });
/** Takes the organ file's bytes (the browser fetch below; tests read it from disk). */
export function setOrganData(b: ArrayBuffer): void { buf = b; loaded(); }

const env = (import.meta as { env?: { BASE_URL?: string; VITE_ORGANS_DIGEST?: string } }).env;
const base = env?.BASE_URL ?? '/';

// The organs finished at build time (organs/baked.ts, scripts/bake-organs.mjs): with that file in, the page does none of prepare.ts's work (about 2 s of CPU a start) and never fetches organs.bin (the raw stomach the
// scope fits to is in the file). A page whose build made no such file, a browser with no gunzip, a digest that is not this build's, or a file that does not decode: organs.bin as before, and the organs are made live.
let baked: BakedOrgans | null = null;
/** The finished organs, once the baked file is in (null: none; the layer makes them from the organs file). */
export const bakedOrgans = (): BakedOrgans | null => baked;
/** Takes the baked organs (the browser fetch below; a test hands it a decoded file). */
export function setBakedOrgans(b: BakedOrgans): void { baked = b; loaded(); }

async function fetchBaked(want: string): Promise<BakedOrgans | null> {
  try {
    const r = await spanAsync('fetch:organs-baked', () => fetch(`${base}anatomy/organs-baked.bin`));
    if (!r.ok || !r.body) return null;
    const body = r.body;
    const out = await spanAsync('decode:organs-baked', () => new Response(body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(decodeOrgans));
    if (out && out.digest !== want) { console.warn('[boot] baked organs are for another build, making them live'); return null; }
    return out;
  } catch (e) { console.warn('[boot] baked organs unavailable, making them live:', e instanceof Error ? e.message : e); return null; }
}
const liveFile = (): void => {
  fetch(`${base}anatomy/organs.bin`)
    .then((r) => { if (!r.ok) throw new Error(`organs.bin ${r.status}`); return r.arrayBuffer(); })
    .then(setOrganData, (e) => console.error(e));
};
if (inBrowser) {
  const want = env?.VITE_ORGANS_DIGEST;
  (want && typeof DecompressionStream !== 'undefined' ? fetchBaked(want) : Promise.resolve(null)).then((b) => { if (b) setBakedOrgans(b); else liveFile(); });
}

const make = (id: string) => (): BufferGeometry => {
  if (!buf) { const r = baked?.raw[id]; if (r) return r(); throw new Error('organs: data not loaded (await organsReady)'); }
  // (the approved placement: the organ moved and re-inflated, or the gut tube, made from the file's outline: placed.ts. The baked file's raw organs are already these)
  return placedMesh(id, fileMesh(id)) ?? fileMesh(id)();
};
const fileMesh = (id: string) => (): BufferGeometry => {
  if (!buf) throw new Error('organs: data not loaded (await organsReady)');
  const [pb, nv, ib, ni] = M.organs[id];
  const q = new Int16Array(buf, pb, nv * 3), pos = new Float32Array(nv * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i] / M.q;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(new Uint16BufferAttribute(new Uint16Array(buf, ib, ni), 1));
  g.computeVertexNormals();
  return g;
};
export const ORGAN_MESHES: Record<string, () => BufferGeometry> = Object.fromEntries(ORGAN_IDS.map((id) => [id, make(id)]));
