// The shape a vessel is drawn at NOW, for anything that must lie IN it (a catheter's shaft, the sclerosant's column, an EUS coil). The routes and the glue's course are laid once on the vessels at REST (straight, strands at their
// rest spread), while a collateral is drawn at the shape its fill gives it (a curve that grows with the coil, strands that spread with the size): so the column ran straight where the shunt had curved off it, and the coil
// lay on the varix's invisible trunk, between its strands (Mohammad, 25 Nov: "they don't really follow the paths of what's drawn", "a coil in the air"). ShapeTracks reports each vessel's state when it rebuilds its tubes, and the devices read the
// same course back here, so there is one source for where a vessel is.
import { NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import type { Course } from './tubes.ts';

const states = new Map<string, ShapeState>();
const cache = new Map<string, Course[]>();
let version = 0;

/** A vessel's tubes were rebuilt at `state`: devices that follow it must follow the new course. */
export function reportShape(id: string, state: ShapeState): void {
  states.set(id, { ...state });
  cache.delete(id);
  version++;
}
/** Counts the reports: a device that drew at an older count lays itself again. */
export const liveShapeVersion = (): number => version;

/** The courses of vessel `id` as drawn now (REST until the scene has reported one). */
export function liveCourses(id: string): Course[] | null {
  const v = NETWORK_BY_ID.get(id);
  if (!v?.plan) return null;
  let c = cache.get(id);
  if (!c) { c = coursesOf(v, states.get(id) ?? REST); cache.set(id, c); }
  return c;
}
/** The widest course of vessel `id` as drawn now: a varix's widest strand (its trunk is not drawn), else the vessel's own. */
export function liveWidest(id: string): Course | null {
  const cs = liveCourses(id);
  if (!cs?.length) return null;
  let c = cs[0]!;
  for (const x of cs) if (x.radius > c.radius) c = x;
  return c.pts.length >= 2 ? c : null;
}
/** The vessel's own course (the first) as drawn now. */
export const liveMain = (id: string): Course | null => liveCourses(id)?.[0] ?? null;
