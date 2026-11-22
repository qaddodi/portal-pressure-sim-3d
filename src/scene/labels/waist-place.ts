// The waist bracket's placing, pure (no three): see waist-bracket.ts.
/** How much of the bracket shows for a waist of `red` (the share of the lumen it takes): nothing under 0.4%, the whole from 3.4% (the card's picture: clamp((red - 0.004) / 0.03)). */
export const waistOn = (red: number): number => Math.min(1, Math.max(0, (red - 0.004) / 0.03));
/** The bar's own length at scale 1 (CSS px; the element is scaled to the span), the ticks' length and the gap between the stent's wall and the bracket. */
export const BAR = 100, TICK = 4, GAP = 5;

export interface BracketPlace { /** the bar's start (the end nearer `a`) and its angle and length */ x: number; y: number; angle: number; len: number; /** the two ticks' starts, each pointing back at the stent */ ta: { x: number; y: number }; tb: { x: number; y: number }; /** the tick's own angle (the direction toward the stent) */ tickAngle: number }
type Pt = { x: number; y: number };

/** Where the bracket stands for a waist from screen point `a` to `b` on the stent's axis, the stent's radius on the screen `r` there and `n` the unit screen normal (either way along it).
 *  It stands on the side that is up and a little to the left (the way the stent's label does not), one wall plus a gap off the axis. Null when the span is a point. */
export function placeBracket(a: Pt, b: Pt, r: number, n: Pt): BracketPlace | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y), nl = Math.hypot(n.x, n.y);
  if (!(len > 1) || !(nl > 1e-6) || !Number.isFinite(len + r)) return null;
  let ux = n.x / nl, uy = n.y / nl;
  if (-uy + -ux * 0.5 < 0) { ux = -ux; uy = -uy; }
  const d = Math.max(0, r) + GAP, sa = { x: a.x + ux * d, y: a.y + uy * d }, sb = { x: b.x + ux * d, y: b.y + uy * d };
  return { x: sa.x, y: sa.y, angle: Math.atan2(sb.y - sa.y, sb.x - sa.x), len, ta: sa, tb: sb, tickAngle: Math.atan2(-uy, -ux) };
}

