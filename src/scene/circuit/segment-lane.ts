// A segment is one lane on the Circuit's map (Mohammad, 22 Nov: the coronary vein to the azygos through the varices is ONE vessel): the engine's edges of one route (network.ts SEGMENT_OF) are drawn end to end, so what belongs to the
// lane as a whole (its resistor's zigzag, its caption, the clear room around them) belongs to the whole run, centred on it, and not to the half the engine happened to name it by (C1b).
import { SEGMENT_OF } from '../vessels/network.ts';
import { COURSES } from './course.ts';
import { CIRCUIT_COURSE_D } from './junction-cuts.ts';
import { courseOf } from './paths.ts';

type Pts = readonly (readonly [number, number])[];
/** The lane an edge belongs to: the id its caption and resistor are keyed by, the last edge of its segment (C1b for C1a and C1b), else its own. */
export const laneKeyOf = (id: string): string => { const s = SEGMENT_OF.get(id); return s ? s[s.length - 1]! : id; };
const own = (id: string): Pts | null => COURSES.get(id)?.mapPts ?? (CIRCUIT_COURSE_D[id] ? courseOf(CIRCUIT_COURSE_D[id]!) : null);
/** The map course of the lane `id` belongs to, in flow order: its own, or all of its segment's edges end to end (the shared station once). */
export function laneCourseOf(id: string): Pts | null {
  const seg = SEGMENT_OF.get(id);
  if (!seg) return own(id);
  const out: [number, number][] = [];
  for (const m of seg) {
    const p = own(m);
    if (!p) return own(id);
    for (let i = 0; i < p.length; i++) { const q = p[i]!, last = out[out.length - 1]; if (i === 0 && last && Math.hypot(last[0] - q[0], last[1] - q[1]) < 1e-6) continue; out.push([q[0], q[1]]); }
  }
  return out;
}
