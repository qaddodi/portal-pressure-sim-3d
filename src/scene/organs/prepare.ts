// What the organs are made into before the first picture, as one pure function of the organs file: the rim smoothed and refined, each organ at its own depth, the duodenum's tail fade, the baked depth term, the outline's smoothed
// normals and the outline's steps from the rim. It is about 2 s of CPU on a laptop and the same on every start, so scripts/bake-organs.mjs runs it at BUILD time and ships the result (organs/baked.ts); the page runs it
// only when that file is missing or not for this build. One function, so the live path and the bake can never differ.
import { BufferAttribute, Float32BufferAttribute, type BufferGeometry } from 'three';
import { ORGAN_STYLE } from './layer.ts';
import { refineRim, ringDistance, smoothSilhouette, tailFade } from './contour.ts';
import { bakeOrganDepth } from './organ-depth.ts';
import { smoothRestNormals } from './normal-smooth.ts';
import { ORGAN_Z } from './z.ts';

/** Passes of smoothing of the normals the outline is pushed along (the hull's edge, a sawtooth otherwise). */
export const SHADE_PASSES = 6;

/** The organs of `meshes` that have a style, finished: position, index, normal, `esoA` (the duodenum), `depthAo`, `shadeN`, `ringD` and `hullN`. Order is the table's. */
export function prepareOrgans(meshes: Record<string, () => BufferGeometry>): [string, BufferGeometry][] {
  // every organ's geometry first: the baked depth term (organ-depth.ts) needs them all together (where one organ meets another)
  const made: [string, BufferGeometry][] = [];
  for (const [id, make] of Object.entries(meshes)) if (ORGAN_STYLE[id]) { const g = make(); smoothSilhouette(g); refineRim(g); g.translate(0, 0, ORGAN_Z[id] ?? 0); made.push([id, g]); }   // (the rim's saw-tooth is smoothed out first: contour.ts; each organ at its own depth: z.ts, x and y untouched by it)
  // the duodenum's free end fades out (it joins nothing there): its tail alpha, which organ-art patches into its fill and outline
  const duo = made.find(([id]) => id === 'duodenum'), stom = made.find(([id]) => id === 'stomach');
  if (duo && stom) duo[1].setAttribute('esoA', new Float32BufferAttribute(tailFade(duo[1], stom[1]), 1));
  const baked = bakeOrganDepth(Object.fromEntries(made.map(([id, g]) => {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return [id, { pos: g.getAttribute('position').array, normal: g.getAttribute('normal').array, index: g.index ? g.index.array : [] }];
  })));
  for (const [id, g] of made) {
    g.setAttribute('depthAo', new BufferAttribute(baked[id]!, 1, true));
    // the outline is pushed out along the mesh's SMOOTHED normal: the mesh's own normals jag along a coarse rim, and the hull's edge with them (a sawtooth halo)
    g.setAttribute('shadeN', new Float32BufferAttribute(smoothRestNormals(g.getAttribute('position').array, g.getAttribute('normal').array, g.index ? g.index.array : [], SHADE_PASSES), 3));
    g.setAttribute('ringD', new Float32BufferAttribute(ringDistance(g), 1));
    g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(g.getAttribute('position').array, g.getAttribute('normal').array, g.index ? g.index.array : []), 3));
  }
  return made;
}
