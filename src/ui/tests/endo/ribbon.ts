// A ribbon along a path, shared by the scope's rivulet and its jet.
/** A ribbon along n points (P: flat x, y pairs), W[i] wide at each, as one closed outline (a tapered or swelling stream with no seams). */
export function ribbon(P: ArrayLike<number>, W: ArrayLike<number>, n: number): number[] {
  const out: number[] = [];
  for (let side = 0; side < 2; side++) {
    for (let s = 0; s < n; s++) {
      const i = side ? n - 1 - s : s, i0 = Math.max(0, i - 1) * 2, i1 = Math.min(n - 1, i + 1) * 2;
      const dx = P[i1]! - P[i0]!, dy = P[i1 + 1]! - P[i0 + 1]!, d = Math.hypot(dx, dy) || 1, w = W[i]! / 2;
      out.push(side ? P[i * 2]! + (dy / d) * w : P[i * 2]! - (dy / d) * w, side ? P[i * 2 + 1]! - (dx / d) * w : P[i * 2 + 1]! + (dx / d) * w);
    }
  }
  return out;
}

