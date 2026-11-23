// A vein divided at surgery (2D stage-geo.js divideLen, suture-marks.js stumpCentre / clearArc): the Warren shunt divides the splenic vein, a portocaval shunt the portal trunk at the confluence.
// The vein's first stretch is not drawn, so the shunt and the tied-off stump stand apart with a clear gap, the stump ending round and narrowing a little at its tie. The stretch opens and
// closes with the shunt's drawing on and off (nothing pops); a side-to-side portocaval shunt keeps the trunk whole. Pure: lengths in the 2D figure's units.
import { EDGE_PATH_2D } from './paths.copied.ts';
import { NETWORK_BY_ID } from './network.ts';
import { firstPiece } from '../procedures/copied/part-names.js';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { PINCH_K, PINCH_W } from './glsl-shared.ts';

/** The portal trunk's first stretch, at the confluence (the trunk is cut where the coronary vein joins it). */
export const PV_START: string = firstPiece('PV_TRUNK') as string;
/** [shunt, the vein it divides] (2D LIGATED). */
export const DIVIDED: readonly (readonly [string, string])[] = [['S_DSR', 'SV_MID'], ['S_PC', PV_START]];
/** The tie's pinch (suture-marks.js PINCH_K, PINCH_W) and where the tie sits on a stump cut `cut` long on a vein `len` long (stumpCentre). */
export { PINCH_K, PINCH_W };
export const stumpCentre = (cut: number, len: number): number => Math.min(cut + 5, len * 0.6) + 4;
const WALL = 1;   // (2D's wallPx: the outline's width on each side of a vessel)

type Pt = readonly [number, number];
const distToLine = (cur: readonly Pt[], x: number, y: number): number => {
  let m = Infinity;
  for (let i = 1; i < cur.length; i++) {
    const [ax, ay] = cur[i - 1]!, [bx, by] = cur[i]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return m;
};
/** How far along `vcur` the vein still lies within `need` of the shunt's course (suture-marks.js clearArc): the stretch the cut must clear. */
export function clearArc(vcur: readonly Pt[], scur: readonly Pt[], need: number): number {
  let s = 0, last = 0;
  for (let i = 0; i < vcur.length; i++) {
    if (i) s += Math.hypot(vcur[i]![0] - vcur[i - 1]![0], vcur[i]![1] - vcur[i - 1]![1]);
    if (distToLine(scur, vcur[i]![0], vcur[i]![1]) < need) last = s;
  }
  return last;
}
const lengthOf = (c: readonly Pt[]): number => { let s = 0; for (let i = 1; i < c.length; i++) s += Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1]); return s; };

export interface Divide { /** the divided stretch, 2D units, whole */ cut: number; /** the tie's place from the vein's start */ tie: number }
const memo = new Map<string, Divide | null>();
/** The cut a vein takes when its shunt is wholly drawn: as long as the vein is wide (2.2 widths and the outline), and at least the stretch where it still lies against the shunt (2D: but never over 4.8 widths or 0.45 of the vein). */
export function divideOf(shunt: string, vein: string): Divide | null {
  const key = `${shunt}/${vein}`;
  if (memo.has(key)) return memo.get(key)!;
  const v = NETWORK_BY_ID.get(vein), x = NETWORK_BY_ID.get(shunt), a = EDGE_PATH_2D[vein] as readonly Pt[] | undefined, b = EDGE_PATH_2D[shunt] as readonly Pt[] | undefined;
  let out: Divide | null = null;
  if (v && x && a && b) {
    const vw = 2 * v.radius * UNITS_PER_SCENE, xw = 2 * x.radius * UNITS_PER_SCENE, len = lengthOf(a);
    const need = (vw + xw) / 2 + 2 * WALL + 0.35 * vw;
    const clear = Math.min(clearArc(a, b, need), vw * 4.8, len * 0.45);
    const cut = Math.max(vw * 2.2 + 2 * WALL, clear);
    // the tie sits on the stump's straight wall, never on its round end (the end is a quarter circle over one radius from the cut, and the pinch is PINCH_W wide each side of the tie: the portal trunk's 0.6-of-its-length clamp put the tie 6.7 units past a 7.8 cap, so the pale
    // turns of the tie crossed the cap, 23 Nov): at least the cap, and the pinch's two widths, past the cut, and still inside the vein
    out = { cut, tie: Math.min(len - vw / 2, Math.max(stumpCentre(cut, len), cut + vw / 2 + 2 * PINCH_W)) };
  }
  memo.set(key, out);
  return out;
}
/** A divided vein is built with rings this many times closer than the usual (shape.ts tubularOf): its round end is the quarter circle over one radius, and it takes its shape from the rings that lie in it, so it needs a dozen of them. The rings stay on the vein's own
 *  path: laying the stretch's rings over the cap along each ring's tangent put them off it on the portal trunk's bend, and the end came out a skewed spike. */
export const DIVIDED_RING_K = 12;
/** What the shader gets for one divided vein: the cut and the tie in units, the pinch share; `amount` is the shunt's drawing (0..1), `keepWhole` a side-to-side portocaval shunt. */
export function stumpOf(shunt: string, vein: string, amount: number, keepWhole: boolean): [number, number, number] {
  const d = divideOf(shunt, vein);
  if (!d || keepWhole || !(amount > 0.001)) return [0, 0, 0];
  const k = amount * amount * (3 - 2 * amount);   // (the 2D easeInOut)
  return [k * d.cut, d.tie, k];
}
