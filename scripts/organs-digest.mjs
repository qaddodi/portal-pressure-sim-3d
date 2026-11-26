// What the baked organs (src/scene/organs/baked.ts) were made from, as one short string: the organs file and the source of every module the bake runs (prepare.ts, the organ table, the caudate egg, the codec
// and all they import). The bake writes it into the file, the build hands the same string to the page (VITE_ORGANS_DIGEST), and the page lays the file in only when the two are equal; a changed input is a
// different digest, so a stale file can never be used.
// The inputs are WALKED (scripts/bake-sig.mjs graph), never listed by hand: a hand list named a file the organs do not read (anatomy/source.ts, the camera's fit), so an edit to the fit changed the
// digest while the bake's own signature (the walked graph) said "unchanged" and skipped; every page from then on threw the baked organs away and made them live (2 s of CPU a start, and organs.bin
// downloaded beside the baked file). One walk for both means the two can never disagree (tests/organs-digest.test.ts).
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { graph } from './bake-sig.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
/** The modules the bake runs (scripts/bake-organs.mjs imports exactly these): their graphs are the code inputs. */
export const ORGAN_ENTRIES = ['src/scene/organs/meshes.ts', 'src/scene/organs/caudate.ts', 'src/scene/organs/prepare.ts', 'src/scene/organs/baked.ts'];
/** The data the bake reads that no import names. */
export const ORGAN_DATA = ['public/anatomy/organs.bin'];
/** Every input, relative to the repository, sorted: the data and the walked graph of the entries. */
export function organInputs() {
  const files = new Set(ORGAN_DATA);
  for (const e of ORGAN_ENTRIES) for (const f of graph(at(e))) files.add(f.slice(root.length));
  return [...files].sort();
}
/** The digest of the organs: `p` (the approved placement's) and a hash over the inputs. */
export function organsDigest() {
  let h = 0x811c9dc5, n = 0;
  for (const f of organInputs()) {
    const b = readFileSync(at(f));
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
    n += b.length;
  }
  return `p${(h >>> 0).toString(16)}-${n}`;
}
/** The baked file the page will fetch. */
export const BAKED_ORGANS_FILE = at('public/anatomy/organs-baked.bin');
/** Whether the baked file on disk carries this build's digest: the page's own question (src/scene/organs/meshes.ts), asked by the bake before it skips and by the build before it tells the page the digest. */
export async function bakedOrgansCurrent(digest = organsDigest()) {
  if (!existsSync(BAKED_ORGANS_FILE)) return false;
  const { decodeOrgans } = await import('../src/scene/organs/baked.ts');
  const b = gunzipSync(readFileSync(BAKED_ORGANS_FILE));
  return decodeOrgans(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))?.digest === digest;
}
