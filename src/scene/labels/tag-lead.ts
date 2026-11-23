// The leader of a label tag, as pure maths (no DOM): a line from the nearest edge of the words' box to the point they name, stopping short of a vessel's near wall.
// Everything on the figure that reads a number or a word (a station name, a mark, a caliper's reading, a bracket's, the catheter's readings, the HVPG stack) is a tag:
// words with a halo, and where the words stand away from what they name, a thin leader (and a dot where it names a point that is no vessel). There is no card, no
// pointer and no box on the figure to draw a speech bubble with (Mohammad, 22 and 23 Nov): nothing in this folder builds one.

/** A leader from the edge of a label's box to the point it names: it starts on the nearest point of the box and ends at the point. null when the point stands in the box or against it. */
export function boxLeader(box: { x: number; y: number; w: number; h: number }, to: { x: number; y: number }): [number, number, number, number] | null {
  const fx = Math.min(Math.max(to.x, box.x), box.x + box.w), fy = Math.min(Math.max(to.y, box.y), box.y + box.h);
  return Math.hypot(to.x - fx, to.y - fy) < 3 ? null : [fx, fy, to.x, to.y];
}

/** A leader that ends on a vessel stops at the vessel's near edge, not on its axis (plan 21): its screen half width (along the line, which meets the tube at an angle: half / sin, never more than
 *  3.3 half) plus 1 px of air, so the line never crosses the tube and needs no dot. Null when nothing is left of it. `t` is the vessel's unit direction on the screen. */
export const LEAD_AIR = 1;
export function leaderToEdge(seg: [number, number, number, number], half: number, t: { x: number; y: number }): [number, number, number, number] | null {
  const dx = seg[2] - seg[0], dy = seg[3] - seg[1], len = Math.hypot(dx, dy);
  if (len <= 0) return null;
  const sin = Math.abs((dx / len) * t.y - (dy / len) * t.x), back = Math.min(half / Math.max(sin, 0.3), half * 3.3) + LEAD_AIR;
  if (len - back <= 0.5) return null;
  return [seg[0], seg[1], seg[2] - (dx / len) * back, seg[3] - (dy / len) * back];
}

/** A leader that stops `air` px short of its end (a caliper's tick, a bracket's middle: the line never touches the mark it names). null when nothing is left of it. */
export function leaderShort(seg: [number, number, number, number], air = LEAD_AIR): [number, number, number, number] | null {
  const dx = seg[2] - seg[0], dy = seg[3] - seg[1], len = Math.hypot(dx, dy);
  if (len - air <= 0.5) return null;
  return [seg[0], seg[1], seg[2] - (dx / len) * air, seg[3] - (dy / len) * air];
}
