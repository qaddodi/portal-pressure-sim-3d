// Simple organs inflated from the 2D app's organ outlines (art/organs-simple/build.py). Shared frame:
// X=(x-700)/300, Y=-(y-556)/300, organs straddle z=0, every front face at z <= 0.26. The esophagus is part of 'stomach' (2D SEAM_D).
// The vertex data is a static asset (public/anatomy/organs.bin, int16 positions at 1/q, uint16 indices), fetched once at boot so it
// stays out of the entry chunk. ORGAN_MESHES[id]() is synchronous and works once `organsReady` has resolved.
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import manifest from './organs-manifest.json' with { type: 'json' };

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

const env = (import.meta as { env?: { BASE_URL?: string } }).env;
if (inBrowser) {
  fetch(`${env?.BASE_URL ?? '/'}anatomy/organs.bin`)
    .then((r) => { if (!r.ok) throw new Error(`organs.bin ${r.status}`); return r.arrayBuffer(); })
    .then(setOrganData, (e) => console.error(e));
}

const make = (id: string) => (): BufferGeometry => {
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
