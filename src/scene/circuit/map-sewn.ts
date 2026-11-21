// The ends of the network's own vessels (collaterals, shunts, stents) that no junction skin of the map welds: they are SUNK and FLARED on the map as 2D draws every end (circuit/map-ends.ts), the same profile the map's own tubes
// have (circuit/tubes.ts). A growing arm's end is ALWAYS sewn, whether or not a skin welds it: the tube is what grows (sunk and flared as the body's are, shunt-ends.ts) and the map's welded skin comes in over
// it from growth 0.9 to 1 (vessels/skin/plain.ts, circuit/skins.ts); a skin's seam ring is a ring of that sewn tube. An end with no skin (a node that is no junction) or whose arm the skin refuses (`MAP_DROPPED`, pinned against what the
// build drops by tests/circuit-skins.test.ts) keeps the tube's own end as well. The one end a skin takes whole is a PERMANENT arm's. Pure: it reads the inventory, never the skins. The profile is the vessel's `rkc` on the map (the radius share
// the vertex shader reads at circT = 1, vessels/shaders.ts), so the body's tube is untouched and nothing is done per frame.
import type { BufferGeometry } from 'three';
import { NETWORK_BY_ID, type NetVessel } from '../vessels/network.ts';
import { permanentEndsByNode } from '../vessels/skin/inventory.ts';
import { NETWORK } from '../vessels/network.ts';
import type { TubeRun } from '../vessels/tubes.ts';
import type { ShuntEnd } from '../vessels/shunt-ends.ts';
import { COURSES } from './course.ts';
import { circuitRadius, findCircuitJunctions } from './skins.ts';
import { ringShare, sunkEnd } from './map-ends.ts';

/** The arms a skin of the map refuses, as `CircuitSkinSet.dropped` names them (`node:vessel`), none now: REX and DIPS are welded (21 Nov, static full-size skins). They would keep a tube end, as every growing arm does. */
export const MAP_DROPPED: readonly string[] = [];

let welded: ReadonlySet<string> | null = null;
/** The ends (`vessel:end`) that are PERMANENT arms of a skin of the map: nothing grows there, the skin is the whole join. A growing arm's end is never one: its tube is what grows, so it is sunk and flared like every end the skin leaves (the welded skin comes in over it from growth 0.9 to 1, skin/plain.ts), whether or not a skin takes it. */
export function weldedEnds(): ReadonlySet<string> {
  if (welded) return welded;
  const s = new Set<string>();
  for (const j of findCircuitJunctions()) for (const a of j.arms) if (!a.grow) s.add(`${a.vesselId}:${a.end}`);
  return (welded = s);
}

/** The widest permanent vessel at a node, as a radius on the map (scene units); 0 where there is none. */
const trunkAt = (node: string): number => Math.max(0, ...(permanentEndsByNode(NETWORK).get(node) ?? []).map((e) => circuitRadius(e.v)));

/** A vessel's sewn ends on the map (null at an end a skin welds or that nothing meets), and its own radius there; null for a vessel with no sewn end. Collaterals, shunts and stents only: the trunk vessels run into one another. */
export function sewnEnds(def: NetVessel): { ends: readonly [ShuntEnd | null, ShuntEnd | null]; own: number } | null {
  if (!COURSES.has(def.id) || def.feeder || !(def.kind === 'collateral' || def.kind === 'shunt')) return null;
  const own = circuitRadius(def), w = weldedEnds();
  const end = (e: 0 | 1): ShuntEnd | null => (w.has(`${def.id}:${e}`) ? null : sunkEnd(trunkAt(e === 0 ? def.from : def.to) || own));
  const ends: readonly [ShuntEnd | null, ShuntEnd | null] = [end(0), end(1)];
  return ends[0] || ends[1] ? { ends, own } : null;
}

/** Lays the sewn ends of vessel `id` on the map's radius share (`rkc`) of its built geometry: every ring of every tube and the caps, multiplied by the share at its place along the MAP course. A no-op for a vessel with none. */
export function sewOnMap(id: string, g: BufferGeometry, runs: readonly TubeRun[]): void {
  const def = NETWORK_BY_ID.get(id), course = COURSES.get(id), rkc = g.getAttribute('rkc');
  const s = def && course && rkc ? sewnEnds(def) : null;
  if (!s || !course || !rkc) return;
  for (const run of runs) {
    const W = run.radial + 1;
    for (let i = 0; i <= run.tubular; i++) {
      const k = ringShare(s.ends, s.own, course.lenC, i / run.tubular);
      for (let j = 0; j < W; j++) { const v = run.tubeStart + i * W + j; rkc.setX(v, rkc.getX(v) * k); }
    }
    for (let cap = 0; cap < 2; cap++) {
      const k = ringShare(s.ends, s.own, course.lenC, cap);
      for (let q = 0; q < run.capCount; q++) { const v = run.capStart + cap * run.capCount + q; rkc.setX(v, rkc.getX(v) * k); }
    }
  }
  rkc.needsUpdate = true;
}
