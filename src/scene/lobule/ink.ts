// What colour a lobule vessel wears under the colour lens: a port of the 2D lobule's `inkOf`/`tubeRGB` (lobule-zoom-field.js), on the scene's own lens ramps
// (lenses/model.ts, the 2D app's colormap copied per look). A vessel has a colour at each end and the GPU blends along it; here every vertex of a tube carries
// its own, which is the same straight line in colour between the two ends (the sinusoid's value runs from the central vein's to the inlet's by `sinW`).
//   seg: 'pv' the portal venule (end-on), 'in' the inlet venule (w along it 0 at the tract .. 1 at the sinusoids), 'sin' a sinusoid or anastomosis (w = sinW(rho), 1 at
//   the lobule's edge, 0 at the central vein), 'cv' the central vein, 'art' the arteriole's twig (one tone, the lens does not colour it: a junction skin that joins a twig to its sinusoid
//   blends from it).
import { DELTA_RANGE, DROP_MAX, HEAT_MAX, MPS_TO_LPM, type LensId, firstPassColours, flowPos, originColours, oxygenPos, samplerFor } from '../lenses/model.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import { delta3, fromOklab, hexToRgb01, toOklab, type Rgb } from '../lenses/oklab.ts';
import { velPos } from '../lenses/vel-normal.copied.js';
import { NODES } from '../../engine/hales/portal/topology.js';
import type { LookId } from '../palette.ts';
import type { Lane, LaneSet, LobuleModel } from './model.ts';
import { LOBULE_PALETTES } from './tones.ts';

export type Seg = 'pv' | 'in' | 'sin' | 'cv' | 'art';
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The lobule's own pressure steps are shown to the half mmHg, as the 2D painter does (qP). */
const qP = (v: number) => Math.round(v * 2) / 2;

/** How far out along the sinusoids a point is, weighted as the 2D painter does: 0 at the central vein, 1 at the lobule's edge (sinW). */
export const sinW = (rho: number): number => clamp((rho - 0.075) / (0.92 - 0.075), 0, 1) ** 0.8;

const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
/** The lobule's three node pressures against a reference (the healthy patient's, a pinned moment's, a slide's): the Change, Congestion and `since` lenses. Null: no change. */
export function lobuleDelta(m: Pick<LobuleModel, 'P1' | 'P2' | 'P3'>, ref: ArrayLike<number> | null): [number, number, number] {
  if (!ref) return [0, 0, 0];
  return [m.P1 - ref[NI.RPV!]!, m.P2 - ref[NI.SIN_R!]!, m.P3 - ref[NI.CV_R!]!];
}

export interface InkContext {
  lens: LensId;
  look: LookId;
  model: LobuleModel;
  /** node pressures the Change lenses count from (null: none) */
  ref: ArrayLike<number> | null;
  /** how drained the sinusoids are toward the tissue's shade, 0..1 (capillarization, the eased fibSin) */
  fibSin: number;
}

const VEL_RANGE: [number, number] = [1 / 1.5, 1.5];
const SHADE: Rgb = hexToRgb01('#603A5C');   // (the 2D --lz-shade)
const NEUTRAL_GREY: Rgb = hexToRgb01(LENS_SHARED.neutral);
const tmp: Rgb = [0, 0, 0];

/** The colour (sRGB 0..1, written into `out`) a lobule vessel wears at `w` along it, under the lens. */
export function inkAt(c: InkContext, seg: Seg, w: number, out: Rgb): Rgb {
  // (an arteriole keeps the artery's own tone under every lens, as the vessels' arteries do; under the stream lenses it is a source, the hepatic artery's blood, in its key colour)
  if (seg === 'art') {
    const a = c.lens === 'origin' || c.lens === 'firstpass' ? ORIGIN_COLS[HA_SLOT]! : hexToRgb01((LOBULE_PALETTES[c.look].tones as Record<string, string>).artery!);
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out;
  }
  const m = c.model, lens = c.lens, tok = LENS_TOKENS[c.look];
  let v: Rgb;
  if (lens === 'pressure' || lens === 'delta' || lens === 'since' || lens === 'heat') {
    const d = lens === 'pressure' ? null : lobuleDelta(m, c.ref);
    const v0 = d ? d[0] : qP(m.P1), v1 = d ? d[1] : qP(m.P2), v2 = d ? d[2] : qP(m.P3);
    const x = seg === 'pv' ? v0 : seg === 'in' ? lerp(v0, v1, 0.6 * w) : seg === 'cv' ? v2 : v2 + (v1 - v2) * w;
    if (lens === 'pressure') v = samplerFor(c.look, 'pressure').at(qP(x), tmp);
    else if (lens === 'heat') v = samplerFor(c.look, 'heat').at(Math.max(0, qP(x)) / HEAT_MAX, tmp);
    else v = delta3(hexToRgb01(LENS_SHARED.deltaLow), hexToRgb01(LENS_SHARED.deltaMid), hexToRgb01(LENS_SHARED.deltaHigh), qP(x), DELTA_RANGE, tmp);
  } else if (lens === 'oxygen') {
    const [a, b, cc] = m.oxy;
    const sat = seg === 'pv' ? a : seg === 'in' ? lerp(a, b, w) : seg === 'cv' ? cc : cc + (b - cc) * w;
    v = samplerFor(c.look, 'oxygen').at(oxygenPos(sat), tmp);
  } else if (lens === 'origin' || lens === 'firstpass') {
    v = NEUTRAL_GREY;   // (the 2D app greys the lumen and draws the origin lanes over it)
  } else if (lens === 'neutral') {
    const P = LOBULE_PALETTES[c.look].tones, a = hexToRgb01(P.portal), b = hexToRgb01(P.sys), k = seg === 'cv' ? 1 : seg === 'sin' ? 1 - w : 0;
    v = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  } else if (lens === 'drop' || lens === 'flow' || lens === 'velocity' || lens === 'direction') {
    const e = seg === 'sin' ? 'sin' : seg === 'cv' ? 'post' : 'pre';
    if (lens === 'drop') v = samplerFor(c.look, 'drop').at(Math.abs(e === 'pre' ? m.P1 - m.P2 : e === 'sin' ? m.P2 - m.P3 : m.P3 - m.P4) / DROP_MAX, tmp);
    else if (lens === 'direction') v = hexToRgb01(m.rev[e] ? tok.flowReversed : tok.flowNormal);
    else if (lens === 'flow') v = samplerFor(c.look, 'flow').at(flowPos(Math.abs(m.Qs[e]) * MPS_TO_LPM), tmp);
    else v = samplerFor(c.look, 'velocity').at(velPos(Math.abs(m.Qs[e]) / Math.max(1e-6, Math.abs(m.Q0[e] ?? m.Qs[e])), VEL_RANGE), tmp);
  } else {   // 'system' and anything else: the pressure's own colours, not rounded (the 2D default)
    const x = seg === 'pv' || seg === 'in' ? m.P1 : seg === 'cv' ? m.P3 : m.P3 + (m.P2 - m.P3) * w;
    v = samplerFor(c.look, 'pressure').at(x, tmp);
  }
  out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
  // capillarized sinusoids are drained toward the lobule's shade, never brighter (dullSinusoidInto)
  if (seg === 'sin' && c.fibSin > 0) {
    const f = 0.4 * clamp(c.fibSin, 0, 1), l = 0.299 * out[0] + 0.587 * out[1] + 0.114 * out[2];
    for (let i = 0; i < 3; i++) out[i] = out[i]! + (l + (SHADE[i]! - l) * 0.35 - out[i]!) * f;
  }
  return out;
}

/** Where across a vessel the three colour samples sit (-1 one wall, +1 the other): the tube's vertices take colours between them. */
export const LANE_X = [-0.67, 0, 0.67] as const;
const ORIGIN_COLS = originColours(), PASS_COLS = firstPassColours();
/** The hepatic artery's slot in the sources (blood.js: 0 SMV, 1 IMV, 2 SV, 3 HA, 4 systemic). */
const HA_SLOT = 3;

/** The colours of the blood's sources under Blood origin or First pass, in the lanes' order (the systemic remainder last). */
export const laneColours = (lens: 'origin' | 'firstpass'): readonly Rgb[] => (lens === 'origin' ? ORIGIN_COLS : PASS_COLS);
/** The shares of the blood's five sources (written into `out`, the four of the lens and the systemic remainder) at `w` along a lobule vessel under Blood origin or First pass:
 *  the one blend the lobule's lanes and the sinusoid's red cells (sinusoid/lens.ts) are both read from. */
export function laneShares(c: InkContext, seg: Seg, w: number, out: number[]): number[] {
  const lens = c.lens === 'firstpass' ? 'firstpass' : 'origin';
  const Ls = c.model.lanes, NONE: Lane = [[0, 0, 0, 0], [0, 0, 0, 0]], L: LaneSet = (lens === 'origin' ? Ls?.origin : Ls?.pass) ?? { pre: NONE, sin: NONE, post: NONE };
  // the blend at this place: the sinusoid's starts in the inlet's (w = 1, the portal end) and ends in the hepatic outflow's (w = 0); the inlets and the portal venule carry the inflow's
  const lane = seg === 'cv' ? L.post : seg === 'sin' ? L.sin : L.pre;
  const k = seg === 'sin' ? 1 - w : seg === 'in' ? w : 0;
  let sum = 0;
  for (let i = 0; i < 4; i++) { const v = clamp(lerp(lane[0][i] ?? 0, lane[1][i] ?? 0, k), 0, 1); out[i] = v; sum += v; }
  out[4] = Math.max(0, 1 - sum); out.length = 5;
  return out;
}

/** The blood's streams at a place under a stream lens, in the order they lie across the vessel: their colours and shares (into `out`). Blood origin: its five sources as they are.
 *  First pass: raw and cleared gut blood are ONE stream, the same blood before and after the sinusoids, its colour the share of it cleared so far (OKLab, raw to clear), so it turns
 *  smoothly from raw at the portal venule to clear at the central vein; the hepatic artery's and the systemic blood run beside it all the way (owner, 26 Nov). */
export function streamsOf(lens: 'origin' | 'firstpass', f: ArrayLike<number>, out: { cols: Rgb[]; w: number[] }): { cols: Rgb[]; w: number[] } {
  out.cols.length = 0; out.w.length = 0;
  if (lens === 'origin') { for (let i = 0; i < 5; i++) { out.cols.push(ORIGIN_COLS[i]!); out.w.push(f[i] ?? 0); } return out; }
  const gut = (f[0] ?? 0) + (f[1] ?? 0), k = gut > 1e-9 ? (f[1] ?? 0) / gut : 0;
  out.cols.push(clearing(k), PASS_COLS[3]!, PASS_COLS[4]!);
  out.w.push(gut, f[3] ?? 0, f[4] ?? 0);
  return out;
}
const STREAMS = { cols: [] as Rgb[], w: [] as number[] };
/** Gut blood a share `k` cleared (0 raw, 1 clear): raw's colour turning to clear's round the shorter way of the hue circle in OKLCh, lightness and colourfulness eased between the two, so the
 *  turn stays a clear colour all the way (a straight OKLab line between the orange and the teal passes through a muddy beige). */
export function clearing(k: number): Rgb {
  const a = toOklab(PASS_COLS[0]!), b = toOklab(PASS_COLS[1]!), t = Math.min(1, Math.max(0, k));
  const ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]), ha = Math.atan2(a[2], a[1]);
  let dh = Math.atan2(b[2], b[1]) - ha;
  if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
  const L = a[0] + (b[0] - a[0]) * t, C = ca + (cb - ca) * t, h = ha + dh * t;
  return fromOklab([L, C * Math.cos(h), C * Math.sin(h)]);
}

/** The colour (sRGB 0..1, into `out`) at `w` along a lobule vessel and `across` it (-1 one wall, +1 the other; 0 the middle, for a place with no side).
 *  Under Blood origin and First pass the blood's streams (streamsOf) lie side by side, each as wide as its share; under every other lens, and on an arteriole's twig, `inkAt`.
 *  The ONE rule the 3D lobule's vertices (micro3d/lobule3d.ts writeInk), the sinusoid's red cells and `inkLanes` are coloured by. `shares` may carry laneShares(c, seg, w) worked out. */
export function inkAcross(c: InkContext, seg: Seg, w: number, across: number, out: Rgb, shares?: ArrayLike<number>): Rgb {
  const lens = c.lens;
  if ((lens !== 'origin' && lens !== 'firstpass') || seg === 'art') return inkAt(c, seg, w, out);
  const st = streamsOf(lens, shares ?? laneShares(c, seg, w, []), STREAMS);
  let sum = 0; for (const v of st.w) sum += v;
  const a = Number.isFinite(across) && Math.abs(across) <= 1 ? across : 0, t = (a + 1) / 2 * sum;
  let acc = 0, pick = st.w.length - 1;
  for (let i = 0; i < st.w.length; i++) { acc += st.w[i]!; if (t <= acc && st.w[i]! > 0) { pick = i; break; } }
  const col = st.cols[pick]!;
  out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
  return out;
}

/** The three colours across a lobule vessel at `w` along it (written into `out`, 9 numbers), at LANE_X: `inkAcross` at three places. */
export function inkLanes(c: InkContext, seg: Seg, w: number, out: number[]): number[] {
  const shares = c.lens === 'origin' || c.lens === 'firstpass' ? laneShares(c, seg, w, []) : undefined;
  LANE_X.forEach((x, s) => {
    inkAcross(c, seg, w, x, tmp, shares);
    out[s * 3] = tmp[0]; out[s * 3 + 1] = tmp[1]; out[s * 3 + 2] = tmp[2];
  });
  return out;
}

const SIG_SEGS: readonly Seg[] = ['pv', 'in', 'sin', 'cv'];
const SIG_W = [0, 0.5, 1] as const;
/** A signature of every colour the lens gives the lobule now: the colours themselves (each segment at its ends and middle, to the 8 bits a screen shows) and, under the stream lenses, the
 *  shares. Whatever an input `inkAt`/`inkAcross` reads changes (a pressure, a flow, a reversal, the reference, the shares, the look), the signature changes with the colour, so the vertices
 *  are never left on an old one. (The 3D lobule's key had listed its inputs by hand and missed the flows, the reversals, the hepatic vein's pressure and the reference's values: Flow,
 *  Velocity, Direction, Drop and Change went stale.) */
export function inkSignature(c: InkContext): string {
  const q = (x: number) => Math.round(x * 255);
  const parts: (string | number)[] = [c.lens, c.look];
  for (const seg of SIG_SEGS) for (const w of SIG_W) { inkAt(c, seg, w, tmp); parts.push(q(tmp[0]), q(tmp[1]), q(tmp[2])); }
  if (c.lens === 'origin' || c.lens === 'firstpass') for (const seg of SIG_SEGS) for (const w of SIG_W) for (const v of laneShares(c, seg, w, [])) parts.push(q(v));
  return parts.join(',');
}
