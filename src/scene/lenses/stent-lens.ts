// A stent's colour ALONG its length, under every lens whose colour varies along it (Mohammad, 26 Nov: "the velocity lens inside the TIPS is not showing
// similar to the graph, it has a speeding section in the middle"). A vessel's lens colour is its two ends' (and a third and two thirds along), which is right
// for a vein but not for a stent: its lumen narrows at the waist and its pressure dips and recovers there. So the stent carries a PROFILE: its colour at
// PROFILE_N evenly spaced places, read from the very numbers the IR card's graph and strip draw (charts/stent/model.ts: the lumen's profile, the open
// velocity, the trace of pressure), through the one function below. The card's strip calls it too (ui/tests/ir/tips-figure.ts), so the 3D stent and the
// card cannot disagree, for any waist, stenosis or taper.
//   velocity                      the scanner's peak velocity against the stent's own range, along the lumen
//   pressure, heat, delta, since  the pressure along the stent (the trace's), through the same ramps as a vein (model.ts pressureLensColour)
// Every other lens keeps one colour for the whole vessel on purpose: the flow, the direction, the system and the blood's origin and oxygen do not change along a stent, and the drop is its total.
import { profileAt } from '../../engine/hales/portal/stent-geom.js';
import { stentOpen } from '../../engine/hales/portal/stent-ease.js';
import { TRACE_N } from '../../engine/hales/portal/stent-trace.js';
import { localVelocity, openVelocity, stentNormal, stentState, TR, traceFor, traceIn, velPos, type StentId, type StentState, type Trace } from '../../ui/charts/stent/model.ts';
import type { LookId } from '../palette.ts';
import {
  type FrameLike, type LensContext, type LensData, type LensId, type PressureFamily,
  LENS_EDGE_COUNT, PRESSURE_FAMILY, PROFILE_N, PROFILE_ROW0, edgeIndex, edgeNodes, pressureLensColour, samplerFor,
} from './model.ts';
import type { Rgb } from './oklab.ts';

/** The lenses a stent's colour runs along it under. */
export const STENT_PROFILE_LENSES: ReadonlySet<string> = new Set<string>(['velocity', ...PRESSURE_FAMILY]);

/** A trace sample (the trace runs from 3 cm of vein before the stent to 3 cm after it) at fraction u along the stent, mixed between its two nearest samples. */
export function traceAt(a: ArrayLike<number>, u: number, len: number): number {
  const f = Math.min(TRACE_N, Math.max(0, (TRACE_N * (u * len + TR.veinCm)) / (len + 2 * TR.veinCm))), i = Math.min(TRACE_N - 1, Math.floor(f));
  return a[i]! + (a[i + 1]! - a[i]!) * (f - i);
}
/** The pressure (mmHg, absolute) at fraction u along the stent: the IVC's plus the trace's. */
export const stentPressureAt = (st: StentState, trace: Trace, u: number): number => st.ivc + traceAt(trace.P, u, st.sh.len);
/** The scanner's peak velocity (cm/s) at fraction u along the stent: the open stent's over the share of the lumen's diameter squared. */
export const stentVelocityAt = (st: StentState, u: number): number => localVelocity(openVelocity(st.flow, st.d, st.id), profileAt(st.sh, st.s, st.site, u));

/** The colour of stent `st` at fraction u along it under `lens` (sRGB 0..1), or null where the lens colours the stent as one (and where there is no stent).
 *  `refs` are the pressures the Change and Congestion lenses count from at the stent's two ends, mixed along it. */
export function stentColourAt(lens: LensId, look: LookId, st: StentState, trace: Trace, u: number, refs: readonly [number, number] | null = null, out: Rgb = [0, 0, 0]): Rgb | null {
  if (!st.have) return null;
  if (lens === 'velocity') return samplerFor(look, 'velocity').at(velPos(stentVelocityAt(st, u), stentNormal(st.id, st.d)), out);
  if (!PRESSURE_FAMILY.has(lens)) return null;
  return pressureLensColour(lens as PressureFamily, look, stentPressureAt(st, trace, u), refs ? refs[0] + (refs[1] - refs[0]) * u : null, out);
}

/** Writes each placed stent's profile into the lens data `out` just computed for `lens` (model.ts computeLens): PROFILE_N rows after the chevron ink's,
 *  the first row's alpha 1 to say the vessel carries one. The profile's two end rows take the colours the vessel's ends already have (the junction's, so a
 *  stent runs into its veins with no step: Mohammad, 20 Nov), the rows between are the stent's own. Returns the ids written. */
export function writeStentProfiles(out: LensData, lens: LensId, f: FrameLike, look: LookId, ctx: LensContext, params: unknown): StentId[] {
  const done: StentId[] = [];
  if (out.mode !== 1 || !STENT_PROFILE_LENSES.has(lens)) return done;
  const N = LENS_EDGE_COUNT, G = out.grad;
  for (const id of ['TIPS', 'DIPS'] as StentId[]) {
    const k = edgeIndex.get(id);
    if (k == null || G[k * 4 + 3]! <= 0 || !stentOpen(f, k)) continue;
    const st = stentState(f, id, params);
    if (!st.have) continue;
    const trace = traceFor(traceIn(st)), [a, b] = edgeNodes(k), ref = ctx.ref;
    const refs: [number, number] | null = ref && a >= 0 && b >= 0 ? [ref[a]!, ref[b]!] : null, c: Rgb = [0, 0, 0];
    for (let i = 0; i < PROFILE_N; i++) {
      const at = (PROFILE_ROW0 + i) * N * 4 + k * 4;
      if (i === 0 || i === PROFILE_N - 1) { const e = (i === 0 ? 0 : N) * 4 + k * 4; G[at] = G[e]!; G[at + 1] = G[e + 1]!; G[at + 2] = G[e + 2]!; }
      else { stentColourAt(lens, look, st, trace, i / (PROFILE_N - 1), refs, c); G[at] = c[0]; G[at + 1] = c[1]; G[at + 2] = c[2]; }
      G[at + 3] = 1;
    }
    // (the third and two thirds along, for a reader without profile rows: the vessel's own colours there)
    for (const [row, i] of [[2, (PROFILE_N - 1) / 3], [3, (2 * (PROFILE_N - 1)) / 3]] as const) {
      const at = (PROFILE_ROW0 + Math.round(i)) * N * 4 + k * 4, e = row * N * 4 + k * 4;
      G[e] = G[at]!; G[e + 1] = G[at + 1]!; G[e + 2] = G[at + 2]!;
    }
    done.push(id);
  }
  return done;
}
