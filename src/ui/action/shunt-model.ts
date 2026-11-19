// Add shunt (2D stage-hover.js startShunt / shuntDropOn), the part with no screen in it: which vessels a shunt from one vessel can reach, what a drop on each would make, and the change
// it makes. The rules are the 2D app's own (shunt-rules.copied.ts, cut out of stage-hover.js by scripts/copy-b11-stent.mjs); only the places they measure from are the 3D figure's:
// a vessel's middle and a station are read off the drawn courses (the same plane as the 2D figure, up to the one linear map, so every distance compares the same way).
import { EDGES } from '../../engine/hales/portal/topology.js';
import { NETWORK } from '../../scene/vessels/network.ts';
import { makeShuntRule, type ShuntRule } from './shunt-rules.copied.ts';
import type { Params } from './params.ts';

type E = { id: string; from: string; to: string; kind: string; label?: string };
const edges = EDGES as E[];
const EDGE_BY_ID = new Map(edges.map((e) => [e.id, e]));
const EI: Record<string, number> = Object.fromEntries(edges.map((e, i) => [e.id, i]));

/** Where things are, in one plane: a drawn vessel's middle (by arc length) and a station. */
export interface Places { drawn(id: string): boolean; mid(id: string): [number, number]; node(n: string): [number, number] }

/** The places of the 3D figure's drawn vessels (the course's x and y: the 2D figure's plane, mapped). */
export function figurePlaces(): Places {
  const mids = new Map<string, [number, number]>(), nodes = new Map<string, [number, number]>();
  for (const v of NETWORK) {
    const p = v.pts;
    if (!p.length) continue;
    let total = 0;
    for (let i = 1; i < p.length; i++) total += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1], p[i]![2] - p[i - 1]![2]);
    let at = 0, mid: [number, number] = [p[0]![0], p[0]![1]];
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1], p[i]![2] - p[i - 1]![2]);
      if (at + l >= total / 2 && l > 0) { const k = (total / 2 - at) / l; mid = [p[i - 1]![0] + (p[i]![0] - p[i - 1]![0]) * k, p[i - 1]![1] + (p[i]![1] - p[i - 1]![1]) * k]; break; }
      at += l;
    }
    mids.set(v.id, mid);
    if (!nodes.has(v.from)) nodes.set(v.from, [p[0]![0], p[0]![1]]);
    if (!nodes.has(v.to)) nodes.set(v.to, [p[p.length - 1]![0], p[p.length - 1]![1]]);
  }
  return { drawn: (id) => mids.has(id), mid: (id) => mids.get(id)!, node: (n) => nodes.get(n) ?? [0, 0] };
}

/** The vessels a shunt from `src` can be dropped on, each with what that would make (2D startShunt: every drawn vessel that is not an artery, a shunt or the liver's own, `only` limits the rule). */
export function shuntTargets(src: string, places: Places, only?: string | null): Map<string, ShuntRule> {
  const out = new Map<string, ShuntRule>();
  if (!places.drawn(src)) return out;
  const rule = makeShuntRule({ edgeOf: (id) => EDGE_BY_ID.get(id)!, nodePos: (n) => places.node(n), EI });
  const [wx, wy] = places.mid(src);
  for (const e of edges) {
    if (e.id === src || e.kind === 'artery' || e.kind === 'arteriole' || e.kind === 'shunt' || e.kind === 'liver' || !places.drawn(e.id)) continue;
    const [tx, ty] = places.mid(e.id);
    const r = rule(src, e.id, wx, wy, tx, ty);
    if (r && (!only || r.key === only)) out.set(e.id, r);
  }
  return out;
}

/** The change a drop makes (2D shuntDropOn): a TIPS or a DIPS switched on at its own diameter, a custom shunt at 10 mm, or the named operation; the History label, and the vessel it then selects. */
export function shuntChange(r: ShuntRule, p: Params): { edit: (q: Params) => Params; label: string; select: string } {
  const label = r.key === 'tips' ? 'TIPS' : r.key === 'dips' ? 'DIPS' : r.label;
  const select = r.key === 'tips' ? 'TIPS' : r.key === 'dips' ? 'DIPS' : r.key === 'custom' ? r.id! : ({ portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' } as Record<string, string>)[r.key]!;
  const edit = (q: Params): Params => {
    if (r.key === 'tips') q.tips = { ...q.tips, on: true, d: p.tips.d || 8 };
    else if (r.key === 'dips') q.dips = { ...q.dips, on: true, d: p.dips.d || 8 };
    else if (r.key === 'custom') q.customShunts = { ...(q.customShunts || {}), [r.id!]: 10 };
    else if (r.key === 'portocaval') { q.portocaval = true; q.portocavalSide = false; }
    else q[r.key] = true;
    return q;
  };
  return { edit, label, select };
}
