// WHICH ENGINE PIECES MAKE UP EACH WHOLE VESSEL, read from the engine's junction table and never written by hand (27 Nov: "the flow lens, pressure, flow direction and everything else
//  must know where vessel
// junctions really are"). The engine cuts a vein into pieces in series wherever a collateral or a shunt joins it part-way along (topology.js JUNCTION_ROWS, JUNCTION_PIECES), so the pieces
//  a vessel has, their ids and
// their order change when a row is added to that table. A list of piece ids written in the app (`IVC_IS_1`, `PVH_L_1`) went stale at the first new row, and a piece's suffix says
//  nothing about where it lies
// (the left portal vein's `PVH_L_1` was its last piece until the paraumbilical vein and the Meso-Rex bypass each cut it, and is its second of four now). So the app names a HOST (an
//  engine edge between two real
// nodes: `IVC_IS`, `PVH_L`) and asks this file for its pieces. Lint rule `piece-id-literal` (scripts/lint-rules.mjs) keeps a literal `_<n>` piece id out of the source;
//  tests/lint-rules.test.ts pins it, and tests/junction-ends.test.ts pins that every end of the table lands on the pieces this file names.
// Pure data, no three.js.
import { EDGES, JUNCTION_CHAINS, JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';

interface Edge { id: string; from: string; to: string }
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));
const PIECES = JUNCTION_PIECES as Record<string, readonly string[]>;

/** The pieces of host edge `host`, in flow order (the host's `from` end first): just `[host]` for a vein nothing joins part-way along. */
export const piecesOf = (host: string): readonly string[] => PIECES[host] ?? [host];
/** The piece of `host` its flow starts in. */
export const firstPieceOf = (host: string): string => piecesOf(host)[0]!;
/** The piece of `host` its flow ends in. */
export const lastPieceOf = (host: string): string => { const p = piecesOf(host); return p[p.length - 1]!; };
/** The piece of `host` that ends at `node` (the host's own end node, or a junction node on it). Throws when `node` is not one of its nodes. */
export function pieceEndingAt(host: string, node: string): string {
  const id = piecesOf(host).find((p) => edgeById.get(p)!.to === node);
  if (!id) throw new Error(`${host} has no piece ending at ${node}`);
  return id;
}
/** The piece of `host` that starts at `node`. */
export function pieceStartingAt(host: string, node: string): string {
  const id = piecesOf(host).find((p) => edgeById.get(p)!.from === node);
  if (!id) throw new Error(`${host} has no piece starting at ${node}`);
  return id;
}
/** The piece of `host` that the share `u` of its way (0 to 1, the table's own measure) falls in: where a vein's middle is, for a label that hangs on its middle. */
export const pieceAtShare = (host: string, u: number): string => {
  const chain = (JUNCTION_CHAINS as { host: string; at: number[] }[]).find((c) => c.host === host), ps = piecesOf(host);
  return chain ? ps[chain.at.filter((a) => a <= u).length]! : ps[0]!;
};
/** The host edge a piece belongs to (its own id for a vein nothing joins part-way along, a collateral or a shunt). */
export const hostOf = (piece: string): string => { for (const [h, ps] of Object.entries(PIECES)) if (ps.includes(piece)) return h; return piece; };

/** Each whole placed vessel (the placement's key) and the host edges it runs through, in flow order. The only hand-written part: where a vessel's real nodes are is the engine's own topology. */
export const WHOLE_HOSTS: Readonly<Record<string, readonly string[]>> = {
  ivc: ['ILI_IVC', 'IVC_IS', 'IVCS_RA'], svc: ['V_UP', 'SVC_RA'], azygos: ['C9', 'AZY_SVC'], rhv: ['RHV_IVC'], mhv: ['MHV_IVC'], lhv: ['LHV_IVC'], lrv: ['V_KID_L', 'LRV_IVC'],
  pv: ['PV_TRUNK'], rpv: ['PVH_R'], lpv: ['PVH_L'], sv: ['V_SPL', 'SV_MID', 'SV_CONF'], smv: ['V_INT', 'SMV_CONF'], imv: ['V_COL', 'V_IMV'], lgv: ['LGV_CONF'],
  ha: ['A_HEP'], rha: ['A_HR'], lha: ['A_HL'],
};
/** Whole vessel -> its engine pieces in flow order: every host's pieces, end to end. */
export const WHOLE_PIECES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(WHOLE_HOSTS).map(([w, hosts]) => [w, hosts.flatMap((h) => piecesOf(h))]),
);
/** Each engine edge that is a stretch of a whole placed vessel -> that whole. */
export const WHOLE_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(WHOLE_PIECES).flatMap(([w, ps]) => ps.map((p) => [p, w])));
