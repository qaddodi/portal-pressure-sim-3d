// What the junction skins did NOT weld (the inspector's "Joins report", src/ui/debug/inspect): the growing arms a skin left out (`SkinSet.dropped`, "NODE:VESSEL"), the nodes that kept today's tube joins (`fellBack`), and every tube END that meets other tubes
// at a node but is not covered by a skin, with where it is, so the panel can mark it in the figure. Pure: the network, the skins' answers and the shape states come in as arguments, so a Node test runs it on the real network with no scene.
//
// An end counts as UNWELDED when (a) it is not skinned (`endsOf`), (b) it is not the tip of a through vein (`cutEnd`: that end is no node of the figure), and (c) it really joins something: a collateral or a shunt always does (it grows from a host),
// a permanent tube does when two or more other permanent tubes end at its node (a run-on pair, with or without a collateral or shunt landing on it, is joined by the tubes' own mates and taper, not by a skin, so it is not listed).
import { NETWORK, cutEnd, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { GROWER_KINDS } from './inventory.ts';
import type { Vec3 } from './types.ts';

export type UnweldedWhy =
  /** a skin was built at the node and left this arm out (named in `SkinSet.dropped`): too far from the node's centre, or the skin failed with it */
  | 'dropped'
  /** the node's skin could not be built (or the art spaces its arms too far apart): every tube there keeps today's joins */
  | 'fell-back'
  /** a collateral drawn as strands (C1a, C2, C4, C7, C8): it has no tube of its own and never takes part in a skin */
  | 'braid'
  /** a collateral or shunt that is not an arm of any skin (over the cap of SKIN_GROWERS a node, or a landing on a host's side): the fork method */
  | 'fork'
  /** a permanent tube at a node of three or more that has no skin */
  | 'no-skin';

export interface UnweldedEnd { id: string; end: 0 | 1; node: string; why: UnweldedWhy; kind: string; radius: number; pos: Vec3 }
export interface JoinsReport {
  /** the nodes that have a skin now */
  built: readonly string[];
  /** arms a skin left out, by node and vessel */
  dropped: readonly { node: string; id: string }[];
  fellBack: readonly string[];
  circuitFellBack: readonly string[];
  unwelded: readonly UnweldedEnd[];
}

/** Why a reason is what it is, in words for the panel. */
export const WHY_TEXT: Readonly<Record<UnweldedWhy, string>> = {
  dropped: 'left out of its node\'s skin',
  'fell-back': 'its node\'s skin could not be built',
  braid: 'a braid of strands (no tube, no skin)',
  fork: 'not an arm of any skin (fork method)',
  'no-skin': 'a junction with no skin',
};
/** The marker colour of each reason, '#rrggbb'. */
export const WHY_COLOUR: Readonly<Record<UnweldedWhy, string>> = { dropped: '#ff3b30', 'fell-back': '#ff9500', braid: '#af52de', fork: '#ffd60a', 'no-skin': '#00c7ff' };

/** "NODE:VESSEL" as `SkinSet.dropped` lists it (a node's name has no colon; a vessel's id may). */
export function splitDropped(s: string): { node: string; id: string } {
  // (a key is `${node}:${vessel}`; a vessel id may hold a colon (a fork child, `~F:b`), so the node ends at the first colon, except a wall node, `wall:<host>:<arm><end>,...`, which holds two)
  let i = s.indexOf(':');
  if (s.startsWith('wall:')) { const j = s.indexOf(':', 5), k = j < 0 ? -1 : s.indexOf(':', j + 1); i = k; }
  return i < 0 ? { node: '', id: s } : { node: s.slice(0, i), id: s.slice(i + 1) };
}

/** Whether `key` (a `dropped` entry) names the end `end` of vessel `id` at the real node `node`: either its own node, or a wall node (wall.ts: a virtual node on a host's side wall, `wall:<host>:<arm><end>,...`) that lists that very end. */
export const droppedAt = (key: string, node: string, id: string, end: 0 | 1): boolean => {
  const k = splitDropped(key);
  return k.id === id && (k.node === node || (k.node.startsWith('wall:') && (k.node.split(':').pop() ?? '').split(',').includes(`${id}${end}`)));
};

export interface ReportInput {
  network?: readonly NetVessel[];
  endsOf: (id: string) => readonly [boolean, boolean];
  dropped: readonly string[];
  fellBack: readonly string[];
  /** the shape state of a vessel now (its drawn course); the rest course where unknown */
  stateOf?: (id: string) => ShapeState | undefined;
}

const isBraid = (v: NetVessel): boolean => v.plan?.kind === 'coil' && !!v.plan.strands;
const isFeeder = (v: NetVessel): boolean => !!v.feeder || v.id.includes('~F');

/** Every tube end that meets other tubes and is not welded, with the reason and the end's place (the first or last point of the vessel's main course as drawn). */
export function unweldedEnds(inp: ReportInput): UnweldedEnd[] {
  const network = inp.network ?? NETWORK;
  const at = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of network) {
    if (isFeeder(v)) continue;
    for (const [node, end] of [[v.from, 0], [v.to, 1]] as const) { const a = at.get(node) ?? []; a.push({ v, end }); at.set(node, a); }
  }
  const fell = new Set(inp.fellBack);
  const out: UnweldedEnd[] = [];
  for (const [node, ends] of at) {
    for (const { v, end } of ends) {
      if (cutEnd(v.id) === end) continue;
      if (inp.endsOf(v.id)[end]) continue;
      const grows = GROWER_KINDS.has(v.kind);
      const others = ends.filter((x) => x !== ends.find((y) => y.v === v && y.end === end) && !GROWER_KINDS.has(x.v.kind)).length;   // (the permanent tubes that end here too: a pair is a run-on, joined by the tubes' own mates and taper)
      if (!grows && others < 2) continue;
      const why: UnweldedWhy = inp.dropped.some((d) => droppedAt(d, node, v.id, end)) ? 'dropped' : fell.has(node) ? 'fell-back' : grows ? (isBraid(v) ? 'braid' : 'fork') : 'no-skin';
      const pts = coursesOf(v, inp.stateOf?.(v.id) ?? REST)[0]?.pts as readonly Vec3[] | undefined;
      const p = pts?.[end ? pts.length - 1 : 0];
      if (!p) continue;
      out.push({ id: v.id, end, node, why, kind: v.kind, radius: v.radius, pos: [p[0], p[1], p[2]] });
    }
  }
  return out;
}

/** The whole report. */
export function joinsReport(inp: ReportInput & { built: readonly string[]; circuitFellBack: readonly string[] }): JoinsReport {
  return { built: inp.built, dropped: inp.dropped.map(splitDropped), fellBack: [...inp.fellBack], circuitFellBack: [...inp.circuitFellBack], unwelded: unweldedEnds(inp) };
}
