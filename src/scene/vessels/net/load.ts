// The network meshes of ?geom=net, from the files the build bakes (`node scripts/bake-skins.mjs --net`: public/anatomy/net-<n>.bin, gzip, one per connected network of the skeleton, the whole bake about a minute). NOTHING here runs without the flag: the scene
// imports this file lazily (scene.ts mountNet) and only for ?geom=net, so the default page fetches none of it and the load path pays nothing. A file carries the digest of the skeleton it was baked from (baked.ts skeletonDigest); a page whose skeleton
// differs (the course data changed since the bake) rejects it by name and keeps the old tubes: the page never meshes a network itself (47 to 74 s of CPU).
import { clock } from '../../../clock/frame.ts';
import { skeleton } from './skeleton.ts';
import { networksOf } from './networks.ts';
import { decodeNet, skeletonDigest } from './baked.ts';
import type { NodeReport } from './mesh.ts';
import type { NetMesh, Skeleton } from './types.ts';

/** One network as baked: its edges (indices into the skeleton), its mesh and the junction reports its region rows are built from. */
export interface NetMeshData { edges: number[]; mesh: NetMesh; nodes: Partial<NodeReport>[] }
export interface NetData { skel: Skeleton; digest: string; nets: NetMeshData[] }

export const netFile = (n: number): string => `anatomy/net-${n}.bin`;

/** Builds the page's data from the decoded files (`files[n]` is network n's raw, un-gzipped bytes, or null when it did not load). Null when any file is missing or was baked from another skeleton; `why` says which. */
export function netDataFrom(files: readonly (ArrayBuffer | null)[], skel: Skeleton = skeleton()): { data: NetData | null; why: string } {
  const digest = skeletonDigest(skel), groups = networksOf(skel), nets: NetMeshData[] = [];
  for (let n = 0; n < groups.length; n++) {
    const b = files[n];
    if (!b) return { data: null, why: `${netFile(n)} did not load` };
    const d = decodeNet(b);
    if (!d) return { data: null, why: `${netFile(n)} is not a network mesh file of this version` };
    if (d.digest !== digest) return { data: null, why: `${netFile(n)} was baked from another skeleton (${d.digest}, this page's is ${digest}): run \`node scripts/bake-skins.mjs --net\`` };
    nets.push({ edges: groups[n]!, mesh: d.mesh, nodes: d.nodes });
  }
  return { data: { skel, digest, nets }, why: '' };
}

const FETCH_MS = 20000;
/** The page's side: fetches and decodes every file in parallel (gzip through the browser's own stream), bounded; null (with the reason on the console) when any is missing, old or for another skeleton. */
export async function loadNetResult(base: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'): Promise<{ data: NetData | null; why: string }> {
  const skel = skeleton(), count = networksOf(skel).length;
  const lost: string[] = [];   // (why a file did not come: the badge and the console say it)
  const one = async (n: number): Promise<ArrayBuffer | null> => {
    try {
      const ctl = new AbortController(), timer = clock.afterReal(() => ctl.abort(), FETCH_MS);
      const url = `${base}${netFile(n)}`, r = await fetch(url, { signal: ctl.signal });
      clock.cancel(timer);
      if (!r.ok || !r.body) { lost.push(`${netFile(n)}: HTTP ${r.status} (${url})`); return null; }
      return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } catch (e) { lost.push(`${netFile(n)}: ${e instanceof Error ? e.message : String(e)}`); return null; }
  };
  const files = await Promise.all(Array.from({ length: count }, (_, n) => one(n)));
  const r0 = netDataFrom(files, skel), data = r0.data, why = lost.length ? lost[0]! + (lost.length > 1 ? ` (+${lost.length - 1} more)` : '') : r0.why;
  if (!data) console.warn(`[?geom=net] the network meshes are not in: ${why}; the old tubes stay`);
  return { data, why };
}
/** `loadNetResult` without the reason. */
export async function loadNet(base?: string): Promise<NetData | null> { return (await loadNetResult(base)).data; }

/** Under node (a test, a script): the baked files read from disk, or null when they are not there (`npm run bake` is the bake; a test that needs them skips). `process.getBuiltinModule` keeps node:fs out of the page's bundle. */
export function loadNetFromDisk(): NetData | null {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    if (!proc?.getBuiltinModule) return null;
    const fs = proc.getBuiltinModule('node:fs') as typeof import('node:fs'), zlib = proc.getBuiltinModule('node:zlib') as typeof import('node:zlib');
    const skel = skeleton(), root = new URL('../../../../public/', import.meta.url), files: (ArrayBuffer | null)[] = [];
    for (let n = 0; n < networksOf(skel).length; n++) {
      try { const b = zlib.gunzipSync(fs.readFileSync(new URL(netFile(n), root))); files.push(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); } catch { files.push(null); }
    }
    return netDataFrom(files, skel).data;
  } catch { return null; }
}
