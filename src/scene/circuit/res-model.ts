// The circuit's resistors, as numbers: the ratio each shows against the healthy liver, and how its zigzag is drawn from that ratio (width, heat colour, the widest line that still
// reads as teeth). A port of the 2D app's stage-resistors.js (resRatio, liverRes, resWidth, resWidthFit, resHeat); the sizes come from data.copied.ts (RES_SIZES). No DOM, no GPU.
import { EDGES, NODES, edgePresent } from '../../engine/hales/portal/topology.js';
import { RES_SIZES } from './data.copied.ts';

type Edge = { id: string; from: string; to: string; kind?: string };
const edges = EDGES as Edge[];
const EI: Record<string, number> = Object.fromEntries(edges.map((e, i) => [e.id, i]));
const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));

export type ResKey = 'rLiver' | 'rColl' | 'rGut';
export type ResKind = 'liver' | 'coll' | 'gut';
export const RES_KINDS: Readonly<Record<ResKey, ResKind>> = { rLiver: 'liver', rColl: 'coll', rGut: 'gut' };
export const RES_KEYS: readonly ResKey[] = ['rLiver', 'rColl', 'rGut'];

/** The pressures (mmHg a node) and flows (mL/s an edge) a ratio reads. */
export interface ResFrame { P: ArrayLike<number>; Q: ArrayLike<number> }

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const rOf = (P: ArrayLike<number>, Q: ArrayLike<number>, id: string): number => {
  const k = EI[id]!, e = edges[k]!;
  return (P[NI[e.from]!]! - P[NI[e.to]!]!) / Math.max(1e-6, Math.abs(Q[k]!));
};
// Resistance as dP / Q: the liver's lobes, each its venules, sinusoids and outflow in series, in parallel with each other.
const LOBES: readonly (readonly string[])[] = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];
const GUT_ART = ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'];

export function liverRes(P: ArrayLike<number>, Q: ArrayLike<number>): number {
  let g = 0;
  for (const ids of LOBES) { let r = 0; for (const id of ids) r += rOf(P, Q, id); g += 1 / Math.max(1e-6, r); }
  return 1 / g;
}

/**
 * The ratio a resistor shows against the healthy liver, or null when there is nothing to show (no healthy reference yet, or the collaterals are closed).
 * `now` is the frame on the figure, `healthy` the healthy patient at rest, `params` the patient's (which collaterals exist).
 */
export function resRatio(kind: ResKind, now: ResFrame, healthy: ResFrame | null, params: unknown): number | null {
  if (!healthy?.P || !healthy?.Q) return null;
  const r0 = liverRes(healthy.P, healthy.Q);
  const { P, Q } = now;
  // (The live frame breathes a few percent around the settled value, so a liver within 8% of the healthy one reads exactly x1.0, not x0.9 and x1.0 by turns.)
  if (kind === 'liver') { const r = liverRes(P, Q) / r0; return Math.abs(r - 1) < 0.08 ? 1 : r; }
  if (kind === 'gut') { let g = 0; for (const id of GUT_ART) g += 1 / Math.max(1e-6, rOf(P, Q, id)); return 1 / g / r0; }
  let qc = 0;
  for (const e of edges) if (e.kind === 'collateral' && edgePresent(e, params)) qc += Math.max(0, Q[EI[e.id]!]!);
  if (qc * 0.06 < 0.05) return null;
  return (P[NI.CONF!]! - P[NI.IVCS!]!) / qc / r0;
}

/** The reading's text: "x2.3" (one decimal under 10). */
export const resText = (ratio: number): string => '×' + (ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio)));

// ---- how the zigzag looks ----
const { amp: AMP, teeth: TEETH, outline: OUTLINE, w0: W0, w1: W1, wk: WK } = RES_SIZES;
const resLog = (r: number): number => Math.log2(Math.max(0.25, r || 1));
/** The line's width in px at ratio r: 2.5 at x1, 6.9 at x2, 11.3 at x4, 13 from x5.3. */
export const resWidth = (r: number): number => Math.round(clamp(W0 + WK * resLog(r), W0, W1) * 10) / 10;
/**
 * The widest the line may be on screen and still read as teeth (2D resWidthFit): its parallel strokes keep 2 px of black between their outlines, and a V fills no deeper than
 * 45% of the teeth's height. `len` the zigzag's length and `amp` its amplitude (map units), `scQ` px a map unit. Where that caps the line the range is drawn in proportion below it.
 */
export function resWidthFit(r: number, len: number, amp: number, scQ: number): number {
  const sp = len / TEETH, th = Math.atan2(2 * amp, sp);
  const capV = 1.8 * amp * scQ * Math.cos(th), capP = 2 * sp * Math.sin(th) * scQ - 2 * OUTLINE - 2;
  const cap = clamp(Math.min(W1, capV, capP), W0, W1), f = clamp(WK * resLog(r) / (W1 - W0), 0, 1);
  return Math.round((W0 + (cap - W0) * f) * 10) / 10;
}
/** How hot the colour runs, 0 (x1) to 1 (x4 and over), in twentieths. */
export const resHeat = (r: number): number => Math.round(clamp(resLog(r) / 2, 0, 1) * 20) / 20;

/** The line's colour on the ramp ok -> caution -> danger (each an [r, g, b] 0..1), at a heat. */
export function resInk(heat: number, ok: readonly number[], caution: readonly number[], danger: readonly number[], out: number[] = [0, 0, 0]): number[] {
  const a = heat < 0.5 ? ok : caution, b = heat < 0.5 ? caution : danger, u = heat < 0.5 ? heat * 2 : (heat - 0.5) * 2;
  for (let c = 0; c < 3; c++) out[c] = a[c]! + (b[c]! - a[c]!) * u;
  return out;
}

/** The amplitude a zigzag is drawn at: 9 map units, or enough to be at least 8 px on screen (`scQ` px a map unit). */
export const resAmp = (scQ: number): number => Math.max(AMP, RES_SIZES.minAmpPx / Math.max(1e-6, scQ));
/** The scale in px a map unit, stepped a quarter octave so a zoom rebuilds the zigzags a few times and not every frame. */
export const quantScale = (sc: number): number => 2 ** (Math.round(Math.log2(Math.max(1e-6, sc)) * 4) / 4);

/** A zigzag's points from (ax, ay) to (bx, by): n teeth of amplitude amp, written as [x0, y0, x1, y1 ...] (n + 2 points). */
export function zigzag(ax: number, ay: number, bx: number, by: number, n: number, amp: number): number[] {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, out = [ax, ay];
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, sgn = i % 2 ? -1 : 1; out.push(ax + dx * u + nx * amp * sgn, ay + dy * u + ny * amp * sgn); }
  out.push(bx, by);
  return out;
}

export { TEETH as RES_TEETH, OUTLINE as RES_OUTLINE };
