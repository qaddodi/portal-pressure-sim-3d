// The caudate lobe and its short hepatic veins in the anatomy (2D: anatomy.js CAUDATE, drawn by stage.js `caud`; pin b3058ef3). The 2D plate shows them only on a slide about them: the lobe is a soft lighter dome of the liver's own tone
// between the hepatic vein confluence above, the portal bifurcation below and the IVC, and it grows about `anchor` as its veins take over the liver's outflow (Budd-Chiari). The 3D app drew neither (Mohammad, 21 Nov, slide 8 of Sites and
// causes: "No real caudate lobe or veins from it at all"; its callout pointed at empty liver). Here the lobe is the approved placement's egg on the liver's back (docs/approved/anatomy-placement.md, round 15), built once in the organs' frame (organs/meshes.ts),
// and the veins are a tributary group on the IVC (vessels/caudate-veins.ts). (2D's own outline, a pillow on the cava's plane, was the lobe until the cut-over, last at f17b151a.)
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { PLACED_CAUDATE } from '../anatomy/placement.generated.ts';

/** CAUDATE.grow: the lobe grows about its anchor by up to this share in x and y (2D plane). */
export const CAUDATE_GROW: readonly [number, number] = [0.12, 0.2];

/** The placed lobe (docs/approved/anatomy-placement.md, round 15): an upright soft egg on the liver's back about PLACED_CAUDATE.c with half-axes .ax, fuller toward its papillary end below, its IVC side drawn in.
 *  Its front: the egg's own front pole (z of c plus the z half-axis at its fullest there). */
const placedFrontZ = (): number => PLACED_CAUDATE.c[2] + PLACED_CAUDATE.ax[2] * eggFull(0);
/** The scene z of the dome's top (a mark or a step on the lobe sits here: figure-cards.ts Anchor `z`). */
export const CAUDATE_FRONT_Z = placedFrontZ();

function smooth(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
/** The egg's fullness at height y of the unit sphere (script2.js: 16% fuller toward the papillary process below). */
function eggFull(y: number): number { return 1 + 0.16 * smooth(0.2, -0.9, y); }
/** The egg's IVC side drawn in (script2.js: x < 0, the side the cava lies in the groove of). */
const eggGroove = (x: number): number => (x < 0 ? 1 - 0.18 * x * x : 1);
// (fine enough to stay off the cubic split, prepare.ts: split, the egg's pole-to-pole rings overshoot into small folds at its outline, false rim rings)
const EGG_N = 144, EGG_K = 28;
/** The placed lobe (the mock's egg, script2.js PLACED_CAUDATE) as a closed surface of two sheets that meet at its front-view outline, like every other organ, so the outline smoothing, the rim strip and the cel's ink
 *  see it as they see the others: the unit sphere taken from its front pole (+z) to its back pole in rings, each point moved as the mock moves its sphere's. */
export function caudateGeometry(): BufferGeometry {
  const { c, ax } = PLACED_CAUDATE, pos: number[] = [], idx: number[] = [];
  const v = (th: number, ph: number): number => {
    const x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th), full = eggFull(y), groove = eggGroove(x);
    pos.push(c[0] + x * ax[0] * full * groove, c[1] + y * ax[1], c[2] + z * ax[2] * full);
    return pos.length / 3 - 1;
  };
  const front = v(0, 0), back = v(Math.PI, 0), rings: number[][] = [];
  for (let k = 1; k < 2 * EGG_K; k++) { const th = (Math.PI * k) / (2 * EGG_K), r: number[] = []; for (let i = 0; i < EGG_N; i++) r.push(v(th, (2 * Math.PI * i) / EGG_N)); rings.push(r); }
  // (phi runs counter-clockwise seen from the front: a front triangle (pole, i, i+1) faces +z)
  for (let i = 0; i < EGG_N; i++) { const j = (i + 1) % EGG_N; idx.push(front, rings[0]![i]!, rings[0]![j]!); idx.push(back, rings[rings.length - 1]![j]!, rings[rings.length - 1]![i]!); }
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < EGG_N; i++) {
    const j = (i + 1) % EGG_N, a = rings[k]![i]!, b = rings[k]![j]!, cc = rings[k + 1]![i]!, d = rings[k + 1]![j]!;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(new Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** Where the lobe grows from, in the scene (CAUDATE.anchor). */
export const caudateAnchor3 = (): [number, number] => [PLACED_CAUDATE.c[0] - PLACED_CAUDATE.ax[0], PLACED_CAUDATE.c[1]];   // (placed: the egg's IVC side at its middle, the side it is seated on, as 2D's anchor is on the cava's wall)
/** The lobe's scale at growth `k` (0 normal to 1 fully grown): 2D's `scale(1 + grow * k)` about the anchor. */
export const caudateScale = (k: number): [number, number] => [1 + CAUDATE_GROW[0] * k, 1 + CAUDATE_GROW[1] * k];
