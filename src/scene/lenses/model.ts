// The colour lenses: what colour each vessel wears under each lens, from an engine frame. The rules are the 2D app's (stage-tubes.js, colormap.js,
// blood.js); the ramps are copied from it per look (tokens.copied.ts). One vessel has two colours, at its upstream and downstream ends, and the
// GPU blends them along it; the Blood origin and First pass lenses instead give each vessel lanes (streams side by side) from fractions.
import { EDGES, NODES, PORTAL_TERRITORY } from '../../engine/hales/portal/topology.js';
import { dopplerVel, velNormal, velPos, flowReversed } from './vel-normal.copied.js';
import { LENS_SHARED, LENS_TOKENS, type LensTokens } from './tokens.copied.ts';
import { type Rgb, type Sampler, delta3, hexToRgb01, sampler } from './oklab.ts';
import { ORIGIN_N, OXY_MIN, originFractions, oxygenSat } from './blood-model.ts';
import type { LookId } from '../palette.ts';

/** The twelve lenses: the ten of the Layers menu, plus the two a deck asks for ('system', 'since'), and 'neutral' (Anatomy: no colouring). */
export const LENS_IDS = ['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen', 'origin', 'firstpass', 'system', 'since'] as const;
export type LensId = (typeof LENS_IDS)[number] | 'neutral';
export const DEFAULT_LENS: LensId = 'pressure';

interface Edge { id: string; from: string; to: string; kind: string; shunt?: string; zone?: string }
const edges = EDGES as Edge[];
const NE = edges.length;
const nodeIx = new Map((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const EF = Int16Array.from(edges.map((e) => nodeIx.get(e.from) ?? -1));
const ET = Int16Array.from(edges.map((e) => nodeIx.get(e.to) ?? -1));
export const edgeIndex = new Map(edges.map((e, i) => [e.id, i]));

// scales (colormap.js, main.js)
export const PRESSURE_MAX = 35;
export const FLOW_MIN = 0.02, FLOW_MAX = 6;
export const flowPos = (lpm: number) => Math.log10(Math.max(FLOW_MIN, lpm) / FLOW_MIN) / Math.log10(FLOW_MAX / FLOW_MIN);
export const HEAT_MAX = 15, DROP_MAX = 12, DELTA_RANGE = 12;
export const oxygenPos = (s: number) => Math.min(1, Math.max(0, (s - OXY_MIN) / (1 - OXY_MIN)));
export const MPS_TO_LPM = 0.06;

/** What the lenses read beside the live frame: the healthy patient (velocity's normal, reversal), and the pressures change and congestion count from. */
export interface LensContext {
  healthy: { Q: ArrayLike<number>; D: ArrayLike<number>; P?: ArrayLike<number> } | null;
  /** node pressures (mmHg) the Change and Congestion lenses count from: the healthy patient's, a pinned moment's, or a slide's. Null: no change shown. */
  ref: ArrayLike<number> | null;
}
export interface FrameLike { P: ArrayLike<number>; Pf?: ArrayLike<number>; Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> }

export type Mode = 0 | 1 | 2;
/** One lens, ready for the GPU: per edge two colours (rows of a W x 2 texture) and, for the stream lenses, lane boundaries. */
export interface LensData {
  lens: LensId;
  /** 0 = no colouring (the vessel keeps its tone), 1 = a colour at each end, 2 = lanes */
  mode: Mode;
  /** RGBA per edge per end: sRGB 0..1; a = 1 when the lens colours the vessel, 0 when it keeps its tone. Layout [end][edge][4]. */
  grad: Float32Array;
  /** Cumulative lane boundaries per edge per end (channels 0..3), [end][edge][4]; the fifth lane is the rest. Only mode 2 reads it. */
  lanes: Float32Array;
}
export const newLensData = (): LensData => ({ lens: 'neutral', mode: 0, grad: new Float32Array(NE * 2 * 4), lanes: new Float32Array(NE * 2 * 4) });

const samplers = new Map<string, Sampler>();
export const samplerFor = (look: LookId, name: keyof Pick<LensTokens, 'pressure' | 'flow' | 'velocity' | 'heat' | 'drop' | 'oxygen'>): Sampler => {
  const key = `${look}|${name}`;
  let s = samplers.get(key);
  if (!s) { s = sampler(LENS_TOKENS[look][name]); samplers.set(key, s); }
  return s;
};

const NEUTRAL: Rgb = hexToRgb01(LENS_SHARED.neutral);
export const originColours = (): Rgb[] => LENS_SHARED.origin.map(hexToRgb01);
/** The shader's five lane slots (blood.js FIRSTPASS): 0 raw, 1 cleared, 2 unused, 3 hepatic artery, 4 systemic. */
export const firstPassColours = (): Rgb[] => [LENS_SHARED.firstPassRaw, LENS_SHARED.firstPassClear, LENS_SHARED.origin[2], LENS_SHARED.origin[3], LENS_SHARED.origin[4]].map(hexToRgb01);

export function systemOf(e: Edge): 'pv' | 'ivc' | 'var' {
  if (e.shunt === 'rex') return 'pv';
  if (e.kind === 'collateral' || e.kind === 'shunt') return 'var';
  const portal = PORTAL_TERRITORY as Set<string>;
  return portal.has(e.from) || portal.has(e.to) ? 'pv' : 'ivc';
}

const put = (d: LensData, end: 0 | 1, k: number, c: Rgb, on = 1) => { const i = (end * NE + k) * 4; d.grad[i] = c[0]; d.grad[i + 1] = c[1]; d.grad[i + 2] = c[2]; d.grad[i + 3] = on; };
const putLane = (d: LensData, end: 0 | 1, k: number, cum: ArrayLike<number>, o: number) => { const i = (end * NE + k) * 4; for (let j = 0; j < 4; j++) d.lanes[i + j] = cum[o + j]!; };

/** Whether an edge is an artery (the lenses colour veins; an artery keeps its own colour, as in the 2D figure). */
export const isArtery = (k: number) => edges[k]!.kind === 'artery' || edges[k]!.kind === 'arteriole';

/** Fills `out` with `lens` for frame `f` in `look`. Returns `out`. */
export function computeLens(lens: LensId, f: FrameLike, look: LookId, ctx: LensContext, out: LensData = newLensData()): LensData {
  out.lens = lens; out.grad.fill(0); out.lanes.fill(0);
  out.mode = lens === 'neutral' ? 0 : lens === 'origin' || lens === 'firstpass' ? 2 : 1;
  if (lens === 'neutral') return out;
  const P = f.Pf ?? f.P, Q = f.Qf ?? f.Q, tok = LENS_TOKENS[look];
  const c: Rgb = [0, 0, 0];
  const pr = () => samplerFor(look, 'pressure'), refP = ctx.ref;
  const delta = (d: number) => delta3(hexToRgb01(LENS_SHARED.deltaLow), hexToRgb01(LENS_SHARED.deltaMid), hexToRgb01(LENS_SHARED.deltaHigh), d, DELTA_RANGE, c);
  const dropS = lens === 'drop' ? samplerFor(look, 'drop') : null, flowS = lens === 'flow' ? samplerFor(look, 'flow') : null;
  const velS = lens === 'velocity' ? samplerFor(look, 'velocity') : null, heatS = lens === 'heat' ? samplerFor(look, 'heat') : null;
  const oxy = lens === 'oxygen' ? oxygenSat(Q, P) : null, oxS = oxy ? samplerFor(look, 'oxygen') : null;
  const org = lens === 'origin' || lens === 'firstpass' ? originFractions(Q, P, lens === 'firstpass') : null;
  const palette = lens === 'origin' ? originColours() : firstPassColours();
  const sysCol = { pv: hexToRgb01(tok.trPv), ivc: hexToRgb01(tok.trIvc), var: hexToRgb01(tok.trVar) };
  const healthy = ctx.healthy as { Q: ArrayLike<number>; D: ArrayLike<number> } | null;
  const cum = new Float32Array(8), blend: Rgb = [0, 0, 0];
  for (let k = 0; k < NE; k++) {
    if (isArtery(k) || edges[k]!.kind === 'wedge') continue;
    const e = edges[k]!, a = EF[k]!, b = ET[k]!, P1 = a >= 0 ? P[a]! : 0, P2 = b >= 0 ? P[b]! : 0;
    const refA = refP && a >= 0 ? refP[a]! : null, refB = refP && b >= 0 ? refP[b]! : null;
    switch (lens) {
      case 'pressure': put(out, 0, k, pr().at(P1, [0, 0, 0])); put(out, 1, k, pr().at(P2, [0, 0, 0])); break;
      case 'drop': { const col = dropS!.at(Math.abs(P1 - P2) / DROP_MAX, [0, 0, 0]); put(out, 0, k, col); put(out, 1, k, col); break; }
      case 'direction': {
        const ref = healthy ? (healthy.Q[k] ?? 0) : 0;
        const col = hexToRgb01(flowReversed(Q[k]!, ref) ? tok.flowReversed : tok.flowNormal);
        put(out, 0, k, col); put(out, 1, k, col); break;
      }
      case 'flow': { const col = flowS!.at(flowPos(Math.abs(Q[k]!) * MPS_TO_LPM), [0, 0, 0]); put(out, 0, k, col); put(out, 1, k, col); break; }
      case 'velocity': {
        const norm = e.kind === 'liver' ? null : velNormal(k, f, healthy);
        const col = norm ? velS!.at(velPos(dopplerVel(f, k), norm), [0, 0, 0]) : NEUTRAL;
        put(out, 0, k, col); put(out, 1, k, col); break;
      }
      case 'oxygen': put(out, 0, k, oxS!.at(oxygenPos(oxy!.far[2 * k]!), [0, 0, 0])); put(out, 1, k, oxS!.at(oxygenPos(oxy!.far[2 * k + 1]!), [0, 0, 0])); break;
      case 'heat': {
        const s = heatS!;
        put(out, 0, k, s.at(refA == null ? 0 : Math.max(0, P1 - refA) / HEAT_MAX, [0, 0, 0])); put(out, 1, k, s.at(refB == null ? 0 : Math.max(0, P2 - refB) / HEAT_MAX, [0, 0, 0])); break;
      }
      case 'system': { const col = sysCol[systemOf(e)]; put(out, 0, k, col); put(out, 1, k, col); break; }
      case 'delta': case 'since':
        put(out, 0, k, delta(refA == null ? 0 : P1 - refA).slice() as Rgb); put(out, 1, k, delta(refB == null ? 0 : P2 - refB).slice() as Rgb); break;
      case 'origin': case 'firstpass': {
        // lanes: cumulative shares of the four named sources; the rest is systemic (the fifth colour). The vessel's plain colour is the blend, for a reader without lanes.
        for (let j = 0; j < 4; j++) { cum[j] = org!.own[k * ORIGIN_N + j]!; cum[4 + j] = org!.end[k * ORIGIN_N + j]!; }
        for (let end = 0; end < 2; end++) {
          let run = 0; const o = end * 4, cs = [0, 0, 0, 0];
          blend[0] = blend[1] = blend[2] = 0;
          for (let j = 0; j < 4; j++) { const v = cum[o + j]!; run += v; cs[j] = Math.min(1, run); for (let i = 0; i < 3; i++) blend[i]! += v * palette[j]![i]!; }
          const rest = Math.max(0, 1 - run); for (let i = 0; i < 3; i++) blend[i]! += rest * palette[4]![i]!;
          put(out, end as 0 | 1, k, blend.slice() as Rgb); putLane(out, end as 0 | 1, k, cs, 0);
        }
        break;
      }
    }
  }
  return out;
}

/** The colour a vessel wears under a lens at one end (0 upstream, 1 downstream), as sRGB 0..1; null when it keeps its tone. For tests and labels. */
export function lensColourAt(d: LensData, id: string, end: 0 | 1): Rgb | null {
  const k = edgeIndex.get(id);
  if (k == null) return null;
  const i = (end * NE + k) * 4;
  return d.grad[i + 3]! > 0 ? [d.grad[i]!, d.grad[i + 1]!, d.grad[i + 2]!] : null;
}
export const LENS_EDGE_COUNT = NE;
