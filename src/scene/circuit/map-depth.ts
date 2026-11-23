// The Circuit's lines lie on one plate, so where two cross there has been no over and under (the depth tied; the draw order decided). Each line gets its own depth on the plate, in the order the body's tiers give
// (frame2d.ts TIER_Z: the same over and under as the Anatomy), the thinner of two of one tier over the thicker, so a crossing shadow (cel-ink.ts SHADOW) has a front line to fall from. The shader applies it as a depth
// offset only (vessels/shaders.ts mapDepth, scaled by the Circuit's share), and the tube's own bulge in depth goes with the same share (a flat line has none): no vertex moves, so the courses, the skins and the labels stay exactly where they were.
//
// The map-only tubes are on the plate too (circuit/tubes.ts): the liver's 24 branches and the caudate lane. They had no depth of their own (every one stood at 0, behind the whole plate, and tied with each other), so where two overlapped
// (every fork, every rejoining, the hair of overlap where a portal venule runs on into a sinusoid branch) the winner of each pixel was decided by rounding, which flickered. Now every branch stands in front of the tube it leaves AND the tube it
// reaches (the branch's own fill covers the host's wall line at the mouth, which is what the union's outline is), a sinusoid branch in front of the portal venule it runs on from (downstream over upstream), and every line a depth of its own.
import { MAPPED } from '../vessels/network.ts';
import { TIER_Z } from '../frame2d.ts';
import { MAP_DEPTH_STEP } from '../vessels/cel-ink.ts';
import { CIRCUIT_TREES } from './data.copied.ts';
import { treeEndHost, treeHost } from './tree-hosts.ts';

/** The plate's lines, back to front: the caudate lane first (it has always stood behind the rest), then the network's vessels in the body's tier order, with each liver branch inserted right after the latest of the tubes it must stand in front of. */
export function mapOrder(): string[] {
  const seq: string[] = ['CAUD', ...[...MAPPED].sort((a, b) => TIER_Z[a.tier] - TIER_Z[b.tier] || b.radius - a.radius || (a.id < b.id ? -1 : 1)).map((v) => v.id)];
  let pending = Object.entries(CIRCUIT_TREES).flatMap(([lane, list]) => list.map((_, i) => ({ id: `${lane}#${i}`, lane, i })));
  while (pending.length) {
    const next: typeof pending = [];
    for (const t of pending) {
      const preds = [treeHost(t.lane, t.i)?.host, treeEndHost(t.lane, t.i)?.host].filter((h): h is string => !!h);
      const at = preds.map((p) => seq.indexOf(p));
      if (at.some((k) => k < 0)) { next.push(t); continue; }   // (a tube that is itself still to be placed: it comes in a later round)
      seq.splice(Math.max(-1, ...at) + 1, 0, t.id);
    }
    if (next.length === pending.length) throw new Error(`liver branches whose hosts cannot be ordered: ${next.map((t) => t.id).join(', ')}`);
    pending = next;
  }
  return seq;
}
const order = mapOrder();
const depth = new Map(order.map((id, i) => [id, i * MAP_DEPTH_STEP]));
/** How far toward the viewer a vessel's line stands on the Circuit's plate, scene units (0 for a part with no map course). */
export const mapDepthOf = (id: string): number => depth.get(id) ?? 0;
/** The same for a map-only tube: a liver branch (`PRE_R#0`) or the caudate lane (`CAUD`). */
export const mapDepthOfTube = (id: string): number => depth.get(id) ?? 0;
