// How the map's own tubes (circuit/tubes.ts: the liver's branches, the caudate lane, the custom shunts) meet the vessel they leave or reach: sunk and flared as 2D draws every end, never a
// fillet and never a pipe pushed against a vein (2D fork-joins.js sideEndScale / flareScale, stage-tubes.js SINK / FLARED; the body's own table is vessels/shunt-ends.ts). The end narrows to the
// host's caliber (at least SHUNT_END_MIN of its own), its round end SINKS inside the host's wall (a sink is narrowed, not reduced further) and its heel FLARES toward the wall. A radius profile on the
// tube's own rings, so the rings stay in order along the course: nothing can fold, there is no skin to morph, and the flow marks, colour, fade and draw-on are the tube's own.
// Pure and cheap: a few numbers per ring, made once when the tube is (a custom shunt at the moment it is routed), nothing per frame.
import type { BufferGeometry } from 'three';
import { Float32BufferAttribute, Vector3, type CatmullRomCurve3 } from 'three';
import { flareScale, sideEndScale } from '../vessels/fork-joins.copied.js';
import { SHUNT_END_MIN, type ShuntEnd } from '../vessels/shunt-ends.ts';

/** The share of the course each end's narrowing eases over (the 2D tubes' own 30 %). */
export const END_SPAN = 0.3;
const smooth = (u: number): number => u * u * (3 - 2 * u);

/** An end sewn onto a host of radius `hostR` (scene units, on the map) the way the body sews every generated end (shunt-ends.ts `sewnEndAt`): narrowed to the host's width, closing to 0.35 of it inside the wall (so no round cap shows past it: a sphere there was the bulge), flared at the heel but never wider than the host. */
export const sunkEnd = (hostR: number): ShuntEnd => ({ hostR, inside: true, sink: false, flare: true, capped: true });
/** A start that carries on from the end of another tube of the map (a sinusoid branch from the tip of a portal venule): sunk in it without narrowing or flare, so the two run on at one width with no waist. */
export const runOnEnd = (hostR: number): ShuntEnd => ({ hostR, inside: true, sink: true, flare: false });

/** The share of the tube's own radius at distance `d` (scene units) from an end: the host's caliber (stage-tubes.js tubeHostW: at most 1, at least SHUNT_END_MIN of its own) eased in over END_SPAN of the course, then the 2D sink and flare. */
export function endShareAt(e: ShuntEnd | null, own: number, d: number, len: number): number {
  if (!e || !(own > 0) || !(len > 0)) return 1;
  const t = Math.min(1, Math.max(SHUNT_END_MIN, e.hostR / own)), u = d / len;
  const narrow = u < END_SPAN ? t + (1 - t) * smooth(Math.max(0, u) / END_SPAN) : 1;
  const base = narrow * (e.inside && !e.sink ? (sideEndScale(d, e.hostR) as number) : 1), fl = e.flare ? (flareScale(d, e.hostR) as number) : 1;
  // a generated end's flare never takes the tube wider than its host (vessels/tubes.ts: the heel was a bulge): the narrowing stays, the flare is cut at the host's radius
  return e.capped && fl > 1 ? Math.min(base * fl, Math.max(base, e.hostR / own)) : base * fl;
}

/** The share at ring `u` (0 to 1 along a course of `len` scene units) of a tube with these two ends. Where the two narrowings overlap (a short tube) the narrower holds, as the body's tubes do (tubes.ts factorSpan). */
export function ringShare(ends: readonly [ShuntEnd | null, ShuntEnd | null], own: number, len: number, u: number): number {
  const a = endShareAt(ends[0], own, u * len, len), b = endShareAt(ends[1], own, (1 - u) * len, len);
  return a < 1 && b < 1 ? Math.min(a, b) : a * b;
}

/**
 * Lays the profile on a tube built by anatomy/vessels.ts buildTube (the tube's rings, then its two caps): every ring is scaled about its centre by its share, each cap about its end by the share there, and the
 * tube gets `rk` and `rkc` (the radius share the shader reads, on the body and on the map) to match, so the Circuit's offsets (geometry.ts) are read against the radius the ring was made at.
 * `len` is the course the profile is laid along (scene units: the map's, which is the one the host's radius is in).
 */
export function applyEnds(g: BufferGeometry, curve: CatmullRomCurve3, tubular: number, radial: number, ends: readonly [ShuntEnd | null, ShuntEnd | null], own: number, len: number): void {
  const pos = g.getAttribute('position'), n = pos.count, W = radial + 1, rings = (tubular + 1) * W, rk = new Float32Array(n).fill(1);
  const P = new Vector3();
  const scale = (v: number, s: number): void => { pos.setXYZ(v, P.x + (pos.getX(v) - P.x) * s, P.y + (pos.getY(v) - P.y) * s, P.z + (pos.getZ(v) - P.z) * s); };
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular, s = ringShare(ends, own, len, u);
    curve.getPointAt(u, P);
    for (let j = 0; j < W; j++) { scale(i * W + j, s); rk[i * W + j] = s; }
  }
  const capCount = (n - rings) / 2;
  for (let cap = 0; cap < 2; cap++) {
    const s = ringShare(ends, own, len, cap);
    curve.getPointAt(cap, P);
    for (let k = 0; k < capCount; k++) { scale(rings + cap * capCount + k, s); rk[rings + cap * capCount + k] = s; }
  }
  pos.needsUpdate = true;
  g.setAttribute('rk', new Float32BufferAttribute(rk, 1));
  g.setAttribute('rkc', new Float32BufferAttribute(rk.slice(), 1));
}
