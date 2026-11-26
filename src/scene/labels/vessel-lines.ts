// The figure's vessels as screen segments: what a name, a mark or a split reading keeps its words off
// ("names clear the tube edge", docs/HUMANIZED-DESIGN.md section 6). One reading of the scene's courses,
// for the label solver and for the figure's cards. Pure but for the projection it is given.
import type { Vector3 } from 'three';
import { figureCourses } from './stations.ts';
import type { NetVessel } from '../vessels/network.ts';

export type ScreenLine = [number, number, number, number];

/** Every vessel `drawn` says is on the figure (all of them when it is not given: collaterals and shunts only when it is), as segments of the course's sampled points. */
export function vesselLines(project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }, drawn?: (v: NetVessel) => boolean): ScreenLine[] {
  const lines: ScreenLine[] = [];
  for (const c of figureCourses()) {
    if (drawn ? !drawn(c.v) : c.v.kind === 'collateral' || c.v.kind === 'shunt') continue;
    let prev: { x: number; y: number } | null = null;
    for (const q of c.pts) {
      const a = project(q, { x: 0, y: 0 });
      const ok = Number.isFinite(a.x) && Number.isFinite(a.y);
      if (prev && ok) lines.push([prev.x, prev.y, a.x, a.y]);
      prev = ok ? { x: a.x, y: a.y } : null;
    }
  }
  return lines;
}
