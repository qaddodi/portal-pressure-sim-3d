// What the baked organs (src/scene/organs/baked.ts) were made from, as one short string: the organs file, its manifest and the source of every module prepare.ts runs through. The bake writes it into the file, the build
// hands the same string to the page (VITE_ORGANS_DIGEST), and the page lays the file in only when the two are equal; a changed input is a different digest, so a stale file can never be used.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
/** The inputs: the data and the code that turns it into the finished organs (prepare.ts and what it calls, the 2D frame and the caudate's outline). */
export const ORGAN_INPUTS = [
  'public/anatomy/organs.bin', 'src/scene/organs/organs-manifest.json',
  'src/scene/organs/prepare.ts', 'src/scene/organs/layer.ts', 'src/scene/organs/contour.ts', 'src/scene/organs/organ-depth.ts', 'src/scene/organs/normal-smooth.ts', 'src/scene/organs/z.ts', 'src/scene/organs/caudate.ts', 'src/scene/frame2d.ts', 'src/scene/organs/baked.ts',
];
export function organsDigest() {
  let h = 0x811c9dc5, n = 0;
  for (const f of ORGAN_INPUTS) {
    const b = readFileSync(at(f));
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
    n += b.length;
  }
  return `${(h >>> 0).toString(16)}-${n}`;
}
