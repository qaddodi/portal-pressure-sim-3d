// Vessels live (the editor only). A tube cannot be rebuilt cheaply (its geometry carries the joins, skins, flow marks and the lens's data), so while a vessel is being edited the real tubes of the
// affected vessels fade to 30% and their edited centrelines are drawn over them as thick dotted lines (overlay.ts). The centreline is what Save builds: the same plan, the same easing and radius
// (vessel-apply.ts with vessel-plan.ts's radius), depth from the built course plus the draft's change in dz. Attached parts (labels, clots, catheter, scope) follow on Save.
import { EDGES, dMinOf } from '../../../engine/hales/portal/topology.js';
import { EDGE_PATH_2D } from '../../../scene/vessels/paths.copied.ts';
import { type Edge, widthPx } from '../../../scene/vessels/width.ts';
import { x3, y3 } from '../../../scene/frame2d.ts';
import { applyVesselOverrides, dzAt, hasEdits } from '../../../editor/vessel-apply.ts';
import type { Overrides, V3 } from '../../../editor/types.ts';
import { pointAt } from './source.ts';

const byId = new Map((EDGES as Edge[]).map((e) => [e.id, e]));
const radiusOf = (id: string): number => { const e = byId.get(id); return e ? widthPx(e, e.d ?? e.dMax ?? (dMinOf(e) || 3)) / 2 : 0; };
type Plan = Record<string, readonly (readonly [number, number])[]>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface LiveVessel { id: string; from: string; to: string; course: readonly V3[] }
/** The vessels whose edit differs between the draft and what the page was built with, each as its centreline under the draft (scene units, the body's frame). */
export function liveCourses(now: Overrides, loaded: Overrides, vessels: readonly LiveVessel[]): Map<string, V3[]> {
  const out = new Map<string, V3[]>();
  for (const v of vessels) {
    const e = byId.get(v.id), base = (EDGE_PATH_2D as Plan)[v.id];
    if (!e || !base || base.length < 2) continue;
    if (same(now.nodes?.[v.from], loaded.nodes?.[v.from]) && same(now.nodes?.[v.to], loaded.nodes?.[v.to]) && same(now.vessels?.[v.id], loaded.vessels?.[v.id])) continue;
    if (!hasEdits(now, e) && !hasEdits(loaded, e)) continue;
    const opts = { radius: radiusOf(v.id) }, rn = applyVesselOverrides(e, base, now, opts), rl = applyVesselOverrides(e, base, loaded, opts), n = rn.path.length;
    // (u by the plan's arc length, as vessel-apply.ts reads it: the samples are not evenly spaced, and an index share would drift from the saved result)
    const arc = [0]; for (let i = 1; i < base.length; i++) arc.push(arc[i - 1]! + Math.hypot(base[i]![0] - base[i - 1]![0], base[i]![1] - base[i - 1]![1]));
    const total = arc[arc.length - 1] || 1;
    out.set(v.id, rn.path.map((p, i): V3 => {
      const u = n > 1 ? arc[i]! / total : 0;
      return [x3(p[0]), y3(p[1]), pointAt(v.course, u)[2] + (rn.dz ? dzAt(rn.dz, u) : 0) - (rl.dz ? dzAt(rl.dz, u) : 0)];
    }));
  }
  return out;
}

/** Points along a polyline, about `step` apart (at most `cap`): what the thick dotted line is drawn from. */
export function dotted(course: readonly V3[], step = 0.012, cap = 600): V3[] {
  const out: V3[] = [];
  for (let i = 1; i < course.length; i++) {
    const a = course[i - 1]!, b = course[i]!, len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k && out.length < cap; j++) { const t = j / k; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  if (course.length && out.length < cap) out.push(course[course.length - 1]!);
  return out;
}
