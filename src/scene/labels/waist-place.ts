// The waist bracket's placing, pure (no three): see waist-bracket.ts.
/** How much of the bracket shows for a waist of `red` (the share of the lumen it takes): nothing under 0.4%, the whole from 3.4% (the card's picture: clamp((red - 0.004) / 0.03)). */
export const waistOn = (red: number): number => Math.min(1, Math.max(0, (red - 0.004) / 0.03));
/** The ticks' length and the gap between the stent's wall and the bracket (CSS px). */
export const TICK = 4, GAP = 5;

type Pt = { x: number; y: number };
/** How many points along the stent's axis the bracket is drawn through (the bend of the TIPS tract is gentle; a dozen keeps the offset line smooth). */
export const CURVE_PTS = 12;

/** The bracket: its line (offset from the axis, one point per axis point) and each end's tick, from the stent's side to the line. */
export interface BracketCurve { line: Pt[]; ta: [Pt, Pt]; tb: [Pt, Pt] }

/** Where the bracket stands for a waist whose axis runs through the screen points `axis` (first to last: the stent's own curve, not the chord),
 *  the stent's radius on the screen `r` and `n` a unit screen normal at the middle (either way along it). Every point of the line stands one wall
 *  plus a gap off the axis along the axis's own local normal, so the bracket bends where the stent bends (it was a straight bar between the two
 *  ends and crossed the stent wall on a bend, Mohammad 26 Nov). It stands on the side that is up and a little to the left (the way the stent's
 *  label does not), the same side all along. The ticks point back at the stent. Null when the span is a point. */
export function placeCurve(axis: readonly Pt[], r: number, n: Pt): BracketCurve | null {
  const k = axis.length, a = axis[0], b = axis[k - 1], len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0, nl = Math.hypot(n.x, n.y);
  if (k < 2 || !(len > 1) || !(nl > 1e-6) || !Number.isFinite(len + r)) return null;
  let ux = n.x / nl, uy = n.y / nl;
  const flip = -uy + -ux * 0.5 < 0 ? -1 : 1;
  const d = Math.max(0, r) + GAP, line: Pt[] = [], norm: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const p = axis[Math.max(0, i - 1)]!, q = axis[Math.min(k - 1, i + 1)]!, tl = Math.hypot(q.x - p.x, q.y - p.y);
    // the local normal (the tangent turned a quarter), on the same side as the middle's; where the axis is still, the middle's own
    let vx = tl > 1e-9 ? -(q.y - p.y) / tl : ux, vy = tl > 1e-9 ? (q.x - p.x) / tl : uy;
    if (vx * n.x + vy * n.y < 0) { vx = -vx; vy = -vy; }
    vx *= flip; vy *= flip;
    norm.push({ x: vx, y: vy });
    line.push({ x: axis[i]!.x + vx * d, y: axis[i]!.y + vy * d });
  }
  const tick = (i: number): [Pt, Pt] => [{ x: line[i]!.x - norm[i]!.x * TICK, y: line[i]!.y - norm[i]!.y * TICK }, line[i]!];
  return { line, ta: tick(0), tb: tick(k - 1) };
}

/** The bracket's path as SVG text: the offset line, then each end's tick (a short stroke from the line toward the stent), to a tenth of a pixel. */
export function bracketPath(c: BracketCurve): string {
  const f = (p: Pt): string => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`;
  return `M${f(c.ta[0])}L${c.line.map(f).join('L')}M${f(c.tb[0])}L${f(c.tb[1])}`;
}
