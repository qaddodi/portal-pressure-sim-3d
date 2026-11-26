// The stent as paths on the cylinder (pure: no scene, no GPU). Everything it places comes from the 2D app's own rules: the open cells of the bare stretch (rings of five crowns, every other one turned half a
// crown so the crowns touch), the rounded rings nested along the graft, the gold band where the graft starts and the gold tab near the far end (stent-mesh.js stentLookD, copied: its constants and spacing are
// read from the same numbers, in the mocks' unit u, a twelfth of the lumen's half width), and the lumen's narrowing from the engine's `profileAt` (the waist always mid, the end stenosis short, steps of
// 0.5 cm and 0.5 mm). The 2D picture is a flat cut view; here the stent is the real tube (the graft almost clear, the wires opaque), so the lumen's colour shows from every side.
import { Vector3 } from 'three';
import { type Ring, makeRings } from '../tube-rings.ts';
import { profileAt } from '../../../engine/hales/portal/stent-geom.js';
import { bareOf } from '../../procedures/copied/stent-mesh.js';

/** What the stent is: where it runs, how wide it is, and the shape the engine gave it. */
export interface StentSpec {
  /** the centreline at arc length a from the stent's portal end (0 to `A`), scene units */
  at(a: number, out: Vector3): Vector3;
  tan(a: number, out: Vector3): Vector3;
  /** the stent's length, scene units */
  A: number;
  /** the lumen's radius when the stent is open, scene units */
  R: number;
  /** the stent's length in cm (the shunt's 8), for the bare stretch (2 cm of it) */
  lenCm: number;
  /** the geometry (len cm, waist cm, trans cm, red share) and the end stenosis (share, site as a fraction), as the engine reads them */
  geom: { len: number; waist: number; trans: number; red: number };
  s: number;
  site: number;
  /** the vessel's radius along the stent (at arc a) as a share of its middle radius: a stent never lies wider than the lumen it is in (fit.ts); 1 where the vessel is whole */
  fit?(a: number): number;
  /** a covered stent (the TIPS and DIPS: Viatorr) has a bare stretch at its portal end; false is open cells end to end */
  covered: boolean;
}

export interface StentPaths {
  /** the lumen's radius share along the stent (profileAt), sampled at `profile.length` even stations */
  profile: Float32Array;
  /** the graft: one tube, from the band to the clean far end */
  graft: Ring[];
  /** every wire (a closed zig-zag round the tube, five crowns) as its own list of stations */
  wires: Ring[][];
  /** the gold band round the tube where the graft starts, and the gold tab (a short bar along the near side) */
  band: Ring[];
  tab: Ring[];
  /** where the graft starts and ends, scene units from the portal end; `u` is the mocks' unit */
  bareEnd: number; graftEnd: number; u: number;
  /** the wire's radius, scene units */
  wireR: number;
}

/** The most a wire is drawn thick (scene units): the 2D stent's struts are hairlines (1 to 1.4 px, stage-transitions.js), so the 3D ones stay fine however far the figure is zoomed; a device's own one-pixel grow keeps them seen. */
export const WIRE_MAX_R = 0.0006;
/** Steps round a wire's ring; the near (front) half is the first RING_STEPS + 1 stations, the far half the rest. */
export const RING_STEPS = 40;
const PROFILE_N = 96;
const Z = new Vector3(0, 0, 1), X = new Vector3(1, 0, 0);

/** The lumen's radius share at fraction u along the stent. */
export function lumenShare(spec: Pick<StentSpec, 'geom' | 's' | 'site'>, u: number): number {
  return profileAt(spec.geom, spec.s, spec.site, u) as number;
}

/** A frame round the tube at arc length a: the two unit directions across it, the first sideways in the figure's plane, the second toward the viewer (or away: the sign is the tube's). */
export function frameAt(spec: StentSpec, a: number, n1 = new Vector3(), n2 = new Vector3(), t = new Vector3()): { n1: Vector3; n2: Vector3; t: Vector3 } {
  spec.tan(a, t); t.normalize();
  n1.crossVectors(t, Z); if (n1.lengthSq() < 1e-6) n1.crossVectors(t, X);
  n1.normalize(); n2.crossVectors(t, n1).normalize();
  // the second direction always points toward the viewer, so the tab and the bright side face the front
  if (n2.z < 0) { n2.negate(); n1.negate(); }
  return { n1, n2, t };
}

const tmpC = new Vector3(), tmpN1 = new Vector3(), tmpN2 = new Vector3(), tmpT = new Vector3();

export function buildStent(spec: StentSpec): StentPaths {
  const { A, R } = spec;
  const u = R / 12;   // the mocks' unit: a twelfth of the lumen's half width
  const share = (a: number): number => lumenShare(spec, Math.min(1, Math.max(0, a / A)));
  // (the stent lies INSIDE its vessel: at 0.9 of the lumen there, less the thickest thing drawn on it (the gold band), so no wire or edge reaches the wall at any tilt, bend or end)
  const wr = Math.min(Math.max(0.0012, 0.05 * R), WIRE_MAX_R);
  const radius = (a: number): number => { const lumen = R * share(a) * (spec.fit ? Math.max(0.2, spec.fit(a)) : 1); return Math.max(0.2 * lumen, 0.9 * lumen - 2.4 * wr); };
  const profile = new Float32Array(PROFILE_N);
  for (let i = 0; i < PROFILE_N; i++) profile[i] = share((i / (PROFILE_N - 1)) * A);

  const bare = spec.covered ? bareOf(A, spec.lenCm) : A;
  const covered = spec.covered && bare > 0.5 * u && bare < A - 4 * u;
  const SB = covered ? bare : A;
  const BOW = 1.5 * u;

  const station = (a: number, rad: number, th: number): Ring => {
    const { n1, n2, t } = frameAt(spec, a, tmpN1, tmpN2, tmpT);
    const c = spec.at(a, tmpC);
    const ring: Ring = { c: new Vector3(), t: t.clone(), r: 0, u: Math.min(1, Math.max(0, a / A)) };
    // a point on the cylinder: the ring record carries the centre, so the wire's own tube runs along the path of points; r is the wire's (set by the caller)
    ring.c.copy(c).addScaledVector(n1, Math.cos(th) * rad).addScaledVector(n2, Math.sin(th) * rad);
    return ring;
  };
  /** one closed zig-zag ring round the tube: centre s, crown height Ah, Nc crowns, phase ph; a crown reaches Ah along the stent either way. */
  const zig = (s: number, Ah: number, Nc: number, ph: number): Ring[] => {
    const out: Ring[] = [];
    for (let i = 0; i <= RING_STEPS * 2; i++) {
      const th = (i / (RING_STEPS * 2)) * Math.PI * 2;
      const a = Math.min(A, Math.max(0, s + Ah * Math.cos(Nc * th + ph)));
      out.push(station(a, radius(a), th));
    }
    return out;
  };
  const wires: Ring[][] = [];
  // the bare stretch: rings of 5 crowns, every other one turned half a crown, filling the stretch exactly so the last ring's crowns reach the band
  const t0 = 1.2 * u, bEnd = covered ? SB : A - 1.2 * u, Nb = Math.max(1, Math.round((bEnd - t0) / (17 * u))), Pb = (bEnd - t0) / Nb, Ab = Pb / 2;
  for (let i = 0; i < Nb; i++) wires.push(zig(t0 + Ab + i * Pb, Ab, 5, i & 1 ? Math.PI : 0));
  let graftEnd = SB, tabAt = -1;
  if (covered) {
    const Pc = 11 * u, Ac = 0.42 * Pc, s0c = SB + Ac + 2.5 * u, Kc = Math.max(0, Math.floor((A - 1.2 * u - Ac - s0c) / Pc)), sLast = s0c + Kc * Pc;
    for (let i = 0; i <= Kc; i++) wires.push(zig(s0c + i * Pc, Ac, 5, 0));
    graftEnd = Math.min(A, sLast + Ac + 1.0 * u);
    tabAt = sLast - Pc * 0.55;
  }
  // the graft: a smooth tube from the band to its clean end (the 2D draws it nearly clear on the shaded side; here the whole tube is almost clear)
  const graft: Ring[] = [];
  if (covered) {
    const n = Math.max(8, Math.round((graftEnd - SB) / (3 * u)));
    for (let i = 0; i <= n; i++) { const a = SB + BOW + ((graftEnd - SB - BOW) * i) / n, rr = radius(a); graft.push({ c: spec.at(a, new Vector3()), t: spec.tan(a, new Vector3()).normalize(), r: rr, u: Math.min(1, Math.max(0, a / A)) }); }
  }
  // the gold band: a ring round the tube at the start of the graft, bowed toward the far end at its sides
  const band: Ring[] = [];
  if (covered) for (let i = 0; i <= RING_STEPS; i++) { const th = (i / RING_STEPS) * Math.PI * 2, a = Math.min(A, SB + BOW * (1 - Math.abs(Math.cos(th)))); band.push(station(a, radius(a), th)); }
  // the gold tab: a short bar along the near side, 6.8u long
  const tab: Ring[] = [];
  if (covered && tabAt + 3.4 * u <= A) {
    const th = Math.PI / 2 - Math.asin(0.32);
    for (let k = 0; k <= 6; k++) { const a = tabAt - 3.4 * u + (6.8 * u * k) / 6; tab.push(station(a, radius(a) * 1.0, th)); }
  }
  return { profile, graft, wires, band, tab, bareEnd: covered ? SB : A, graftEnd, u, wireR: Math.max(0.0012, 0.05 * R) };
}
