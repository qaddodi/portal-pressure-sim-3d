// Types for junctions.js: the junction table and the pure cut that builds the engine's graph from it.
import type { NetEdge, NetNode } from './topology.js';

export interface JunctionRow {
  /** The junction's node id. */
  node: string;
  /** The vein it is on (an edge id of the uncut graph). */
  host: string;
  /** 0 to 1 along the host's drawn course from its `from` node. */
  at: number;
  label: string;
  /** The node's short name in a stent's course ("RPV → RHV"). */
  short: string;
  /** The shunt or collateral ends that meet the host here. */
  ends: [string, 'from' | 'to'][];
  /** Which piece of the host (in order from its `from` node) a clot or a narrowing of the host sits on; every row of a host agrees. */
  clotOn: 'first' | 'last';
}
export declare const JUNCTION_ROWS: readonly JunctionRow[];
export declare function cutGraph(baseNodes: readonly NetNode[], baseEdges: readonly NetEdge[], rows: readonly JunctionRow[]): {
  nodes: NetNode[];
  edges: NetEdge[];
  pieces: Record<string, string[]>;
  partOf: Record<string, string>;
  hostEnds: Record<string, [string, string]>;
  chains: { host: string; ids: string[]; nodes: string[]; at: number[]; taps: [string, 1 | -1][][] }[];
  listedEnds: Map<string, [string, string]>;
};
