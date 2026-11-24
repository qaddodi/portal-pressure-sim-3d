// What the organs are made into before the first picture, as one pure function of the organs file: the rim smoothed and refined, each organ at its own depth, the duodenum's tail fade, the baked depth term, the outline's smoothed
// normals and the outline's steps from the rim. It is about 2 s of CPU on a laptop and the same on every start, so scripts/bake-organs.mjs runs it at BUILD time and ships the result (organs/baked.ts); the page runs it
// only when that file is missing or not for this build. One function, so the live path and the bake can never differ.
import { BufferAttribute, Float32BufferAttribute, type BufferGeometry } from 'three';
import { ORGAN_STYLE } from './layer.ts';
import { refineRim, ringDistance, rimDistance, smoothSilhouette, tailFade } from './contour.ts';
import { COARSE_VERTS, subdivideOrgan } from './subdivide.ts';
import { bakeOrganDepth, meanEdge, smooth } from './organ-depth.ts';
import { RIM_ZONE, fitRimProfile, rimOffsetByte, rimProfileAt } from './rim-profile.ts';
import { smoothRestNormals } from './normal-smooth.ts';
import { ORGAN_Z } from './z.ts';
import { PLACED } from '../anatomy/source.ts';
import { TUBE_IDS, stomachCut } from './placed.ts';

/** Passes of smoothing of the normals the outline is pushed along (the hull's edge, a sawtooth otherwise). */
export const SHADE_PASSES = 6;

/** The organs of `meshes` that have a style, finished: position, index, normal, `esoA` (the duodenum), `depthAo`, `shadeN`, `ringD` and `hullN`. Order is the table's. */
export function prepareOrgans(meshes: Record<string, () => BufferGeometry>): [string, BufferGeometry][] {
  // every organ's geometry first: the baked depth term (organ-depth.ts) needs them all together (where one organ meets another)
  const made: [string, BufferGeometry][] = [];
  for (const [id, make] of Object.entries(meshes)) if (ORGAN_STYLE[id]) {
    const g = make();
    if (PLACED && TUBE_IDS.has(id)) { g.userData.tube = true; made.push([id, g]); continue; }   // (a gut tube is round by construction, at its own depth, with its own round normals: gut-tubes.ts. Its rim is not an outline's and is left as it is)
    smoothSilhouette(g); if (g.getAttribute('position').count >= COARSE_VERTS || !subdivideOrgan(g)) refineRim(g); g.translate(0, 0, ORGAN_Z[id] ?? 0); made.push([id, g]);
  }   // (the rim's saw-tooth is smoothed out first: contour.ts; a small organ then gets a round of butterfly subdivision, which also refines its rim (subdivide.ts), a big one only its rim; each organ at its own depth: z.ts, x and y untouched by it)
  // the duodenum's free end fades out (it joins nothing there): its tail alpha, which organ-art patches into its fill and outline
  const duo = made.find(([id]) => id === 'duodenum'), stom = made.find(([id]) => id === 'stomach');
  if (duo && stom && !PLACED) duo[1].setAttribute('esoA', new Float32BufferAttribute(tailFade(duo[1], stom[1]), 1));   // (placed: the duodenum runs on into the bowel's tube and fades nowhere; only the rectum's end fades, gut-tubes.ts)
  const baked = bakeOrganDepth(Object.fromEntries(made.map(([id, g]) => {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return [id, { pos: g.getAttribute('position').array, normal: g.getAttribute('normal').array, index: g.index ? g.index.array : [] }];
  })));
  for (const [id, g] of made) {
    g.setAttribute('depthAo', new BufferAttribute(baked[id]!, 1, true));
    // the outline is pushed out along the mesh's SMOOTHED normal: the mesh's own normals jag along a coarse rim, and the hull's edge with them (a sawtooth halo)
    const shadeN = smoothRestNormals(g.getAttribute('position').array, g.getAttribute('normal').array, g.index ? g.index.array : [], SHADE_PASSES);
    if (PLACED && id === 'stomach') stomachCut(g, shadeN);   // (the stomach's cut where the duodenum's funnel takes over, and the antrum's shade turned round the funnel's axis there: placed.ts)
    g.setAttribute('shadeN', new Float32BufferAttribute(shadeN, 3));
    g.setAttribute('ringD', new Float32BufferAttribute(ringDistance(g), 1));
    g.setAttribute('hullN', new Float32BufferAttribute(smoothRestNormals(g.getAttribute('position').array, g.getAttribute('normal').array, g.index ? g.index.array : []), 3));
    rimStrip(g);
  }
  return made;
}

/** Where in a triangle the profile is sampled (barycentric): the middle and three points toward the corners. */
const SAMPLES: readonly (readonly [number, number, number])[] = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];

/** The shade's rim strip (rim-profile.ts): `rimD` (each vertex's distance to the silhouette, over RIM_ZONE, one byte) and `rimC` (its region's offset from the organ's profile, one byte, 0.5 none), as the attributes the organ shader reads, and the
 *  organ's profile itself in `userData.rimProfile`. Both are whole bytes' worth of value so the baked file holds them exactly. The profile and the offsets are measured the way the shader sees the mesh: at points INSIDE the front
 *  triangles of the strip (the smoothed normal interpolated, the distance interpolated), not at the vertices, so the look it gives is the look the interpolated normal gave on average, without the triangles' saw-teeth. */
function rimStrip(g: BufferGeometry): void {
  const pos = g.getAttribute('position'), n = pos.count, idx = g.index ? g.index.array : [], d = rimDistance(g, RIM_ZONE), sn = g.getAttribute('shadeN').array, zone = RIM_ZONE - 1e-6;
  const sd: number[] = [], sz: number[] = [], sv: number[] = [];   // the samples: interpolated distance, interpolated normal's z, and the triangle's corners
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
    if (Math.min(d[a]!, d[b]!, d[c]!) >= zone) continue;
    if ((pos.getX(b) - pos.getX(a)) * (pos.getY(c) - pos.getY(a)) - (pos.getX(c) - pos.getX(a)) * (pos.getY(b) - pos.getY(a)) <= 0) continue;   // (the back faces are never drawn)
    for (const [wa, wb, wc] of SAMPLES) {
      const x = wa * sn[3 * a]! + wb * sn[3 * b]! + wc * sn[3 * c]!, y = wa * sn[3 * a + 1]! + wb * sn[3 * b + 1]! + wc * sn[3 * c + 1]!, z = wa * sn[3 * a + 2]! + wb * sn[3 * b + 2]! + wc * sn[3 * c + 2]!;
      sd.push(wa * d[a]! + wb * d[b]! + wc * d[c]!); sz.push(z / (Math.hypot(x, y, z) || 1)); sv.push(a, b, c);
    }
  }
  const prof = fitRimProfile(sd, sz), e = new Float32Array(n), mask = new Float32Array(n);
  for (let k = 0; k < sd.length; k++) {
    if (sd[k]! >= zone) continue;
    const r = sz[k]! - rimProfileAt(prof, sd[k]! / RIM_ZONE), [wa, wb, wc] = SAMPLES[k % SAMPLES.length]!;
    for (const [v, w] of [[sv[3 * k]!, wa], [sv[3 * k + 1]!, wb], [sv[3 * k + 2]!, wc]] as const) { e[v] += r * w; mask[v] += w; }
  }
  // the regional offset: a masked low-pass over the surface (the same radius on any mesh: a pass moves a value one edge)
  const h = meanEdge({ pos: pos.array, normal: g.getAttribute('normal').array, index: idx }), passes = Math.min(40, Math.max(4, Math.round((0.04 / h) ** 2)));
  const num = smooth(e, idx, passes), den = smooth(mask, idx, passes);
  const rd = new Float32Array(n), rc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rd[i] = Math.round(255 * Math.min(1, d[i]! / RIM_ZONE)) / 255;
    rc[i] = rimOffsetByte(den[i]! > 0.02 ? num[i]! / den[i]! : 0) / 255;
  }
  g.setAttribute('rimD', new Float32BufferAttribute(rd, 1));
  g.setAttribute('rimC', new Float32BufferAttribute(rc, 1));
  g.userData.rimProfile = prof;
}
