// Where each vessel's blood comes from (Blood origin, First pass) and how much oxygen it carries: the 2D app's blood.js passes over the
// network, ported. Blood mixes at every node weighted by inflow, nodes taken in the order blood reaches them. Pure and allocation-light
// (a few scratch arrays kept between calls); tests/lens-blood-model.test.ts holds them to the 2D module's results when PPS_2D_REPO is set.
import { EDGES, NODES } from '../../engine/hales/portal/topology.js';
import { FLOW_CUTS } from '../../engine/hales/portal/flow-cuts.js';

interface Edge { id: string; from: string; to: string; kind: string; zone?: string; tone?: string }
const edges = EDGES as Edge[];
const nodes = NODES as { id: string }[];
const NN = nodes.length, NE = edges.length;
const nodeIx = new Map(nodes.map((n, i) => [n.id, i]));
const EF = Int16Array.from(edges.map((e) => nodeIx.get(e.from) ?? -1));
const ET = Int16Array.from(edges.map((e) => nodeIx.get(e.to) ?? -1));

/** A flow under this (mL/s) has no direction of its own: it takes its upstream end's blend, always the same end (blood.js FLOW_FLOOR). */
export const FLOW_FLOOR = FLOW_CUTS.stillQ;
const isFwd = (q: number) => q > -FLOW_FLOOR;

/** The five named sources of the Blood origin lens, in the 2D app's order (blood.js ORIGINS); the sixth, systemic, is the remainder. */
export const ORIGIN_N = 4;
const SOURCE: Record<string, number> = { A_SMA: 0, A_LGA: 0, A_IMA: 1, A_SPL: 2, A_HEP: 3 };
const SOURCE_PASS: Record<string, number> = { A_SMA: 0, A_LGA: 0, A_IMA: 0, A_SPL: 0, A_HEP: 3 };
const cleans = (e: Edge) => e.kind === 'liver' && e.zone === 'sin';
export const ORIGIN_STEP_MIN = 0.01;

// ---- the passes' shared working ----
const flowTo = new Int16Array(NE);
const inAt = new Int32Array(NN + 2);
const inList = new Int32Array(NE);
const order = new Int16Array(NN);

function inflowLists(Q: ArrayLike<number>): void {
  inAt.fill(0);
  for (let k = 0; k < NE; k++) {
    if (edges[k]!.kind === 'wedge' || !(Math.abs(Q[k]!) > 1e-9)) { flowTo[k] = -1; continue; }
    const n = isFwd(Q[k]!) ? ET[k]! : EF[k]!;
    if (!(n >= 0)) { flowTo[k] = -1; continue; }
    flowTo[k] = n; inAt[n + 1]++;
  }
  for (let n = 0; n < NN; n++) inAt[n + 1]! += inAt[n]!;
  const fill = inAt.slice(0, NN + 1);
  for (let k = 0; k < NE; k++) if (flowTo[k]! >= 0) inList[fill[flowTo[k]!]!++] = k;
}

/** Nodes in the order blood reaches them: a node comes after every node a real flow into it leaves; a flow under the floor is a soft
 *  dependency that orders when it can and never decides a ring; a ring of real flows takes the highest pressure left (blood.js byFlow). */
function byFlow(Q: ArrayLike<number>, P: ArrayLike<number>): void {
  const fIn = new Int32Array(NN), fSoft = new Int32Array(NN), done = new Uint8Array(NN);
  const outs: { to: number; soft: boolean }[][] = Array.from({ length: NN }, () => []);
  for (let k = 0; k < NE; k++) {
    const t = flowTo[k]!;
    if (t < 0) continue;
    const src = t === ET[k] ? EF[k]! : ET[k]!;
    if (src < 0 || src === t) continue;
    const soft = !(Math.abs(Q[k]!) >= FLOW_FLOOR);
    if (soft) fSoft[t]!++; else fIn[t]!++;
    outs[src]!.push({ to: t, soft });
  }
  for (let x = 0; x < NN; x++) {
    let best = -1, soft = -1, ring = -1;
    for (let n = 0; n < NN; n++) {
      if (done[n]) continue;
      if (fIn[n] === 0) { if (fSoft[n] === 0) { best = n; break; } if (soft < 0) soft = n; }
      else if (ring < 0 || P[n]! > P[ring]!) ring = n;
    }
    const n = best >= 0 ? best : soft >= 0 ? soft : ring;
    order[x] = n; done[n] = 1;
    for (const o of outs[n]!) { if (o.soft) fSoft[o.to]!--; else fIn[o.to]!--; }
  }
}

export interface OriginResult {
  /** per edge: the blend along its own length (channel 0..3 fractions; the rest is systemic), ORIGIN_N per edge */
  own: Float32Array;
  /** per edge: the blend it ends in: its own (the junction's blend belongs to the vessel downstream, never back up its tributaries) */
  end: Float32Array;
}

/** Blood origin (pass = false) or First pass (pass = true) for a frame's signed flows Q (mL/s per edge) and node pressures P. */
export function originFractions(Q: ArrayLike<number>, P: ArrayLike<number>, pass = false, out?: OriginResult): OriginResult {
  const N = ORIGIN_N, SRC = pass ? SOURCE_PASS : SOURCE;
  const res = out ?? { own: new Float32Array(NE * N), end: new Float32Array(NE * N) };
  inflowLists(Q); byFlow(Q, P);
  const node = new Float64Array(NN * N), c = new Float64Array(N), sum = new Float64Array(N);
  const blendOf = (k: number) => {
    const s = SRC[edges[k]!.id];
    if (s != null) { for (let i = 0; i < N; i++) c[i] = i === s ? 1 : 0; return; }
    const n = isFwd(Q[k]!) ? EF[k]! : ET[k]!;
    for (let i = 0; i < N; i++) c[i] = node[n * N + i]!;
  };
  for (let x = 0; x < NN; x++) {
    const n = order[x]!;
    let w = 0; sum.fill(0);
    for (let p = inAt[n]!; p < inAt[n + 1]!; p++) {
      const k = inList[p]!, q = Math.abs(Q[k]!);
      blendOf(k);
      if (pass && cleans(edges[k]!)) { c[1]! += c[0]!; c[0] = 0; }
      w += q;
      for (let i = 0; i < N; i++) sum[i]! += q * c[i]!;
    }
    if (w > 0) for (let i = 0; i < N; i++) node[n * N + i] = Math.fround(sum[i]! / w);
  }
  for (let k = 0; k < NE; k++) {
    blendOf(k);
    for (let i = 0; i < N; i++) { res.own[k * N + i] = c[i]!; res.end[k * N + i] = c[i]!; }
    const e = edges[k]!;
    if (e.kind === 'wedge' || SRC[e.id] != null) continue;
    if (pass && cleans(e)) {
      // a sinusoid cleans its gut blood along its length: raw at the inlet, cleared at the outlet
      const raw = res.own[k * N]!;
      if (raw > 1e-4) { res.end[k * N + 1] = res.own[k * N + 1]! + raw; res.end[k * N] = 0; }
      continue;
    }
    // (a vessel keeps its own blood to its very end: the junction's blend begins in the vessel downstream, whose own blend it is. A tributary that took the blend over its last stretch
    //  read as its blood running back up into the others: the SMV's gut blood in the splenic vein, the splenic vein's spleen blood down the SMV. Mohammad, 20 Nov.)
  }
  return res;
}

// ---- oxygen ----
export const SAT = { artery: 0.98, gut: 0.85, systemic: 0.75 } as const;
export const LIVER_EXTRACTION = 0.25;
export const OXY_MIN = 0.6;
const consumes = (e: Edge) => e.kind === 'liver' && e.zone === 'sin';
const isArterial = (e: Edge) => e.kind === 'artery' || e.kind === 'arteriole';

export interface OxygenResult { node: Float32Array; /** per edge: saturation at its from end, and at its to end as drawn (a vein ends in its junction's blend) */ far: Float32Array }

export function oxygenSat(Q: ArrayLike<number>, P: ArrayLike<number>, out?: OxygenResult): OxygenResult {
  const res = out ?? { node: new Float32Array(NN), far: new Float32Array(NE * 2) };
  inflowLists(Q); byFlow(Q, P);
  const bed = new Float32Array(NN).fill(-1);
  for (let k = 0; k < NE; k++) {
    const e = edges[k]!;
    if (e.from === 'AO' && e.kind === 'arteriole') bed[ET[k]!] = e.tone === 'splanchnic' ? SAT.gut : SAT.systemic;
  }
  const node = res.node.fill(Math.fround(SAT.systemic));
  const ao = nodeIx.get('AO');
  if (ao != null) node[ao] = Math.fround(SAT.artery);
  const out1 = (u: number, k: number) => node[u]! * (consumes(edges[k]!) ? 1 - LIVER_EXTRACTION : 1);
  for (let x = 0; x < NN; x++) {
    const n = order[x]!;
    if (n === ao) continue;
    if (bed[n]! >= 0) { node[n] = Math.fround(bed[n]!); continue; }
    let w = 0, s = 0;
    for (let p = inAt[n]!; p < inAt[n + 1]!; p++) { const k = inList[p]!, q = Math.abs(Q[k]!); w += q; s += q * out1(isFwd(Q[k]!) ? EF[k]! : ET[k]!, k); }
    if (w > 0) node[n] = Math.fround(s / w);
  }
  for (let k = 0; k < NE; k++) {
    const e = edges[k]!, fwd = isFwd(Q[k]!), u = fwd ? EF[k]! : ET[k]!;
    const a = node[u]!, b = out1(u, k), lo = isArterial(e) ? a : b;
    let from = fwd ? a : lo, to = fwd ? lo : a;
    // a vein that does not consume ends in the blend of the junction it runs into, so the colour is continuous through every junction
    if (!consumes(e) && !isArterial(e) && e.kind !== 'wedge') { if (fwd) to = node[ET[k]!]!; else from = node[EF[k]!]!; }
    res.far[2 * k] = Math.fround(from); res.far[2 * k + 1] = Math.fround(to);
  }
  return res;
}
