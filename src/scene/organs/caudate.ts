// The caudate lobe and its short hepatic veins in the anatomy (2D: anatomy.js CAUDATE, drawn by stage.js `caud`; pin b3058ef3). The 2D plate shows them only on a slide about them: the lobe is a soft lighter dome of the liver's own tone
// between the hepatic vein confluence above, the portal bifurcation below and the IVC, and it grows about `anchor` as its veins take over the liver's outflow (Budd-Chiari). The 3D app drew neither (Mohammad, 21 Nov, slide 8 of Sites and
// causes: "No real caudate lobe or veins from it at all"; its callout pointed at empty liver). Here the lobe is a pillow inflated from 2D's own outline, on the cava's plane (inside the liver like the vessels), built once, in the organs' frame (organs/meshes.ts), and the veins are a tributary
// group on the IVC (vessels/caudate-veins.ts).
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { x3, y3 } from '../frame2d.ts';
import { ORGAN_Z } from './z.ts';

/** anatomy.js CAUDATE.outline: the lobe at its normal size as one smooth closed curve (the convex hull of its two ellipses). */
export const CAUDATE_OUTLINE = 'M573.0 401.0 C571.7 395.7 573.1 389.5 573.2 383.7 C573.3 377.9 573.3 372.2 573.4 366.4 C573.5 360.6 573.4 354.9 573.6 349.1 C573.7 343.3 573.7 337.5 574.4 331.8 C575.0 326.1 575.6 320.1 577.4 314.8 C579.3 309.5 581.9 301.5 585.6 299.9 C589.4 298.2 596.3 301.5 599.9 304.9 C603.6 308.3 605.4 315.1 607.3 320.5 C609.2 325.9 610.4 331.6 611.5 337.3 C612.6 342.9 613.3 348.7 613.8 354.4 C614.3 360.2 614.5 365.9 614.4 371.7 C614.2 377.5 614.0 383.3 613.1 388.9 C612.2 394.6 611.6 400.9 609.1 405.7 C606.5 410.6 602.7 416.2 598.0 417.9 C593.3 419.5 585.1 418.3 581.0 415.4 C576.8 412.6 574.3 406.3 573.0 401.0 Z';
/** CAUDATE.anchor and CAUDATE.grow: the lobe grows about the anchor by up to this share in x and y (2D plane). */
export const CAUDATE_ANCHOR: readonly [number, number] = [612, 362];
export const CAUDATE_GROW: readonly [number, number] = [0.12, 0.2];
/** The IVC's left wall at the lobe (CAUDATE.wall, x of the 2D plane): where its short veins enter. */
export const CAUDATE_WALL = 613;
/** CAUDATE.veins: [course (a quadratic, flow order from the lobe's tissue to the IVC's wall), caliber at the IVC in 2D units]. The 3D veins are drawn wider than 2D's 3 units (a 3-unit tube is 1.5 px on a phone, under the outline's own width). */
export const CAUDATE_VEINS: readonly (readonly [string, number])[] = [['M588 334 Q 601 332 613 327', 3], ['M582 368 Q 598 365 613 359', 3.6], ['M590 398 Q 602 395 613 389', 2.8]];

/** The lobe's mid-plane in its own mesh: 0, so ORGAN_Z.caudate alone places it, on the cava's plane (the cava and the three short veins are the back tier, -0.02; the liver's front face is 0.29 there). It lies inside the liver like the vessels, and is drawn over the liver's face (layer.ts useOrganShader). */
export const LOBE_Z = 0;
/** How far its dome stands out of the liver's face (scene units: about 18 of the figure's units). */
export const LOBE_RISE = 0.06;
/** The scene z of the dome's top (a mark or a step on the lobe sits here: figure-cards.ts Anchor `z`). */
export const CAUDATE_FRONT_Z = ORGAN_Z.caudate + LOBE_Z + LOBE_RISE;

type P2 = [number, number];
/** The outline (M, C, Z path) flattened to a polyline, closed (the last point is not the first). */
export function flattenPath(d: string, perCurve = 12): P2[] {
  const t = d.match(/[MCZ]|-?\d+(?:\.\d+)?/g)!, out: P2[] = [];
  let i = 0, cur: P2 = [0, 0];
  while (i < t.length) {
    const c = t[i++]!;
    if (c === 'M') { cur = [+t[i++]!, +t[i++]!]; out.push(cur); } else if (c === 'C') {
      const p1: P2 = [+t[i++]!, +t[i++]!], p2: P2 = [+t[i++]!, +t[i++]!], p3: P2 = [+t[i++]!, +t[i++]!];
      for (let k = 1; k <= perCurve; k++) { const s = k / perCurve, u = 1 - s; out.push([u * u * u * cur[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s * s * s * p3[0], u * u * u * cur[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s * s * s * p3[1]]); }
      cur = p3;
    }
  }
  const a = out[0]!, b = out[out.length - 1]!;
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  return out;
}
const resample = (p: readonly P2[], n: number): P2[] => {
  const s = [0]; for (let i = 1; i <= p.length; i++) s.push(s[i - 1]! + Math.hypot(p[i % p.length]![0] - p[i - 1]![0], p[i % p.length]![1] - p[i - 1]![1]));
  const L = s[p.length]!, out: P2[] = []; let j = 1;
  for (let i = 0; i < n; i++) {
    const d = (L * i) / n; while (j < p.length && s[j]! < d) j++;
    const a = p[j - 1]!, b = p[j % p.length]!, u = (d - s[j - 1]!) / ((s[j]! - s[j - 1]!) || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
};

const N = 72, K = 8;
/** The lobe as a closed pillow in the organs' frame (X=(x-700)/300, Y=-(y-556)/300): 2D's outline from the front, a dome in front of the liver's face and its mirror behind, the rim between them one ring (so the outline smoothing and the cel's ink see a closed surface like every other organ). */
export function caudateGeometry(): BufferGeometry {
  const ring = resample(flattenPath(CAUDATE_OUTLINE), N);
  let cx = 0, cy = 0; for (const [x, y] of ring) { cx += x; cy += y; } cx /= N; cy /= N;
  const pos: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, z: number): number => { pos.push(x3(x), y3(y), z); return pos.length / 3 - 1; };
  // ring k (1..K) at share t = sin(pi/2 k/K) of the way out (denser toward the rim, where the dome turns), height a quarter-ellipse of it
  const level = (k: number): { t: number; h: number } => { const t = Math.sin((Math.PI / 2) * (k / K)); return { t, h: Math.sqrt(Math.max(0, 1 - t * t)) }; };
  const top: number[][] = [], bot: number[][] = [];
  const topC = v(cx, cy, LOBE_Z + LOBE_RISE), botC = v(cx, cy, LOBE_Z - LOBE_RISE);
  for (let k = 1; k <= K; k++) {
    const { t, h } = level(k), a: number[] = [], b: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = cx + (ring[i]![0] - cx) * t, y = cy + (ring[i]![1] - cy) * t;
      const ia = v(x, y, LOBE_Z + LOBE_RISE * h);
      a.push(ia); b.push(k === K ? ia : v(x, y, LOBE_Z - LOBE_RISE * h));
    }
    top.push(a); bot.push(b);
  }
  // winding so the front faces +z: the ring runs the way the outline does (y down in 2D, up in the scene: a flip of its sign)
  let area = 0; for (let i = 0; i < N; i++) { const p = ring[i]!, q = ring[(i + 1) % N]!; area += p[0] * q[1] - q[0] * p[1]; }
  const up = area < 0;
  const tri = (a: number, b: number, c: number, front: boolean): void => { if (front === up) idx.push(a, b, c); else idx.push(a, c, b); };
  const skin = (rings: number[][], centre: number, front: boolean): void => {
    for (let i = 0; i < N; i++) tri(centre, rings[0]![i]!, rings[0]![(i + 1) % N]!, front);
    for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < N; i++) {
      const a = rings[k]![i]!, b = rings[k]![(i + 1) % N]!, c = rings[k + 1]![i]!, d = rings[k + 1]![(i + 1) % N]!;
      tri(a, c, b, front); tri(b, c, d, front);
    }
  };
  skin(top, topC, true); skin(bot, botC, false);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(new Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** Where the lobe grows from, in the scene (CAUDATE.anchor). */
export const caudateAnchor3 = (): [number, number] => [x3(CAUDATE_ANCHOR[0]), y3(CAUDATE_ANCHOR[1])];
/** The lobe's scale at growth `k` (0 normal to 1 fully grown): 2D's `scale(1 + grow * k)` about the anchor. */
export const caudateScale = (k: number): [number, number] => [1 + CAUDATE_GROW[0] * k, 1 + CAUDATE_GROW[1] * k];
