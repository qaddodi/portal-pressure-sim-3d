// The organs' meshes with the approved placement switched on (anatomy/source.ts PLACED; docs/approved/anatomy-placement.md): heart, atrium, kidney, liver, spleen and stomach are the organs file's own outlines refined at the
// rim and re-inflated round where the mock put them (inflate.ts: its own code, held to art/anatomy-placement/organsA.json), each at its own depth already (so organs/z.ts moves none of them again); the oesophagus stays part of
// the stomach's mesh. The 2D gut pillows (duodenum, bowel, colon) are not drawn: those ids are the gut tubes (gut-tubes.ts). What the shader needs on top (the rim, the normals, the depth term, the outline's steps) is made by
// prepare.ts as for every organ; this file only adds the stomach's cut where the duodenum's funnel takes over. Pure arithmetic.
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';
import { PLACED_GUT } from '../anatomy/placement.generated.ts';
import { inflateOrgan, refineRimRounds } from './inflate.ts';
import { INFLATED_IDS, PLACED_A } from './placed-map.ts';
import { PYL_CUT, gutTubes } from './gut-tubes.ts';

/** The oesophagus's narrow tube in the organs file (scene units): above OESO_Y, left of OESO_X (the cardia below it is broad and needs nothing). */
const OESO_Y = 0.98, OESO_X = 0.335;
/** Above this y the oesophagus has faded to nothing (2D esoFadeG: gone 40 units above the figure's top, organ-art.ts esoAttributes): its triangles are never seen and are not kept. */
const OESO_GONE = 2.03;
/** The gut's ids: the tubes in placed mode (the duodenum's funnel, the small bowel, the colon). */
export const TUBE_IDS: ReadonlySet<string> = new Set(['duodenum', 'bowel', 'colon']);

const cache = new Map<string, { pos: Float32Array; idx: Uint32Array; normals: Float32Array }>();

/** The placed mesh of organ `id`, made from its raw mesh in the organs file (`raw`), or null for an id the placement leaves as it is. Each call hands out a fresh geometry (the inflation itself is done once an organ). */
export function placedMesh(id: string, raw: () => BufferGeometry): BufferGeometry | null {
  if (TUBE_IDS.has(id)) return gutTubes()[id as 'duodenum' | 'bowel' | 'colon'];
  if (!INFLATED_IDS.includes(id)) return null;
  let c = cache.get(id);
  if (!c) {
    const g = raw(), f0 = refineRimRounds(g.getAttribute('position').array, g.index!.array, 2);   // (the mock's mesh: organsA.json's vertices are these, in this order)
    // the oesophagus's tube is a strip two or three vertices across in the organs file: re-inflated round, its normal turned 55 degrees from one vertex to the next across it (a facet down the tube). The edges ACROSS it (never
    // along: it is dense along its length already) are split twice more before the inflation, which lays every new vertex on the same smooth surface (the thickness kept from the mock's own vertices), so the tube is round
    const across = (ax: number, ay: number, bx: number, by: number): boolean => Math.min(ay, by) > OESO_Y && Math.max(ay, by) < OESO_GONE && Math.max(ax, bx) < OESO_X && Math.abs(bx - ax) > 0.6 * Math.abs(by - ay);
    const f = id === 'stomach' ? refineRimRounds(f0.pos, f0.idx, 2, across) : f0;
    const inf = inflateOrgan(f.pos, f.idx, PLACED_A[id]!, undefined, f0.pos.length / 3);
    c = id === 'stomach' ? withoutTip(inf.pos, f.idx, inf.normals) : { pos: inf.pos, idx: f.idx, normals: inf.normals };
    cache.set(id, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(c.pos.slice(), 3));
  g.setAttribute('normal', new Float32BufferAttribute(c.normals.slice(), 3));   // (the surface's own normals, from its height function, not the triangles': prepare.ts recomputes them after its rim work)
  g.setIndex(c.pos.length / 3 > 65535 ? new Uint32BufferAttribute(c.idx.slice(), 1) : new Uint16BufferAttribute(Uint16Array.from(c.idx), 1));
  return g;
}

/** The stomach without what is never drawn: the oesophagus past its fade (OESO_GONE), and the antrum's tip inside the duodenum's funnel: a triangle wholly past the cut (by more than the cut's soft edge) is never drawn, so it is not kept; one that crosses the cut stays, and the shader's
 *  discard makes the clean edge (stomachCut). */
function withoutTip(pos: Float32Array, idx: Uint32Array, nrm: Float32Array): { pos: Float32Array; idx: Uint32Array; normals: Float32Array } {
  const gone = PYL_CUT - 0.03, top = OESO_GONE, keep: number[] = [], drawn = (v: number) => pos[v * 3]! > gone && pos[v * 3 + 1]! < top;
  for (let t = 0; t < idx.length; t += 3) if (drawn(idx[t]!) || drawn(idx[t + 1]!) || drawn(idx[t + 2]!)) keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  const map = new Int32Array(pos.length / 3).fill(-1), P: number[] = [], N: number[] = [];
  const I = keep.map((v) => { if (map[v]! < 0) { map[v] = P.length / 3; P.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!); N.push(nrm[v * 3]!, nrm[v * 3 + 1]!, nrm[v * 3 + 2]!); } return map[v]!; });
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), normals: Float32Array.from(N) };
}

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The stomach's cut where the duodenum's funnel takes over (the mock's PYL_CUT, script2.js), as the per-vertex `cutA` the organ shader and its outline discard below one half: a clean edge inside the funnel, never a
 *  half-faded strip beside it. And by the cut the antrum's shade normal turns round the funnel's own axis (round 13: its light and shade meet the funnel's with no step). `shadeN` is changed in place. */
export function stomachCut(g: BufferGeometry, shadeN: Float32Array): void {
  const P = g.getAttribute('position').array, n = P.length / 3, cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = smooth(PYL_CUT - 0.015, PYL_CUT + 0.015, P[i * 3]!);
  g.setAttribute('cutA', new Float32BufferAttribute(cut, 1));
  const [, cy0, cz] = PLACED_GUT.upper[0]!;
  const AX: [number, number][] = [[PYL_CUT, cy0!], [0.3, 0.128], [0.35, 0.16], [0.4, 0.21]];   // (the antrum's centre line in the front view, as the mock has it)
  const cyAt = (x: number): number => { for (let k = 1; k < AX.length; k++) if (x <= AX[k]![0]) { const [x0, y0] = AX[k - 1]!, [x1, y1] = AX[k]!; return y0 + ((y1 - y0) * (Math.max(x, x0) - x0)) / (x1 - x0); } return AX[AX.length - 1]![1]; };
  for (let i = 0; i < n; i++) {
    const x = P[i * 3]!, w = 1 - smooth(PYL_CUT + 0.04, PYL_CUT + 0.19, x);
    if (w <= 0 || P[i * 3 + 1]! > 0.6) continue;
    let ry = P[i * 3 + 1]! - cyAt(x), rz = P[i * 3 + 2]! - cz!; const l = Math.hypot(ry, rz) || 1; ry /= l; rz /= l;
    const nx = shadeN[i * 3]! * (1 - w), ny = shadeN[i * 3 + 1]! * (1 - w) + ry * w, nz = shadeN[i * 3 + 2]! * (1 - w) + rz * w, m = Math.hypot(nx, ny, nz) || 1;
    shadeN[i * 3] = nx / m; shadeN[i * 3 + 1] = ny / m; shadeN[i * 3 + 2] = nz / m;
  }
}
