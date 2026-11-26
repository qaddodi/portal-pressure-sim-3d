// Scales and tick marks, the numbers every plot shares. Pure.

/** A linear map from a domain to a range (a range may run backwards: a y axis). */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v: number) => r0 + (v - d0) * k;
  f.inv = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  f.d = [d0, d1] as const; f.r = [r0, r1] as const;
  return f;
}
export type Scale = ReturnType<typeof linear>;




